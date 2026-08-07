export type Role = 'director' | 'pm' | 'foreman' | 'inspector' | 'supplier' | 'finance' | 'customer' | 'subcontractor' | 'admin';
export type Lang = 'ru' | 'uz' | 'en';

export const roles: { id: Role; ru: string; uz: string; en: string; scope: Record<Lang, string> }[] = [
  { id: 'director', ru: 'Руководитель компании', uz: 'Kompaniya rahbari', en: 'Company director', scope: { ru: 'Все объекты, аналитика и KPI', uz: 'Barcha obyektlar, tahlil va KPI', en: 'All sites, analytics and KPIs' } },
  { id: 'pm', ru: 'Руководитель проекта', uz: 'Loyiha rahbari', en: 'Project manager', scope: { ru: 'График, задачи и команда объекта', uz: 'Jadval, vazifalar va obyekt jamoasi', en: 'Schedule, tasks and site team' } },
  { id: 'foreman', ru: 'Прораб', uz: 'Prorab', en: 'Foreman', scope: { ru: 'Работы на площадке и отчеты', uz: 'Maydondagi ishlar va hisobotlar', en: 'On-site work and reports' } },
  { id: 'inspector', ru: 'Технадзор / ОКК', uz: 'Texnik nazorat', en: 'Technical inspector', scope: { ru: 'Приемка, фото и дефекты', uz: 'Qabul qilish, fotosuratlar va nuqsonlar', en: 'Acceptance, photos and defects' } },
  { id: 'supplier', ru: 'Снабженец', uz: 'Ta\'minotchi', en: 'Supplier', scope: { ru: 'Заявки и поставки', uz: 'Arizalar va yetkazib berish', en: 'Requests and deliveries' } },
  { id: 'finance', ru: 'Финансист', uz: 'Moliyachi', en: 'Finance manager', scope: { ru: 'Бюджет, оплаты и акты', uz: "Byudjet, to'lovlar va dalolatnomalar", en: 'Budget, payments and certificates' } },
  { id: 'customer', ru: 'Заказчик', uz: 'Buyurtmachi', en: 'Customer', scope: { ru: 'Ход работ и согласования', uz: 'Ishlarning borishi va kelishuvlar', en: 'Work progress and approvals' } },
  { id: 'subcontractor', ru: 'Субподрядчик', uz: 'Subpudratchi', en: 'Subcontractor', scope: { ru: 'Только свои задачи и акты', uz: "Faqat o'z vazifalari va dalolatnomalari", en: 'Own tasks and certificates only' } },
  { id: 'admin', ru: 'Администратор', uz: 'Administrator', en: 'Administrator', scope: { ru: 'Пользователи и права', uz: 'Foydalanuvchilar va ruxsatlar', en: 'Users and permissions' } }
];

export type Project = { id: string; name: string; address: string; progress: number; plan: number; deadline: string; forecast: string; risk: 'low' | 'medium' | 'high'; tasksOpen: number; defectsOpen: number };
export const projects: Project[] = [
  { id: 'p1', name: 'ЖК Bogishamol Riviera', address: 'Ташкент, Юнусабад', progress: 52, plan: 58, deadline: '16.11.2026', forecast: '30.11.2026', risk: 'high', tasksOpen: 18, defectsOpen: 4 },
  { id: 'p2', name: 'БЦ Sergeli Business Park', address: 'Ташкент, Сергели', progress: 18, plan: 17, deadline: '28.02.2027', forecast: '28.02.2027', risk: 'low', tasksOpen: 9, defectsOpen: 1 },
  { id: 'p3', name: 'Школа №257', address: 'Ташкент, Яшнабад', progress: 61, plan: 64, deadline: '25.08.2026', forecast: '28.08.2026', risk: 'medium', tasksOpen: 12, defectsOpen: 2 },
  { id: 'p4', name: 'Дом Дурмень', address: 'Кибрайский район', progress: 74, plan: 72, deadline: '30.09.2026', forecast: '30.09.2026', risk: 'low', tasksOpen: 5, defectsOpen: 0 }
];
export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done';

