import { ApiClient } from './api';
import { AppData, QueueItem } from './domain';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const retryDelayMs = (attempts: number) => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts - 1));

export async function syncQueue(data: AppData, api: ApiClient, now = Date.now()): Promise<AppData> {
  const queue: QueueItem[] = [];
  const syncedChecklistTasks = new Set<string>();
  let defects = data.defects;
  const defectIds = new Map<string, string>();
  for (const originalItem of data.queue) {
    const item = defectIds.has(originalItem.entityId) ? { ...originalItem, entityId: defectIds.get(originalItem.entityId)! } : originalItem;
    // Legacy builds could mark checklist entries as conflict/failed before a task
    // was closed. They are obsolete regardless of retry state once the server task
    // is already under review or done, so discard them before the retry guards.
    if (item.type === 'task.updated') {
      const task = data.tasks.find((candidate) => candidate.id === item.entityId);
      if (task && (task.status === 'review' || task.status === 'done')) continue;
    }
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
    if (item.type === 'task.updated') {
      const task = data.tasks.find((candidate) => candidate.id === item.entityId);
      if (!task) { queue.push(item); continue; }
      // Closing a task writes the final checklist state on the server. Old app
      // versions could leave one task.updated entry per tap behind; those are
      // obsolete once the task has moved to review/done and must not live forever.
      if (task.status === 'review' || task.status === 'done') continue;
      // A single pass sends the current checklist snapshot. Later legacy entries
      // for the same task describe older intermediate states and can be discarded.
      if (syncedChecklistTasks.has(task.id)) continue;
      syncedChecklistTasks.add(task.id);
      try {
        for (const checklistItem of task.checklist) {
          const response = await api.request(`/api/tasks/${encodeURIComponent(task.id)}/checklist/${encodeURIComponent(checklistItem.id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', 'idempotency-key': `${item.idempotencyKey}:${checklistItem.id}` },
            body: JSON.stringify({ isDone: checklistItem.done }),
          });
          if (response.status === 409) throw new Error('sync_idempotency_conflict');
          if (response.status === 401) throw new Error('sync_session_expired');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
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
          const extension = photoUrl.split('?')[0]?.split('.').at(-1)?.toLowerCase();
          const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
          const upload = await api.uploadFile('/api/uploads', photoUrl, {
            'content-type': mimeType,
            'idempotency-key': `${item.idempotencyKey}:photo:${index}`,
            'x-task-id': item.entityId,
            'x-file-name': `task-${item.entityId}-${index + 1}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`,
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
