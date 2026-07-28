/**
 * Типы запросов/ответов REST API StroyControl backend.
 * Держим в синхронизации вручную с backend/src/modules/{objects,tasks}/{router,schemas,service}.ts —
 * общего пакета типов между backend и mobile пока нет (см. TODO в mobile/README.md).
 */

export type RiskLevel = 'overdue' | 'risk' | 'on_track';

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'overdue';

export type TaskPriority = 'low' | 'normal' | 'high';

/** Элемент ответа GET /api/objects */
export interface ObjectSummary {
  id: string;
  name: string;
  address: string | null;
  status: string;
  templateCode: string | null;
  createdAt: string;
  progress: number;
  riskLevel: RiskLevel;
  taskCount: number;
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  createdAt: string;
}

export interface WorkSectionDetail {
  id: string;
  name: string;
  tasks: TaskDetail[];
}

export interface StageDetail {
  id: string;
  name: string;
  sections: WorkSectionDetail[];
}

/** Ответ GET /api/objects/:id */
export interface ObjectDetail {
  id: string;
  name: string;
  address: string | null;
  status: string;
  templateCode: string | null;
  stages: StageDetail[];
}

export interface GanttTask {
  id: string;
  title: string;
  status: TaskStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  dependsOn: string[];
  riskLevel: RiskLevel;
}

export interface GanttSection {
  id: string;
  name: string;
  tasks: GanttTask[];
}

export interface GanttStage {
  id: string;
  name: string;
  sections: GanttSection[];
}

/** Ответ GET /api/objects/:id/gantt */
export interface GanttData {
  objectId: string;
  objectName: string;
  stages: GanttStage[];
}

/** Тело запроса POST /api/tasks/:id/close (см. tasks/schemas.ts closeTaskSchema) */
export interface CloseTaskPayload {
  photoUrl: string;
  geoLat: number;
  geoLng: number;
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