export type ChecklistItem = { id: string; text: string; done: boolean };
export type Task = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  stage: string;
  due: string;
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  assigneeId?: string;
  status: TaskStatus;
  checklist: ChecklistItem[];
  photoUri?: string;
  photoUris?: string[];
  latitude?: number;
  longitude?: number;
  reviewNote?: string;
  reviewerId?: string;
  reviewerName?: string;
};

export type Reviewer = { id: string; name: string; objectIds: string[] };

export type Defect = {
  id: string;
  projectId: string;
  title: string;
  status: 'open' | 'fixing' | 'review' | 'closed';
  createdAt: string;
  beforeUri?: string;
  afterUri?: string;
};

export type QualityReport = {
  id: string; projectId: string; taskId: string; point: string; kind: 'progress' | 'hidden';
  requiredAngles: string[]; photos: { angle: string; uri: string }[];
  status: 'draft' | 'review' | 'accepted' | 'rejected'; createdAt: string; inspectorNote?: string; reviewedAt?: string; inspectorName?: string;
};

export type QueueItem = {
  id: string;
  type: 'task.updated' | 'task.closed' | 'task.reviewed' | 'defect.created' | 'defect.updated' | 'quality.updated' | 'quality.reviewed' | 'message.created' | 'journal.created' | 'document.created' | 'act.created' | 'act.signed' | 'supply.created' | 'supply.updated' | 'tool.updated' | 'stock.updated' | 'material.updated' | 'crew.updated' | 'shift.created' | 'shift.updated' | 'safety.checklist' | 'safety.violation' | 'safety.updated';
  entityId: string;
  createdAt: string;
  idempotencyKey: string;
  status: 'pending' | 'failed' | 'conflict';
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  payload?: { photoUrls: string[]; geoLat: number; geoLng: number } | { decision: 'accepted' | 'rejected'; note: string };
};

export type FeedMessage = { id: string; projectId: string; author: string; text: string; createdAt: string; parentId?: string; attachmentName?: string; reactions: number };
export type JournalEntry = { id: string; projectId: string; author: string; text: string; createdAt: string; audioUri?: string; lang: Lang };
export type ProjectDocument = { id: string; projectId: string; name: string; version: number; uri: string; status?: string; createdAt: string };
export type SupplyRequest = { id: string; projectId: string; item: string; quantity: string; neededAt: string; author: string; status: 'draft' | 'ordered' | 'delivered'; createdAt: string };
export type ToolAsset = { id: string; qr: string; name: string; serial: string; status: 'available' | 'issued' | 'repair'; holder?: string; location: string; updatedAt: string };
export type MaterialStock = { id: string; projectId: string; name: string; unit: string; quantity: number; minimum: number; location: string; updatedAt: string };
export type StockMovement = { id: string; materialId: string; kind: 'receipt' | 'writeoff'; quantity: number; stage?: string; note: string; createdAt: string };
export type Crew = { id: string; name: string; specialty: string; foreman: string; defaultWorkers: number; active: boolean; updatedAt: string };
export type CrewShift = { id: string; projectId: string; crewId?: string; crew: string; workers: number; hours: number; arrival?: string; departure?: string; stage?: string; output: string; downtime: string; date: string; createdAt: string };
export type SafetyChecklist = { id: string; projectId: string; date: string; responsible: string; items: ChecklistItem[]; signature: { x: number; y: number }[]; completedAt?: string };
export type SafetyViolation = { id: string; projectId: string; title: string; responsible: string; status: 'open' | 'fixing' | 'closed'; photoUri?: string; latitude?: number; longitude?: number; createdAt: string; closedAt?: string };
export type WorkAct = { id: string; projectId: string; template: 'completed' | 'hidden' | 'acceptance'; number: string; title: string; contractor: string; customer: string; amount: number; date: string; notes: string; signature: { x: number; y: number }[]; pdfUri?: string; status?: string; signedAt?: string; createdAt: string };
export type AppData = { projects: Project[]; tasks: Task[]; reviewers: Reviewer[]; defects: Defect[]; qualityReports: QualityReport[]; messages: FeedMessage[]; journal: JournalEntry[]; documents: ProjectDocument[]; acts: WorkAct[]; supplyRequests: SupplyRequest[]; tools: ToolAsset[]; materials: MaterialStock[]; stockMovements: StockMovement[]; crews: Crew[]; shifts: CrewShift[]; safetyChecklists: SafetyChecklist[]; safetyViolations: SafetyViolation[]; queue: QueueItem[] };

