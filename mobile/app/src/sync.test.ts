import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
import { addDefectPhoto, closeTask, createDefect, reviewTask, seedData, toggleChecklist } from './domain';
import { retryDelayMs, syncQueue } from './sync';

describe('syncQueue', () => {
  it('отправляет накопленные изменения чек-листа и очищает старую очередь', async () => {
    const queued = toggleChecklist(seedData, 't-101', 'c-101-1');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await syncQueue(queued, { request } as unknown as ApiClient);
    expect(result.queue).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(queued.tasks.find((task) => task.id === 't-101')!.checklist.length);
    expect(request.mock.calls[0]?.[0]).toContain('/api/tasks/t-101/checklist/');
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toHaveProperty('isDone');
  });

  it('схлопывает старые дубликаты чек-листа в одну отправку', async () => {
    let queued = toggleChecklist(seedData, 't-101', 'c-101-1');
    queued = toggleChecklist(queued, 't-101', 'c-101-2');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await syncQueue(queued, { request } as unknown as ApiClient);
    expect(result.queue).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(queued.tasks.find((task) => task.id === 't-101')!.checklist.length);
  });

  it('удаляет устаревшую очередь чек-листа у уже закрытой задачи без запросов', async () => {
    const queued = toggleChecklist(seedData, 't-101', 'c-101-1');
    const closed = { ...queued, tasks: queued.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'done' as const } : task) };
    const request = vi.fn();
    expect((await syncQueue(closed, { request } as unknown as ApiClient)).queue).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('удаляет conflict и failed записи чек-листа после закрытия задачи', async () => {
    let queued = toggleChecklist(seedData, 't-101', 'c-101-1');
    queued = toggleChecklist(queued, 't-101', 'c-101-2');
    queued = {
      ...queued,
      tasks: queued.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'done' as const } : task),
      queue: queued.queue.map((item, index) => index === 0
        ? { ...item, status: 'conflict' as const }
        : { ...item, status: 'failed' as const, nextAttemptAt: '2099-01-01T00:00:00.000Z' }),
    };
    const request = vi.fn();
    expect((await syncQueue(queued, { request } as unknown as ApiClient)).queue).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('удаляет подтвержденную операцию и повторно использует сохраненный ключ', async () => {
    const queued = closeTask(seedData, 't-101', 'https://cdn.test/photo.jpg', 41.3, 69.2, '2026-08-03T06:00:00.000Z');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await syncQueue(queued, { request } as unknown as ApiClient);
    expect(result.queue).toHaveLength(0);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ 'idempotency-key': queued.queue[0]?.idempotencyKey });
  });

  it('сохраняет операцию после сетевой ошибки и ставит exponential backoff', async () => {
    const queued = closeTask(seedData, 't-101', 'https://cdn.test/photo.jpg', 41.3, 69.2, '2026-08-03T06:00:00.000Z');
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    const now = Date.parse('2026-08-03T06:01:00.000Z');
    const result = await syncQueue(queued, { request } as unknown as ApiClient, now);
    expect(result.queue[0]).toMatchObject({ status: 'failed', attempts: 1, lastError: 'offline' });
    expect(result.queue[0]?.nextAttemptAt).toBe(new Date(now + retryDelayMs(1)).toISOString());
  });

  it('не повторяет конфликтующую операцию', async () => {
    const queued = closeTask(seedData, 't-101', 'https://cdn.test/photo.jpg', 41.3, 69.2);
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
    const result = await syncQueue(queued, { request } as unknown as ApiClient);
    expect(result.queue[0]?.status).toBe('conflict');
  });

  it('загружает несколько локальных фото перед закрытием и сохраняет загруженные URL после ошибки close', async () => {
    const queued = closeTask(seedData, 't-101', ['file:///photo-1.jpg', 'file:///photo-2.jpg'], 41.3, 69.2);
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('close offline'));
    const uploadFile = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://api.test/api/uploads/u1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://api.test/api/uploads/u2' }), { status: 201 }));
    const first = await syncQueue(queued, { request, uploadFile } as unknown as ApiClient, Date.now());
    expect(first.queue[0]?.payload && 'photoUrls' in first.queue[0].payload ? first.queue[0].payload.photoUrls : undefined).toEqual(['https://api.test/api/uploads/u1', 'https://api.test/api/uploads/u2']);
    expect(uploadFile.mock.calls[0]?.slice(0, 2)).toEqual(['/api/uploads', 'file:///photo-1.jpg']);
    expect(uploadFile.mock.calls[0]?.[2]).toMatchObject({ 'content-type': 'image/jpeg', 'x-task-id': 't-101' });
    const retryRequest = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    expect((await syncQueue({ ...first, queue: first.queue.map((item) => ({ ...item, nextAttemptAt: undefined })) }, { request: retryRequest } as unknown as ApiClient, Date.now())).queue).toHaveLength(0);
    expect(retryRequest).toHaveBeenCalledTimes(1);
  });

  it('отправляет решение технадзора через durable queue', async () => {
    const base = { ...seedData, tasks: seedData.tasks.map((task, index) => index === 0 ? { ...task, status: 'review' as const } : task) };
    const queued = reviewTask(base, base.tasks[0]!.id, 'rejected', 'Переделать узел', '2026-08-03T07:00:00.000Z');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await syncQueue(queued, { request } as unknown as ApiClient);
    expect(result.queue).toHaveLength(0);
    expect(request.mock.calls[0]?.[0]).toContain('/review');
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ decision: 'rejected', note: 'Переделать узел' });
  });

  it('создает дефект на сервере и заменяет временный id', async () => {
    const queued = createDefect(seedData, 'Трещина', '2026-08-03T08:00:00.000Z', 'p2');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'server-defect', status: 'open', createdAt: '2026-08-03T08:01:00.000Z' }), { status: 201 }));
    const api = { request, getSession: () => ({ user: { id: 'user-1' } }) } as unknown as ApiClient;
    const result = await syncQueue(queued, api);
    expect(result.queue).toHaveLength(0);
    expect(result.defects[0]).toMatchObject({ id: 'server-defect', projectId: 'p2', title: 'Трещина' });
    expect(request.mock.calls[0]?.[0]).toBe('/api/objects/p2/defects');
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ reportedBy: 'user-1', description: 'Трещина' });
  });

  it('после создания отправляет следующий статус уже по серверному id', async () => {
    let queued = createDefect(seedData, 'Скол', '2026-08-03T09:00:00.000Z', 'p1');
    queued = addDefectPhoto(queued, queued.defects[0]!.id, 'after', 'file:///after.jpg');
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'server-defect', status: 'open', createdAt: '2026-08-03T09:01:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const api = { request, getSession: () => ({ user: { id: 'user-1' } }) } as unknown as ApiClient;
    const result = await syncQueue(queued, api);
    expect(result.queue).toHaveLength(0);
    expect(request.mock.calls[1]?.[0]).toBe('/api/defects/server-defect');
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({ status: 'verified' });
  });
});
