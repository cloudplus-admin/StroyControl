import { ApiClient } from './api';
import { AppData, QueueItem } from './domain';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const retryDelayMs = (attempts: number) => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts - 1));

export async function syncQueue(data: AppData, api: ApiClient, now = Date.now()): Promise<AppData> {
  const queue: QueueItem[] = [];
  let defects = data.defects;
  const defectIds = new Map<string, string>();
  for (const originalItem of data.queue) {
    const item = defectIds.has(originalItem.entityId) ? { ...originalItem, entityId: defectIds.get(originalItem.entityId)! } : originalItem;
    if (item.status === 'conflict' || (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > now)) { queue.push(item); continue; }
    if (item.type === 'defect.created') {
      const defect = defects.find((candidate) => candidate.id === item.entityId);
      const userId = api.getSession()?.user?.id;
      if (!defect || !userId) { queue.push(item); continue; }
      try {
        const response = await api.request(`/api/objects/${encodeURIComponent(defect.projectId)}/defects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey },
          body: JSON.stringify({ reportedBy: userId, description: defect.title }),
        });
        if (response.status === 409) { queue.push({ ...item, status: 'conflict', lastError: 'sync_idempotency_conflict' }); continue; }
        if (response.status === 401) { queue.push({ ...item, status: 'failed', lastError: 'sync_session_expired' }); continue; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const created = await response.json() as { id: string; status: string; createdAt: string };
        defects = defects.map((candidate) => candidate.id === item.entityId ? { ...candidate, id: created.id, createdAt: created.createdAt } : candidate);
        defectIds.set(item.entityId, created.id);
        continue;
      } catch (error) {
        const attempts = item.attempts + 1;
        queue.push({ ...item, status: 'failed', attempts, lastError: error instanceof Error ? error.message : 'sync_network_error', nextAttemptAt: new Date(now + retryDelayMs(attempts)).toISOString() });
        continue;
      }
    }
    if (item.type === 'defect.updated') {
      const defect = defects.find((candidate) => candidate.id === item.entityId);
      if (!defect) { queue.push(item); continue; }
      const status = defect.status === 'fixing' ? 'in_progress' : defect.status === 'review' ? 'verified' : defect.status;
      try {
        const response = await api.request(`/api/defects/${encodeURIComponent(defect.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey }, body: JSON.stringify({ status }),
        });
        if (response.status === 409) { queue.push({ ...item, status: 'conflict', lastError: 'sync_idempotency_conflict' }); continue; }
        if (response.status === 401) { queue.push({ ...item, status: 'failed', lastError: 'sync_session_expired' }); continue; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        continue;
      } catch (error) {
        const attempts = item.attempts + 1;
        queue.push({ ...item, status: 'failed', attempts, lastError: error instanceof Error ? error.message : 'sync_network_error', nextAttemptAt: new Date(now + retryDelayMs(attempts)).toISOString() });
        continue;
      }
    }
    if (!['task.closed', 'task.reviewed'].includes(item.type) || !item.payload) { queue.push(item); continue; }
    let current = item;
    try {
      if (item.type === 'task.closed' && 'photoUrls' in item.payload) {
        const photoUrls = [...item.payload.photoUrls];
        for (let index = 0; index < photoUrls.length; index += 1) {
          const photoUrl = photoUrls[index]!;
          if (!photoUrl.startsWith('file://') && !photoUrl.startsWith('content://')) continue;
          const local = await fetch(photoUrl);
          if (!local.ok) throw new Error('sync_local_photo_unreadable');
          const blob = await local.blob();
          const mimeType = blob.type && ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
          const upload = await api.request('/api/uploads', {
            method: 'POST', headers: { 'content-type': mimeType, 'idempotency-key': `${item.idempotencyKey}:photo:${index}`, 'x-task-id': item.entityId, 'x-file-name': `task-${item.entityId}-${index + 1}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}` }, body: blob,
          });
          if (!upload.ok) throw new Error(`Upload HTTP ${upload.status}`);
          photoUrls[index] = (await upload.json() as { url: string }).url;
          current = { ...current, payload: { ...item.payload, photoUrls: [...photoUrls] } };
        }
      }
      const endpoint = item.type === 'task.reviewed' ? 'review' : 'close';
      const response = await api.request(`/api/tasks/${encodeURIComponent(item.entityId)}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey },
        body: JSON.stringify(current.payload),
      });
      if (response.ok) continue;
      if (response.status === 409) { queue.push({ ...current, status: 'conflict', lastError: 'sync_idempotency_conflict' }); continue; }
      if (response.status === 401) { queue.push({ ...current, status: 'failed', lastError: 'sync_session_expired' }); continue; }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      const attempts = item.attempts + 1;
      queue.push({ ...current, status: 'failed', attempts, lastError: error instanceof Error ? error.message : 'sync_network_error', nextAttemptAt: new Date(now + retryDelayMs(attempts)).toISOString() });
    }
  }
  return { ...data, defects, queue };
}