export const seedData: AppData = {
  projects,
  reviewers: [],
  tasks: [
    { id: 't-101', projectId: 'p1', title: 'Бетонирование колонн 8 этажа', stage: 'Каркас', due: '2026-08-01', priority: 'high', assignee: 'Алишер Хамидов', status: 'in_progress', checklist: [
      { id: 'c-1', text: 'Проверить опалубку', done: true },
      { id: 'c-2', text: 'Принять армирование', done: false },
      { id: 'c-3', text: 'Загрузить фото результата', done: false }
    ] },
    { id: 't-102', projectId: 'p1', title: 'Ежедневный обход по ТБ', stage: 'Площадка', due: '2026-07-31', priority: 'medium', assignee: 'Бахтиер Саидов', status: 'open', checklist: [
      { id: 'c-4', text: 'Проверить каски и СИЗ', done: false },
      { id: 'c-5', text: 'Проверить ограждения', done: false }
    ] },
    { id: 't-103', projectId: 'p2', title: 'Разметка осей первого этажа', stage: 'Фундамент', due: '2026-08-04', priority: 'low', assignee: 'Сардор Каримов', status: 'open', checklist: [
      { id: 'c-6', text: 'Сверить чертеж КЖ', done: false },
      { id: 'c-7', text: 'Зафиксировать оси', done: false }
    ] },
    { id: 't-104', projectId: 'p3', title: 'Монтаж окон спортзала', stage: 'Фасад', due: '2026-08-02', priority: 'high', assignee: 'ООО Glass Pro', status: 'review', checklist: [
      { id: 'c-8', text: 'Проверить уровень', done: true },
      { id: 'c-9', text: 'Фото узлов примыкания', done: true }
    ] }
  ],
  defects: [{ id: 'd-21', projectId: 'p1', title: 'Отклонение колонны по оси Д-4', status: 'open', createdAt: '2026-07-31T08:00:00.000Z' }],
  qualityReports: [
    { id: 'q-1', projectId: 'p1', taskId: 't-101', point: 'Секция А - ось Д-4', kind: 'hidden', requiredAngles: ['Общий план', 'Армирование', 'Закладные'], photos: [], status: 'draft', createdAt: '2026-07-31T09:00:00.000Z' },
    { id: 'q-2', projectId: 'p3', taskId: 't-104', point: 'Спортзал - северный фасад', kind: 'progress', requiredAngles: ['Общий план'], photos: [{ angle: 'Общий план', uri: 'https://picsum.photos/800/500' }], status: 'review', createdAt: '2026-07-30T14:20:00.000Z' },
    { id: 'q-3', projectId: 'p3', taskId: 't-104', point: 'Спортзал - северный фасад', kind: 'progress', requiredAngles: ['Общий план'], photos: [{ angle: 'Общий план', uri: 'https://picsum.photos/800/501' }], status: 'accepted', createdAt: '2026-07-23T14:20:00.000Z', reviewedAt: '2026-07-23T15:00:00.000Z', inspectorName: 'Инженер ОКК' }
  ],
  messages: [
    { id: 'm-1', projectId: 'p1', author: 'Алишер Хамидов', text: 'Армирование колонн завершено. @Технадзор, можно принимать.', createdAt: '2026-07-31T11:20:00.000Z', reactions: 3 },
    { id: 'm-2', projectId: 'p1', author: 'Инженер ОКК', text: 'Принял, буду на площадке в 15:00.', createdAt: '2026-07-31T11:35:00.000Z', parentId: 'm-1', reactions: 1 }
  ],
  journal: [{ id: 'j-1', projectId: 'p1', author: 'Прораб', text: 'На площадке 24 рабочих. Завершено армирование колонн.', createdAt: '2026-07-31T17:00:00.000Z', lang: 'ru' }],
  documents: [
    { id: 'doc-1-v2', projectId: 'p1', name: 'КЖ-08-Колонны.pdf', version: 2, uri: 'local://kj-08-v2', createdAt: '2026-07-29T10:00:00.000Z' },
    { id: 'doc-1-v1', projectId: 'p1', name: 'КЖ-08-Колонны.pdf', version: 1, uri: 'local://kj-08-v1', createdAt: '2026-07-20T10:00:00.000Z' }
  ],
  acts: [],
  supplyRequests: [
    { id: 'sr-1', projectId: 'p1', item: 'Арматура A500C 16 мм', quantity: '12 т', neededAt: '2026-08-04', author: 'Прораб', status: 'ordered', createdAt: '2026-07-31T12:00:00.000Z' },
    { id: 'sr-2', projectId: 'p3', item: 'Монтажная пена', quantity: '48 баллонов', neededAt: '2026-08-02', author: 'Прораб', status: 'draft', createdAt: '2026-07-31T15:00:00.000Z' }
  ],
  tools: [
    { id: 'tool-1', qr: 'SC-TOOL-0001', name: 'Перфоратор Bosch GBH 2-26', serial: 'B26-40291', status: 'available', location: 'Склад ЖК Bogishamol', updatedAt: '2026-07-31T10:00:00.000Z' },
    { id: 'tool-2', qr: 'SC-TOOL-0002', name: 'Лазерный нивелир Leica Lino', serial: 'LL-88214', status: 'issued', holder: 'Бахтиер Саидов', location: 'Секция А', updatedAt: '2026-07-31T11:30:00.000Z' },
    { id: 'tool-3', qr: 'SC-TOOL-0003', name: 'Вибратор глубинный Vektor', serial: 'VG-77102', status: 'repair', location: 'Ремонтная зона', updatedAt: '2026-07-30T16:00:00.000Z' }
  ],
  materials: [
    { id: 'mat-1', projectId: 'p1', name: 'Цемент М500', unit: 'т', quantity: 18.5, minimum: 10, location: 'Склад А', updatedAt: '2026-08-01T05:00:00.000Z' },
    { id: 'mat-2', projectId: 'p1', name: 'Арматура A500C 16 мм', unit: 'т', quantity: 6.2, minimum: 8, location: 'Открытый склад', updatedAt: '2026-08-01T05:00:00.000Z' },
    { id: 'mat-3', projectId: 'p1', name: 'Газоблок 600x300x200', unit: 'шт', quantity: 1240, minimum: 500, location: 'Секция Б', updatedAt: '2026-08-01T05:00:00.000Z' }
  ],
  stockMovements: [],
  crews: [
    { id: 'crew-1', name: 'Монолитчики - бригада №2', specialty: 'Монолитные работы', foreman: 'Бахтиер Саидов', defaultWorkers: 14, active: true, updatedAt: '2026-07-31T17:00:00.000Z' },
    { id: 'crew-2', name: 'Отделочники - бригада №1', specialty: 'Отделочные работы', foreman: 'Сардор Каримов', defaultWorkers: 9, active: true, updatedAt: '2026-07-31T17:00:00.000Z' }
  ],
  shifts: [
    { id: 'shift-1', projectId: 'p1', crewId: 'crew-1', crew: 'Монолитчики - бригада №2', workers: 14, hours: 8, arrival: '08:00', departure: '17:00', stage: 'Каркас', output: 'Колонны 8 этажа - 12 м3', downtime: 'Нет', date: '2026-07-31', createdAt: '2026-07-31T17:00:00.000Z' }
  ],
  safetyChecklists: [],
  safetyViolations: [],
  queue: []
};

