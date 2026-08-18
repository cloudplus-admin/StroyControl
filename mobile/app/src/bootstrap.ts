import { ApiClient, API_BASE_URL } from './api';
import { AppData, Defect, FeedMessage, Lang, Project, QualityReport, Task } from './domain';

type ServerTask = { id: string; objectId: string; stage: string; title: string; description?: string; due: string; priority: string; assigneeId?: string | null; assignee: string; status: string; closurePhotoUrl?: string | null; closurePhotos?: string[] | null; closureGeoLat?: number | null; closureGeoLng?: number | null; reviewNote?: string | null; reviewerId?: string | null; reviewerName?: string | null; checklist: { id: string; text: string; done: boolean }[] };
type ServerDocument = { id: string; objectId: string; name: string; version: number; uri: string; status: string; createdAt: string };
type ServerAct = { id: string; objectId: string; template: string; number: string; title: string; amount: number; status: string; pdfUri?: string | null; signedAt?: string | null; createdAt: string };
type ServerPhotoReport = { id: string; objectId: string; taskId?: string | null; point?: string | null; kind: string; fileUrl: string; requiredAngles?: string[]; photos?: { angle: string; uri: string }[]; status?: string; inspectorNote?: string | null; reviewedAt?: string | null; createdAt: string };
type ServerDefect = { id: string; objectId: string; description: string; status: string; beforePhotos?: string[]; afterPhotos?: string[]; dueAt?: string | null; resolvedAt?: string | null; createdAt: string };
type ServerFeedEvent = { id: string; objectId: string; author: string; body: string; parentEventId?: string | null; reactions: number; createdAt: string };
type ServerObject = { id: string; name: string; address: string; latitude?: number | null; longitude?: number | null; progress: number; tasks: ServerTask[]; documents?: ServerDocument[]; acts?: ServerAct[]; photoReports?: ServerPhotoReport[]; defects?: ServerDefect[]; feed?: ServerFeedEvent[] };
type MobileRecord = { id: string; kind: string; objectId?: string | null; payload: Record<string, unknown>; updatedAt: string };
type BootstrapResponse = { serverTime: string; reviewers?: { id: string; name: string; objectIds: string[] }[]; mobileRecords?: MobileRecord[]; objects: ServerObject[] };

function mapStatus(status: string): Task['status'] {
  if (status === 'done') return 'done';
  if (status === 'review') return 'review';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

export function canonicalMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.pathname.startsWith('/api/uploads/')) return `${API_BASE_URL}${url.pathname}${url.search}`;
  } catch { /* Keep local and non-URL values unchanged. */ }
  return value;
}

