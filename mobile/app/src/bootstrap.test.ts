import { describe, expect, it } from 'vitest';
import { canonicalMediaUrl, mergeBootstrap } from './bootstrap';
import { closeTask, reviewTask, seedData, toggleChecklist } from './domain';

const response = { serverTime: '2026-08-03T00:00:00Z', objects: [{ id: 'o1', name: 'Server object', address: 'Tashkent', progress: 25, tasks: [{ id: 'server-task', objectId: 'o1', stage: 'Каркас', title: 'Server task', due: '2026-08-10', priority: 'high', assignee: 'Прораб', status: 'in_progress', checklist: [] }], feed: [{ id: 'feed-1', objectId: 'o1', author: 'Foreman', body: 'Server message', reactions: 2, createdAt: '2026-08-03T01:00:00Z' }], photoReports: [{ id: 'photo-1', objectId: 'o1', taskId: 'server-task', point: 'Axis A', kind: 'progress', fileUrl: 'https://cdn.test/photo.jpg', createdAt: '2026-08-03T02:00:00Z' }], defects: [{ id: 'defect-1', objectId: 'o1', description: 'Crack', status: 'in_progress', createdAt: '2026-08-03T03:00:00Z' }] }] };

describe('mergeBootstrap', () => {
  it('исправляет http origin старых ссылок загрузок на production API', () => {
    expect(canonicalMediaUrl('http://stroycontrol-api.cloudplus.uz/api/uploads/abc?x=1')).toBe('https://stroycontrol-api.cloudplus.uz/api/uploads/abc?x=1');
  });
  it('исправляет origin PDF документов и актов из bootstrap', () => {
    const withPdf = { ...response, objects: [{ ...response.objects[0]!, documents: [{ id: 'doc-1', objectId: 'o1', name: 'Смета', version: 1, uri: 'http://internal-host/api/uploads/doc-pdf', status: 'review', createdAt: '2026-08-03T04:00:00Z' }], acts: [{ id: 'act-1', objectId: 'o1', template: 'completed', number: '1', title: 'Акт', amount: 1, status: 'review', pdfUri: 'http://internal-host/api/uploads/act-pdf', createdAt: '2026-08-03T05:00:00Z' }] }] };

    const result = mergeBootstrap(seedData, withPdf);

    expect(result.documents[0]?.uri).toBe('https://stroycontrol-api.cloudplus.uz/api/uploads/doc-pdf');
    expect(result.acts[0]?.pdfUri).toBe('https://stroycontrol-api.cloudplus.uz/api/uploads/act-pdf');
  });
  it('replaces demo objects and tasks with server data', () => {
    const located = { ...response, objects: [{ ...response.objects[0]!, latitude: 41.311081, longitude: 69.240562 }] };
    const result = mergeBootstrap(seedData, located);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.name).toBe('Server object');
    expect(result.projects[0]?.latitude).toBe(41.311081);
    expect(result.projects[0]?.longitude).toBe(69.240562);
    expect(result.tasks[0]).toMatchObject({ id: 'server-task', projectId: 'o1', status: 'in_progress' });
    expect(result.messages[0]).toMatchObject({ id: 'feed-1', text: 'Server message', reactions: 2 });
    expect(result.qualityReports[0]).toMatchObject({ id: 'photo-1', projectId: 'o1', status: 'accepted' });
    expect(result.defects[0]).toMatchObject({ id: 'defect-1', status: 'fixing' });
  });

  it('maps all task closure photos from bootstrap', () => {
    const withPhotos = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, closurePhotos: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'] }] }] };
    expect(mergeBootstrap(seedData, withPhotos).tasks[0]?.photoUris).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg']);
  });

  it('maps editable task fields from bootstrap', () => {
    const editable = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, description: 'Описание работ', assigneeId: 'user-1' }] }] };
    expect(mergeBootstrap(seedData, editable).tasks[0]).toMatchObject({ description: 'Описание работ', assigneeId: 'user-1' });
  });

  it('keeps a server task awaiting inspector review actionable', () => {
    const awaitingReview = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, status: 'review' }] }] };
    expect(mergeBootstrap(seedData, awaitingReview).tasks[0]?.status).toBe('review');
  });

  it('keeps an offline-closed task in review until its queue is sent', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task' }] };
    const queued = closeTask(base, 'server-task', 'file:///photo.jpg', 41.3, 69.2);
    expect(mergeBootstrap(queued, response).tasks[0]?.status).toBe('review');
  });

  it('removes a stale close operation when bootstrap proves the task is already under review', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', reviewerId: 'reviewer-1' }] };
    const queued = closeTask(base, 'server-task', 'file:///photo.jpg', 41.3, 69.2);
    const awaitingReview = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, status: 'review', closurePhotos: ['https://cdn.test/photo.jpg'] }] }] };

    const result = mergeBootstrap(queued, awaitingReview);

    expect(result.queue).toHaveLength(0);
    expect(result.tasks[0]).toMatchObject({ status: 'review', photoUris: ['https://cdn.test/photo.jpg'] });
  });

  it('does not remove an offline close operation while the server task is still active', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', reviewerId: 'reviewer-1' }] };
    const queued = closeTask(base, 'server-task', 'file:///photo.jpg', 41.3, 69.2);

    expect(mergeBootstrap(queued, response).queue).toHaveLength(1);
  });

  it('does not treat review status without a persisted photo as a confirmed close', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', reviewerId: 'reviewer-1' }] };
    const queued = closeTask(base, 'server-task', 'file:///photo.jpg', 41.3, 69.2);
    const statusOnly = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, status: 'review', closurePhotos: [] }] }] };

    expect(mergeBootstrap(queued, statusOnly).queue).toHaveLength(1);
  });

  it('removes stale checklist operations but keeps an unconfirmed photo close', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', reviewerId: 'reviewer-1' }] };
    const withChecklist = toggleChecklist(base, 'server-task', base.tasks[0]!.checklist[0]!.id);
    const queued = closeTask(withChecklist, 'server-task', 'file:///photo.jpg', 41.3, 69.2);
    const awaitingReview = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, status: 'review' }] }] };

    const result = mergeBootstrap(queued, awaitingReview);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.type).toBe('task.closed');
  });

  it('keeps an offline inspector decision until it is sent', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', status: 'review' as const }] };
    const queued = reviewTask(base, 'server-task', 'accepted', 'Принято');
    expect(mergeBootstrap(queued, response).tasks[0]?.status).toBe('done');
  });
});