export function enqueue(data: AppData, type: QueueItem['type'], entityId: string, now = new Date().toISOString()): AppData {
  const id = `${type}:${entityId}:${now}`;
  const item: QueueItem = { id, type, entityId, createdAt: now, idempotencyKey: id, status: 'pending', attempts: 0 };
  return { ...data, queue: [...data.queue, item] };
}

export function toggleChecklist(data: AppData, taskId: string, checklistId: string): AppData {
  const tasks = data.tasks.map((task) => task.id !== taskId ? task : {
    ...task,
    checklist: task.checklist.map((item) => item.id === checklistId ? { ...item, done: !item.done } : item)
  });
  return enqueue({ ...data, tasks }, 'task.updated', taskId);
}

export function closeTask(data: AppData, taskId: string, photoUris: string[] | string, latitude: number, longitude: number, now = new Date().toISOString()): AppData {
  const photos = (Array.isArray(photoUris) ? photoUris : [photoUris]).filter(Boolean).slice(0, 10);
  if (!photos.length) return data;
  const tasks = data.tasks.map((task) => task.id !== taskId ? task : {
    ...task, status: 'review' as const, photoUri: photos[0], photoUris: photos, latitude, longitude,
    checklist: task.checklist.map((item) => ({ ...item, done: true }))
  });
  const next = enqueue({ ...data, tasks }, 'task.closed', taskId, now);
  return { ...next, queue: next.queue.map((item, index) => index === next.queue.length - 1 ? { ...item, payload: { photoUrls: photos, geoLat: latitude, geoLng: longitude } } : item) };
}

