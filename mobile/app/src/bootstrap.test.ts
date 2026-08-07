import { describe, expect, it } from 'vitest';
import { mergeBootstrap } from './bootstrap';
import { closeTask, reviewTask, seedData } from './domain';

const response = { serverTime: '2026-08-03T00:00:00Z', objects: [{ id: 'o1', name: 'Server object', address: 'Tashkent', progress: 25, tasks: [{ id: 'server-task', objectId: 'o1', stage: 'Каркас', title: 'Server task', due: '2026-08-10', priority: 'high', assignee: 'Прораб', status: 'in_progress', checklist: [] }], feed: [{ id: 'feed-1', objectId: 'o1', author: 'Foreman', body: 'Server message', reactions: 2, createdAt: '2026-08-03T01:00:00Z' }], photoReports: [{ id: 'photo-1', objectId: 'o1', taskId: 'server-task', point: 'Axis A', kind: 'progress', fileUrl: 'https://cdn.test/photo.jpg', createdAt: '2026-08-03T02:00:00Z' }], defects: [{ id: 'defect-1', objectId: 'o1', description: 'Crack', status: 'in_progress', createdAt: '2026-08-03T03:00:00Z' }] }] };

describe('mergeBootstrap', () => {
  it('replaces demo objects and tasks with server data', () => {
    const result = mergeBootstrap(seedData, response);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.name).toBe('Server object');
    expect(result.tasks[0]).toMatchObject({ id: 'server-task', projectId: 'o1', status: 'in_progress' });
    expect(result.messages[0]).toMatchObject({ id: 'feed-1', text: 'Server message', reactions: 2 });
    expect(result.qualityReports[0]).toMatchObject({ id: 'photo-1', projectId: 'o1', status: 'accepted' });
    expect(result.defects[0]).toMatchObject({ id: 'defect-1', status: 'fixing' });
  });

  it('maps all task closure photos from bootstrap', () => {
    const withPhotos = { ...response, objects: [{ ...response.objects[0]!, tasks: [{ ...response.objects[0]!.tasks[0]!, closurePhotos: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'] }] }] };
    expect(mergeBootstrap(seedData, withPhotos).tasks[0]?.photoUris).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg']);
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

  it('keeps an offline inspector decision until it is sent', () => {
    const base = { ...seedData, tasks: [{ ...seedData.tasks[0]!, id: 'server-task', status: 'review' as const }] };
    const queued = reviewTask(base, 'server-task', 'accepted', 'Принято');
    expect(mergeBootstrap(queued, response).tasks[0]?.status).toBe('done');
  });
});