export function mergeBootstrap(data: AppData, response: BootstrapResponse): AppData {
  const serverTasks = new Map(response.objects.flatMap((object) => object.tasks).map((task) => [task.id, task]));
  const queue = data.queue.filter((item) => {
    const serverTask = serverTasks.get(item.entityId);
    if (!serverTask) return true;

    // A successful close/review response can be lost when Android suspends the
    // app immediately after the request. In that case the durable operation is
    // still present locally, but bootstrap is the source of truth that proves it
    // has already reached the server.
    if (item.type === 'task.closed' && (serverTask.status === 'review' || serverTask.status === 'done') && Boolean(serverTask.closurePhotos?.length || serverTask.closurePhotoUrl)) return false;
    if (item.type === 'task.updated' && (serverTask.status === 'review' || serverTask.status === 'done')) return false;
    if (item.type === 'task.reviewed' && item.payload && 'decision' in item.payload) {
      if (item.payload.decision === 'accepted' && serverTask.status === 'done') return false;
      if (item.payload.decision === 'rejected' && serverTask.status === 'in_progress') return false;
    }
    return true;
  });
  const reconciledData = queue.length === data.queue.length ? data : { ...data, queue };
  const pendingClosed = new Set(queue.filter((item) => item.type === 'task.closed').map((item) => item.entityId));
  const pendingReviews = new Map(queue.filter((item) => item.type === 'task.reviewed' && item.payload && 'decision' in item.payload).map((item) => [item.entityId, 'decision' in item.payload! ? item.payload.decision : undefined]));
  const projects: Project[] = response.objects.map((object) => {
    const dueDates = object.tasks.map((task) => task.due).filter(Boolean).sort();
    const open = object.tasks.filter((task) => task.status !== 'done').length;
    const defectsOpen = (object.defects ?? []).filter((defect) => defect.status !== 'closed').length;
    return { id: object.id, name: object.name, address: object.address, latitude: object.latitude ?? undefined, longitude: object.longitude ?? undefined, progress: object.progress, plan: object.progress, deadline: dueDates.at(-1) ?? '-', forecast: dueDates.at(-1) ?? '-', risk: object.tasks.some((task) => task.status === 'overdue') ? 'high' : 'low', tasksOpen: open, defectsOpen };
  });
  const tasks: Task[] = response.objects.flatMap((object) => object.tasks.map((task) => ({
    id: task.id, projectId: task.objectId, title: task.title, description: task.description, stage: task.stage, due: task.due,
    priority: task.priority === 'high' ? 'high' : task.priority === 'low' ? 'low' : 'medium', assigneeId: task.assigneeId ?? undefined, assignee: task.assignee,
    status: pendingReviews.get(task.id) === 'accepted' ? 'done' : pendingReviews.get(task.id) === 'rejected' ? 'in_progress' : pendingClosed.has(task.id) ? 'review' : mapStatus(task.status), checklist: task.checklist,
    photoUri: task.closurePhotos?.[0] ? canonicalMediaUrl(task.closurePhotos[0]) : task.closurePhotoUrl ? canonicalMediaUrl(task.closurePhotoUrl) : undefined,
    photoUris: task.closurePhotos?.length ? task.closurePhotos.map(canonicalMediaUrl) : task.closurePhotoUrl ? [canonicalMediaUrl(task.closurePhotoUrl)] : undefined, latitude: task.closureGeoLat ?? undefined, longitude: task.closureGeoLng ?? undefined,
    reviewNote: task.reviewNote ?? undefined,
    reviewerId: task.reviewerId ?? undefined, reviewerName: task.reviewerName ?? undefined,
  })));
  const documents = response.objects.flatMap((object) => (object.documents ?? []).map((document) => ({ id: document.id, projectId: document.objectId, name: document.name, version: document.version, uri: canonicalMediaUrl(document.uri), status: document.status, createdAt: document.createdAt })));
  const acts = response.objects.flatMap((object) => (object.acts ?? []).map((act) => ({ id: act.id, projectId: act.objectId, template: (['completed', 'hidden', 'acceptance'].includes(act.template) ? act.template : 'completed') as 'completed' | 'hidden' | 'acceptance', number: act.number, title: act.title, contractor: '', customer: '', amount: act.amount, date: act.signedAt?.slice(0, 10) ?? act.createdAt.slice(0, 10), notes: '', signature: [], pdfUri: act.pdfUri ? canonicalMediaUrl(act.pdfUri) : undefined, status: act.status, signedAt: act.signedAt ?? undefined, createdAt: act.createdAt })));
  const messages: FeedMessage[] = response.objects.flatMap((object) => (object.feed ?? []).map((event) => ({ id: event.id, projectId: event.objectId, author: event.author, text: event.body, parentId: event.parentEventId ?? undefined, reactions: event.reactions, createdAt: event.createdAt })));
  const qualityReports: QualityReport[] = response.objects.flatMap((object) => (object.photoReports ?? []).map((report) => ({ id: report.id, projectId: report.objectId, taskId: report.taskId ?? '', point: report.point ?? '', kind: report.kind === 'hidden_works' ? 'hidden' : 'progress', requiredAngles: report.requiredAngles?.length ? report.requiredAngles : [report.point ?? 'photo'], photos: report.photos?.length ? report.photos.map((photo) => ({ ...photo, uri: canonicalMediaUrl(photo.uri) })) : [{ angle: report.point ?? 'photo', uri: canonicalMediaUrl(report.fileUrl) }], status: (['draft', 'review', 'accepted', 'rejected'].includes(report.status ?? '') ? report.status : report.kind === 'hidden_works' ? 'review' : 'accepted') as QualityReport['status'], inspectorNote: report.inspectorNote ?? undefined, reviewedAt: report.reviewedAt ?? undefined, createdAt: report.createdAt })));
  const defects: Defect[] = response.objects.flatMap((object) => (object.defects ?? []).map((defect) => {
    const beforePhotos = (defect.beforePhotos ?? []).map(canonicalMediaUrl);
    const afterPhotos = (defect.afterPhotos ?? []).map(canonicalMediaUrl);
    return { id: defect.id, projectId: defect.objectId, title: defect.description, status: defect.status === 'in_progress' ? 'fixing' : defect.status === 'verified' ? 'review' : defect.status === 'closed' ? 'closed' : 'open', beforePhotos, afterPhotos, beforeUri: beforePhotos[0], afterUri: afterPhotos[0], dueAt: defect.dueAt ?? undefined, resolvedAt: defect.resolvedAt ?? undefined, createdAt: defect.createdAt };
  }));
  const keepQueued = <T extends { id: string }>(server: T[], local: T[], types: string[]) => {
    const queued = new Set(queue.filter((item) => types.includes(item.type)).map((item) => item.entityId));
    const serverIds = new Set(server.map((item) => item.id));
    return [...local.filter((item) => queued.has(item.id) && !serverIds.has(item.id)), ...server];
  };
  const records = response.mobileRecords ?? [];
  const payloads = <T extends { id: string }>(kind: string) => records.filter((record) => record.kind === kind).map((record) => record.payload as T);
  const stockRecords = records.filter((record) => record.kind === 'stockMovement');
  const stockMovements = stockRecords.map((record) => record.payload as unknown as AppData['stockMovements'][number]);
  const stockMaterials = stockRecords.map((record) => record.payload.material as AppData['materials'][number]).filter(Boolean);
  const mergedMaterials = new Map(payloads<AppData['materials'][number]>('material').map((item) => [item.id, item]));
  stockMaterials.forEach((item) => mergedMaterials.set(item.id, item));
  return {
    ...reconciledData, projects, tasks, reviewers: response.reviewers ?? [], documents, acts,
    messages: keepQueued(messages, data.messages, ['message.created']),
    qualityReports: keepQueued(qualityReports, data.qualityReports, ['quality.updated', 'quality.reviewed']),
    defects: keepQueued(defects, data.defects, ['defect.created', 'defect.updated']),
    journal: keepQueued(payloads('journal'), data.journal, ['journal.created']),
    supplyRequests: keepQueued(payloads('supply'), data.supplyRequests, ['supply.created', 'supply.updated']),
    tools: keepQueued(payloads('tool'), data.tools, ['tool.updated']),
    materials: keepQueued([...mergedMaterials.values()], data.materials, ['material.updated', 'stock.updated']),
    stockMovements: keepQueued(stockMovements, data.stockMovements, ['stock.updated']),
    crews: keepQueued(payloads('crew'), data.crews, ['crew.updated']),
    shifts: keepQueued(payloads('shift'), data.shifts, ['shift.created', 'shift.updated']),
    safetyChecklists: keepQueued(payloads('safetyChecklist'), data.safetyChecklists, ['safety.checklist']),
    safetyViolations: keepQueued(payloads('safetyViolation'), data.safetyViolations, ['safety.violation', 'safety.updated']),
  };
}

export async function refreshServerData(data: AppData, api: ApiClient, lang: Lang = 'ru'): Promise<AppData> {
  const response = await api.request(`/api/mobile/bootstrap?locale=${lang}`);
  if (!response.ok) throw new Error(`Bootstrap HTTP ${response.status}`);
  return mergeBootstrap(data, await response.json() as BootstrapResponse);
}