export function reviewTask(data: AppData, taskId: string, decision: 'accepted' | 'rejected', note: string, now = new Date().toISOString(), lang: Lang = 'ru'): AppData {
  if (decision === 'rejected' && !note.trim()) return data;
  const acceptedNote = lang === 'uz' ? 'Texnik nazorat qabul qildi' : lang === 'en' ? 'Accepted by technical inspector' : 'Принято технадзором';
  const tasks = data.tasks.map((task) => task.id !== taskId ? task : { ...task, status: decision === 'accepted' ? 'done' as const : 'in_progress' as const, reviewNote: note.trim() || acceptedNote });
  const next = enqueue({ ...data, tasks }, 'task.reviewed', taskId, now);
  return { ...next, queue: next.queue.map((item, index) => index === next.queue.length - 1 ? { ...item, payload: { decision, note: note.trim() } } : item) };
}

export function createDefect(data: AppData, title: string, now = new Date().toISOString(), projectId = data.projects[0]?.id ?? 'p1'): AppData {
  const id = `d-${Date.parse(now)}`;
  const next = { ...data, defects: [{ id, projectId, title: title.trim(), status: 'open' as const, createdAt: now }, ...data.defects] };
  return enqueue(next, 'defect.created', id, now);
}

export function addQualityPhoto(data: AppData, reportId: string, angle: string, uri: string): AppData {
  const qualityReports = data.qualityReports.map((report) => report.id !== reportId ? report : {
    ...report, photos: [...report.photos.filter((p) => p.angle !== angle), { angle, uri }]
  });
  return enqueue({ ...data, qualityReports }, 'quality.updated', reportId);
}

export function submitQualityReport(data: AppData, reportId: string): AppData {
  const report = data.qualityReports.find((x) => x.id === reportId);
  if (!report || report.requiredAngles.some((angle) => !report.photos.some((p) => p.angle === angle))) return data;
  const qualityReports = data.qualityReports.map((x) => x.id === reportId ? { ...x, status: 'review' as const } : x);
  return enqueue({ ...data, qualityReports }, 'quality.updated', reportId);
}

