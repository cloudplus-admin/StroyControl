import { ApiClient } from './api';
import { AppData, Defect, FeedMessage, Lang, Project, QualityReport, Task } from './domain';

type ServerTask = { id: string; objectId: string; stage: string; title: string; due: string; priority: string; assignee: string; status: string; closurePhotoUrl?: string | null; closurePhotos?: string[] | null; closureGeoLat?: number | null; closureGeoLng?: number | null; reviewNote?: string | null; reviewerId?: string | null; reviewerName?: string | null; checklist: { id: string; text: string; done: boolean }[] };
type ServerDocument = { id: string; objectId: string; name: string; version: number; uri: string; status: string; createdAt: string };
type ServerAct = { id: string; objectId: string; template: string; number: string; title: string; amount: number; status: string; pdfUri?: string | null; signedAt?: string | null; createdAt: string };
type ServerPhotoReport = { id: string; objectId: string; taskId?: string | null; point?: string | null; kind: string; fileUrl: string; requiredAngles?: string[]; photos?: { angle: string; uri: string }[]; status?: string; inspectorSignature?: string | null; inspectorNote?: string | null; reviewedAt?: string | null; createdAt: string };
type ServerDefect = { id: string; objectId: string; description: string; status: string; createdAt: string };
type ServerFeedEvent = { id: string; objectId: string; author: string; body: string; parentEventId?: string | null; reactions: number; createdAt: string };
type ServerObject = { id: string; name: string; address: string; progress: number; tasks: ServerTask[]; documents?: ServerDocument[]; acts?: ServerAct[]; photoReports?: ServerPhotoReport[]; defects?: ServerDefect[]; feed?: ServerFeedEvent[] };
type BootstrapResponse = { serverTime: string; reviewers?: { id: string; name: string; objectIds: string[] }[]; objects: ServerObject[] };

function mapStatus(status: string): Task['status'] {
  if (status === 'done') return 'done';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

export function mergeBootstrap(data: AppData, response: BootstrapResponse): AppData {
  const pendingClosed = new Set(data.queue.filter((item) => item.type === 'task.closed').map((item) => item.entityId));
  const pendingReviews = new Map(data.queue.filter((item) => item.type === 'task.reviewed' && item.payload && 'decision' in item.payload).map((item) => [item.entityId, 'decision' in item.payload! ? item.payload.decision : undefined]));
  const projects: Project[] = response.objects.map((object) => {
    const dueDates = object.tasks.map((task) => task.due).filter(Boolean).sort();
    const open = object.tasks.filter((task) => task.status !== 'done').length;
    return { id: object.id, name: object.name, address: object.address, progress: object.progress, plan: object.progress, deadline: dueDates.at(-1) ?? '-', forecast: dueDates.at(-1) ?? '-', risk: object.tasks.some((task) => task.status === 'overdue') ? 'high' : 'low', tasksOpen: open, defectsOpen: 0 };
  });
  const tasks: Task[] = response.objects.flatMap((object) => object.tasks.map((task) => ({
    id: task.id, projectId: task.objectId, title: task.title, stage: task.stage, due: task.due,
    priority: task.priority === 'high' ? 'high' : task.priority === 'low' ? 'low' : 'medium', assignee: task.assignee,
    status: pendingReviews.get(task.id) === 'accepted' ? 'done' : pendingReviews.get(task.id) === 'rejected' ? 'in_progress' : pendingClosed.has(task.id) ? 'review' : mapStatus(task.status), checklist: task.checklist,
    photoUri: task.closurePhotos?.[0] ?? task.closurePhotoUrl ?? undefined, photoUris: task.closurePhotos?.length ? task.closurePhotos : task.closurePhotoUrl ? [task.closurePhotoUrl] : undefined, latitude: task.closureGeoLat ?? undefined, longitude: task.closureGeoLng ?? undefined,
    reviewNote: task.reviewNote ?? undefined,
    reviewerId: task.reviewerId ?? undefined, reviewerName: task.reviewerName ?? undefined,
  })));
  const documents = response.objects.flatMap((object) => (object.documents ?? []).map((document) => ({ id: document.id, projectId: document.objectId, name: document.name, version: document.version, uri: document.uri, status: document.status, createdAt: document.createdAt })));
  const acts = response.objects.flatMap((object) => (object.acts ?? []).map((act) => ({ id: act.id, projectId: act.objectId, template: (['completed', 'hidden', 'acceptance'].includes(act.template) ? act.template : 'completed') as 'completed' | 'hidden' | 'acceptance', number: act.number, title: act.title, contractor: '', customer: '', amount: act.amount, date: act.signedAt?.slice(0, 10) ?? act.createdAt.slice(0, 10), notes: '', signature: [], pdfUri: act.pdfUri ?? undefined, status: act.status, signedAt: act.signedAt ?? undefined, createdAt: act.createdAt })));
  const messages: FeedMessage[] = response.objects.flatMap((object) => (object.feed ?? []).map((event) => ({ id: event.id, projectId: event.objectId, author: event.author, text: event.body, parentId: event.parentEventId ?? undefined, reactions: event.reactions, createdAt: event.createdAt })));
  const qualityReports: QualityReport[] = response.objects.flatMap((object) => (object.photoReports ?? []).map((report) => ({ id: report.id, projectId: report.objectId, taskId: report.taskId ?? '', point: report.point ?? '', kind: report.kind === 'hidden_works' ? 'hidden' : 'progress', requiredAngles: report.requiredAngles?.length ? report.requiredAngles : [report.point ?? 'photo'], photos: report.photos?.length ? report.photos : [{ angle: report.point ?? 'photo', uri: report.fileUrl }], status: (['draft', 'review', 'accepted', 'rejected'].includes(report.status ?? '') ? report.status : report.kind === 'hidden_works' && !report.inspectorSignature ? 'review' : 'accepted') as QualityReport['status'], inspectorNote: report.inspectorNote ?? undefined, reviewedAt: report.reviewedAt ?? undefined, createdAt: report.createdAt })));
  const defects: Defect[] = response.objects.flatMap((object) => (object.defects ?? []).map((defect) => ({ id: defect.id, projectId: defect.objectId, title: defect.description, status: defect.status === 'in_progress' ? 'fixing' : defect.status === 'verified' ? 'review' : defect.status === 'closed' ? 'closed' : 'open', createdAt: defect.createdAt })));
  const keepQueued = <T extends { id: string }>(server: T[], local: T[], types: string[]) => {
    const queued = new Set(data.queue.filter((item) => types.includes(item.type)).map((item) => item.entityId));
    const serverIds = new Set(server.map((item) => item.id));
    return [...local.filter((item) => queued.has(item.id) && !serverIds.has(item.id)), ...server];
  };
  return { ...data, projects, tasks, reviewers: response.reviewers ?? [], documents, acts, messages: keepQueued(messages, data.messages, ['message.created']), qualityReports: keepQueued(qualityReports, data.qualityReports, ['quality.updated', 'quality.reviewed']), defects: keepQueued(defects, data.defects, ['defect.created', 'defect.updated']) };
}

export async function refreshServerData(data: AppData, api: ApiClient, lang: Lang = 'ru'): Promise<AppData> {
  const response = await api.request(`/api/mobile/bootstrap?locale=${lang}`);
  if (!response.ok) throw new Error(`Bootstrap HTTP ${response.status}`);
  return mergeBootstrap(data, await response.json() as BootstrapResponse);
}
