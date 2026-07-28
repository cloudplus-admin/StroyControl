import { env } from '../config/env';
import type { ApiErrorBody, CloseTaskPayload, GanttData, ObjectDetail, ObjectSummary } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  companyId?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, companyId = env.companyId } = options;

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let parsedBody: ApiErrorBody | undefined;
    try {
      parsedBody = (await response.json()) as ApiErrorBody;
    } catch {
      parsedBody = undefined;
    }
    throw new ApiError(response.status, parsedBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** GET /api/objects — список объектов текущей компании. */
export function fetchObjects(companyId?: string): Promise<ObjectSummary[]> {
  return request<ObjectSummary[]>('/api/objects', { companyId });
}

/** GET /api/objects/:id — карточка объекта со стадиями/разделами/задачами. */
export function fetchObjectDetail(objectId: string, companyId?: string): Promise<ObjectDetail> {
  return request<ObjectDetail>(`/api/objects/${objectId}`, { companyId });
}

/** GET /api/objects/:id/gantt — те же задачи, но с риск-статусом и baseline-датами. */
export function fetchObjectGantt(objectId: string, companyId?: string): Promise<GanttData> {
  return request<GanttData>(`/api/objects/${objectId}/gantt`, { companyId });
}

/** POST /api/tasks/:id/close — закрытие задачи с фото и геометкой. */
export function closeTask(
  taskId: string,
  payload: CloseTaskPayload,
  companyId?: string,
): Promise<unknown> {
  return request(`/api/tasks/${taskId}/close`, { method: 'POST', body: payload, companyId });
}