export function reviewQualityReport(data: AppData, reportId: string, accepted: boolean, now = new Date().toISOString(), lang: Lang = 'ru'): AppData {
  const copy = lang === 'uz' ? { accepted: 'Texnik nazorat qabul qildi', rejected: 'Rad etildi - qayta suratga olish kerak', inspector: 'Texnik nazorat muhandisi' } : lang === 'en' ? { accepted: 'Accepted by technical inspector', rejected: 'Rejected - new photos required', inspector: 'Technical inspection engineer' } : { accepted: 'Принято технадзором', rejected: 'Отклонено - требуется пересъемка', inspector: 'Инженер технадзора' };
  const qualityReports = data.qualityReports.map((x) => x.id === reportId ? { ...x, status: accepted ? 'accepted' as const : 'rejected' as const, inspectorNote: accepted ? copy.accepted : copy.rejected, reviewedAt: now, inspectorName: copy.inspector } : x);
  return enqueue({ ...data, qualityReports }, 'quality.reviewed', reportId);
}

export function addDefectPhoto(data: AppData, defectId: string, side: 'before' | 'after', uri: string): AppData {
  const defects = data.defects.map((x) => x.id !== defectId ? x : side === 'before'
    ? { ...x, beforeUri: uri }
    : { ...x, afterUri: uri, status: 'review' as const });
  return enqueue({ ...data, defects }, 'defect.updated', defectId);
}

export function addMessage(data: AppData, text: string, attachmentName?: string, parentId?: string, now = new Date().toISOString(), lang: Lang = 'ru', projectId = data.projects[0]?.id ?? 'p1'): AppData {
  const id = `m-${Date.parse(now)}`;
  const author = lang === 'uz' ? 'Joriy foydalanuvchi' : lang === 'en' ? 'Current user' : 'Текущий пользователь';
  const message: FeedMessage = { id, projectId, author, text: text.trim(), attachmentName, parentId, createdAt: now, reactions: 0 };
  return enqueue({ ...data, messages: [message, ...data.messages] }, 'message.created', id, now);
}

export function addReaction(data: AppData, messageId: string): AppData {
  return { ...data, messages: data.messages.map((x) => x.id === messageId ? { ...x, reactions: x.reactions + 1 } : x) };
}

export function addJournalEntry(data: AppData, text: string, lang: Lang, audioUri?: string, now = new Date().toISOString()): AppData {
  const id = `j-${Date.parse(now)}`;
  const author = lang === 'uz' ? 'Prorab' : lang === 'en' ? 'Foreman' : 'Прораб';
  const defaultText = lang === 'uz' ? 'Jurnal ovozli yozuvi' : lang === 'en' ? 'Voice journal entry' : 'Голосовая запись журнала';
  const entry: JournalEntry = { id, projectId: 'p1', author, text: text.trim() || defaultText, createdAt: now, audioUri, lang };
  return enqueue({ ...data, journal: [entry, ...data.journal] }, 'journal.created', id, now);
}

export function addDocument(data: AppData, name: string, uri: string, now = new Date().toISOString()): AppData {
  const version = Math.max(0, ...data.documents.filter((x) => x.name === name).map((x) => x.version)) + 1;
  const id = `doc-${Date.parse(now)}`;
  const document: ProjectDocument = { id, projectId: 'p1', name, version, uri, createdAt: now };
  return enqueue({ ...data, documents: [document, ...data.documents] }, 'document.created', id, now);
}

export function createSupplyRequest(data: AppData, item: string, quantity: string, neededAt: string, now = new Date().toISOString(), lang: Lang = 'ru'): AppData {
  if (!item.trim() || !quantity.trim() || !neededAt.trim()) return data;
  const id = `sr-${Date.parse(now)}`;
  const author = lang === 'uz' ? 'Joriy foydalanuvchi' : lang === 'en' ? 'Current user' : 'Текущий пользователь';
  const request: SupplyRequest = { id, projectId: 'p1', item: item.trim(), quantity: quantity.trim(), neededAt: neededAt.trim(), author, status: 'draft', createdAt: now };
  return enqueue({ ...data, supplyRequests: [request, ...data.supplyRequests] }, 'supply.created', id, now);
}

export function advanceSupplyRequest(data: AppData, requestId: string, now = new Date().toISOString()): AppData {
  const supplyRequests = data.supplyRequests.map((x) => x.id !== requestId ? x : { ...x, status: x.status === 'draft' ? 'ordered' as const : 'delivered' as const });
  return enqueue({ ...data, supplyRequests }, 'supply.updated', requestId, now);
}

