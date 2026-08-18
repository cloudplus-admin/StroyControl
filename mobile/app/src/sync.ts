import { ApiClient } from './api';
import { AppData, QueueItem } from './domain';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
export const retryDelayMs = (attempts: number) => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts - 1));

class SyncHttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

function ensureSyncResponse(response: Response): void {
  if (!response.ok) throw new SyncHttpError(response.status);
}

function queueAfterError(item: QueueItem, error: unknown, now: number): QueueItem {
  if (error instanceof SyncHttpError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 425 && error.status !== 429) {
    return { ...item, status: 'conflict', lastError: `sync_http_${error.status}`, nextAttemptAt: undefined };
  }
  const attempts = item.attempts + 1;
  return { ...item, status: 'failed', attempts, lastError: error instanceof Error ? error.message : 'sync_network_error', nextAttemptAt: new Date(now + retryDelayMs(attempts)).toISOString() };
}

const SERVER_SYNC_TYPES = new Set<QueueItem['type']>([
  'task.updated', 'task.closed', 'task.reviewed', 'defect.created', 'defect.updated',
  'quality.updated', 'quality.reviewed', 'message.created',
]);

export function isServerSyncQueueItem(item: QueueItem): boolean {
  return SERVER_SYNC_TYPES.has(item.type);
}

export async function syncQueue(data: AppData, api: ApiClient, now = Date.now()): Promise<AppData> {
  const queue: QueueItem[] = [];
  const syncedChecklistTasks = new Set<string>();
  let defects = data.defects;
  let qualityReports = data.qualityReports;
  let messages = data.messages;
  const defectIds = new Map<string, string>();
  const qualityIds = new Map<string, string>();
  for (const originalItem of data.queue) {
    const mappedEntityId = defectIds.get(originalItem.entityId) ?? qualityIds.get(originalItem.entityId);
    const item = mappedEntityId ? { ...originalItem, entityId: mappedEntityId } : originalItem;
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
        ensureSyncResponse(response);
        const created = await response.json() as { id: string; status: string; createdAt: string };
        defects = defects.map((candidate) => candidate.id === item.entityId ? { ...candidate, id: created.id, createdAt: created.createdAt } : candidate);
        defectIds.set(item.entityId, created.id);
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
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
        ensureSyncResponse(response);
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
        continue;
      }
    }
    if (item.type === 'message.created') {
      const message = messages.find((candidate) => candidate.id === item.entityId);
      const userId = api.getSession()?.user?.id;
      if (!message || !userId) { queue.push(item); continue; }
      try {
        const response = await api.request(`/api/objects/${encodeURIComponent(message.projectId)}/feed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey },
          body: JSON.stringify({ authorId: userId, body: message.text, mentionedUserIds: [], ...(message.parentId && /^[0-9a-f-]{36}$/i.test(message.parentId) ? { parentEventId: message.parentId } : {}) }),
        });
        ensureSyncResponse(response);
        const created = await response.json() as { id: string; createdAt: string };
        messages = messages.map((candidate) => candidate.id === item.entityId ? { ...candidate, id: created.id, createdAt: created.createdAt } : candidate);
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
        continue;
      }
    }
    if (item.type === 'quality.updated') {
      const report = qualityReports.find((candidate) => candidate.id === item.entityId);
      const userId = api.getSession()?.user?.id;
      if (!report || report.status === 'draft') continue;
      if (!userId) { queue.push(item); continue; }
      try {
        const photos = [] as { angle: string; uri: string }[];
        for (let index = 0; index < report.photos.length; index += 1) {
          const photo = report.photos[index]!;
          let uri = photo.uri;
          if (uri.startsWith('file://') || uri.startsWith('content://')) {
            const upload = await api.uploadFile('/api/uploads', uri, {
              'content-type': 'image/jpeg', 'idempotency-key': `${item.idempotencyKey}:photo:${index}`,
              'x-file-name': `quality-${item.entityId}-${index + 1}.jpg`,
            });
            ensureSyncResponse(upload);
            uri = (await upload.json() as { url: string }).url;
          }
          photos.push({ angle: photo.angle, uri });
        }
        const response = await api.request(`/api/objects/${encodeURIComponent(report.projectId)}/photo-reports`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey },
          body: JSON.stringify({ taskId: /^[0-9a-f-]{36}$/i.test(report.taskId) ? report.taskId : undefined, authorId: userId, shootingPoint: report.point, kind: report.kind === 'hidden' ? 'hidden_works' : 'progress', fileUrl: photos[0]?.uri, requiredAngles: report.requiredAngles, photos, status: 'review' }),
        });
        ensureSyncResponse(response);
        const created = await response.json() as { id: string; createdAt: string };
        qualityReports = qualityReports.map((candidate) => candidate.id === item.entityId ? { ...candidate, id: created.id, createdAt: created.createdAt, photos } : candidate);
        qualityIds.set(item.entityId, created.id);
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
        continue;
      }
    }
    if (item.type === 'quality.reviewed') {
      const report = qualityReports.find((candidate) => candidate.id === item.entityId);
      if (!report) { queue.push(item); continue; }
      try {
        const response = await api.request(`/api/photo-reports/${encodeURIComponent(report.id)}/review`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': item.idempotencyKey },
          body: JSON.stringify({ decision: report.status === 'accepted' ? 'accepted' : 'rejected', note: report.inspectorNote ?? '' }),
        });
        ensureSyncResponse(response);
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
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
          ensureSyncResponse(response);
        }
        continue;
      } catch (error) {
        queue.push(queueAfterError(item, error, now));
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
          ensureSyncResponse(upload);
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
      ensureSyncResponse(response);
      continue;
    } catch (error) {
      queue.push(queueAfterError(current, error, now));
    }
  }
  return { ...data, defects, qualityReports, messages, queue };
}