export function toggleToolIssue(data: AppData, toolId: string, holder = '', now = new Date().toISOString(), lang: Lang = 'ru'): AppData {
  const currentUser = holder || (lang === 'uz' ? 'Joriy foydalanuvchi' : lang === 'en' ? 'Current user' : 'Текущий пользователь');
  const issuedLocation = lang === 'uz' ? "Foydalanuvchida" : lang === 'en' ? 'Issued' : 'На руках';
  const warehouse = lang === 'uz' ? 'Bogishamol turar joy majmuasi ombori' : lang === 'en' ? 'Bogishamol residential complex warehouse' : 'Склад ЖК Bogishamol';
  const tools = data.tools.map((x) => x.id !== toolId || x.status === 'repair' ? x : x.status === 'available'
    ? { ...x, status: 'issued' as const, holder: currentUser, location: issuedLocation, updatedAt: now }
    : { ...x, status: 'available' as const, holder: undefined, location: warehouse, updatedAt: now });
  return enqueue({ ...data, tools }, 'tool.updated', toolId, now);
}

export function moveStock(data: AppData, materialId: string, kind: StockMovement['kind'], quantity: number, stage: string, note: string, now = new Date().toISOString()): AppData {
  if (!Number.isFinite(quantity) || quantity <= 0) return data;
  const material = data.materials.find((x) => x.id === materialId);
  if (!material || (kind === 'writeoff' && quantity > material.quantity)) return data;
  const id = `mov-${Date.parse(now)}`;
  const movement: StockMovement = { id, materialId, kind, quantity, stage: stage.trim() || undefined, note: note.trim(), createdAt: now };
  const materials = data.materials.map((x) => x.id !== materialId ? x : { ...x, quantity: x.quantity + (kind === 'receipt' ? quantity : -quantity), updatedAt: now });
  return enqueue({ ...data, materials, stockMovements: [movement, ...data.stockMovements] }, 'stock.updated', materialId, now);
}

export function saveMaterial(data: AppData, value: { id?: string; projectId: string; name: string; unit: string; minimum: number; location: string }, now = new Date().toISOString()): AppData {
  if (!value.projectId || !value.name.trim() || !value.unit.trim() || !value.location.trim() || !Number.isFinite(value.minimum) || value.minimum < 0) return data;
  const id = value.id ?? `mat-${Date.parse(now)}`;
  const current = data.materials.find((x) => x.id === id);
  const material: MaterialStock = { id, projectId: value.projectId, name: value.name.trim(), unit: value.unit.trim(), minimum: value.minimum, location: value.location.trim(), quantity: current?.quantity ?? 0, updatedAt: now };
  const materials = current ? data.materials.map((x) => x.id === id ? material : x) : [material, ...data.materials];
  return enqueue({ ...data, materials }, 'material.updated', id, now);
}

export function saveCrew(data: AppData, value: { id?: string; name: string; specialty: string; foreman: string; defaultWorkers: number }, now = new Date().toISOString()): AppData {
  if (!value.name.trim() || !value.specialty.trim() || !value.foreman.trim() || !Number.isFinite(value.defaultWorkers) || value.defaultWorkers <= 0) return data;
  const id = value.id ?? `crew-${Date.parse(now)}`;
  const current = data.crews.find((x) => x.id === id);
  const crew: Crew = { id, name: value.name.trim(), specialty: value.specialty.trim(), foreman: value.foreman.trim(), defaultWorkers: value.defaultWorkers, active: current?.active ?? true, updatedAt: now };
  const crews = current ? data.crews.map((x) => x.id === id ? crew : x) : [crew, ...data.crews];
  return enqueue({ ...data, crews }, 'crew.updated', id, now);
}

export function toggleCrew(data: AppData, crewId: string, now = new Date().toISOString()): AppData {
  const crews = data.crews.map((x) => x.id === crewId ? { ...x, active: !x.active, updatedAt: now } : x);
  return enqueue({ ...data, crews }, 'crew.updated', crewId, now);
}

export function addCrewShift(data: AppData, crew: string, workers: number, hours: number, output: string, downtime: string, date: string, now = new Date().toISOString(), details: { projectId?: string; crewId?: string; arrival?: string; departure?: string; stage?: string } = {}, lang: Lang = 'ru'): AppData {
  if (!crew.trim() || !date.trim() || !details.projectId && !projects[0]?.id || workers <= 0 || hours <= 0) return data;
  const id = `shift-${Date.parse(now)}`;
  const noDowntime = lang === 'uz' ? "Yo'q" : lang === 'en' ? 'No' : 'Нет';
  const shift: CrewShift = { id, projectId: details.projectId ?? 'p1', crewId: details.crewId, crew: crew.trim(), workers, hours, arrival: details.arrival?.trim() || undefined, departure: details.departure?.trim() || undefined, stage: details.stage?.trim() || undefined, output: output.trim(), downtime: downtime.trim() || noDowntime, date: date.trim(), createdAt: now };
  return enqueue({ ...data, shifts: [shift, ...data.shifts] }, 'shift.created', id, now);
}

export function saveSafetyChecklist(data: AppData, projectId: string, responsible: string, items: ChecklistItem[], signature: { x: number; y: number }[], date: string, now = new Date().toISOString()): AppData {
  if (!projectId || !responsible.trim() || !date || items.length === 0 || items.some((x) => !x.done) || signature.length < 3) return data;
  const id = `safety-${Date.parse(now)}`;
  const checklist: SafetyChecklist = { id, projectId, responsible: responsible.trim(), items, signature, date, completedAt: now };
  return enqueue({ ...data, safetyChecklists: [checklist, ...data.safetyChecklists] }, 'safety.checklist', id, now);
}

export function createSafetyViolation(data: AppData, value: { projectId: string; title: string; responsible: string; photoUri: string; latitude?: number; longitude?: number }, now = new Date().toISOString()): AppData {
  if (!value.projectId || !value.title.trim() || !value.responsible.trim() || !value.photoUri) return data;
  const id = `violation-${Date.parse(now)}`;
  const violation: SafetyViolation = { id, projectId: value.projectId, title: value.title.trim(), responsible: value.responsible.trim(), photoUri: value.photoUri, latitude: value.latitude, longitude: value.longitude, status: 'open', createdAt: now };
  return enqueue({ ...data, safetyViolations: [violation, ...data.safetyViolations] }, 'safety.violation', id, now);
}

export function advanceSafetyViolation(data: AppData, id: string, now = new Date().toISOString()): AppData {
  const safetyViolations = data.safetyViolations.map((x) => x.id !== id ? x : x.status === 'open' ? { ...x, status: 'fixing' as const } : { ...x, status: 'closed' as const, closedAt: now });
  return enqueue({ ...data, safetyViolations }, 'safety.updated', id, now);
}

export function createWorkAct(data: AppData, value: Omit<WorkAct, 'id' | 'createdAt' | 'pdfUri'>, now = new Date().toISOString()): AppData {
  if (!value.projectId || !value.number.trim() || !value.title.trim() || !value.contractor.trim() || !value.customer.trim() || !value.date || !Number.isFinite(value.amount) || value.amount < 0 || value.signature.length < 3) return data;
  const id = `act-${Date.parse(now)}`;
  const act: WorkAct = { ...value, id, number: value.number.trim(), title: value.title.trim(), contractor: value.contractor.trim(), customer: value.customer.trim(), notes: value.notes.trim(), createdAt: now };
  return enqueue({ ...data, acts: [act, ...data.acts] }, 'act.created', id, now);
}

export function attachActPdf(data: AppData, id: string, pdfUri: string, now = new Date().toISOString()): AppData {
  if (!pdfUri) return data;
  const acts = data.acts.map((x) => x.id === id ? { ...x, pdfUri } : x);
  return enqueue({ ...data, acts }, 'act.signed', id, now);
}
