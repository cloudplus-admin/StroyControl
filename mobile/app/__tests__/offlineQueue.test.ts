import { describe, expect, it, vi } from 'vitest';
import { InMemoryQueueStorage, OfflineQueue, type CloseTaskJobPayload } from '../src/offline/offlineQueue';

function makePayload(overrides: Partial<CloseTaskJobPayload> = {}): CloseTaskJobPayload {
  return {
    taskId: 'task-1',
    companyId: 'demo-company',
    photoUrl: 'file:///tmp/photo.jpg',
    geoLat: 55.75,
    geoLng: 37.61,
    ...overrides,
  };
}

describe('OfflineQueue', () => {
  it('enqueues a job and persists it to storage', async () => {
    const storage = new InMemoryQueueStorage();
    const submit = vi.fn().mockRejectedValue(new Error('network down'));
    const queue = new OfflineQueue({ storage, submit, idFactory: () => 'job-1' });

    const job = await queue.enqueue(makePayload());

    expect(job.id).toBe('job-1');
    expect(queue.size).toBe(1);
    const persisted = await storage.load();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].payload.taskId).toBe('task-1');
  });

  it('submitOrQueue submits immediately on success without enqueuing', async () => {
    const storage = new InMemoryQueueStorage();
    const submit = vi.fn().mockResolvedValue(undefined);
    const queue = new OfflineQueue({ storage, submit });

    const result = await queue.submitOrQueue(makePayload());

    expect(result.queued).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('submitOrQueue falls back to the offline queue when submission fails', async () => {
    const storage = new InMemoryQueueStorage();
    const submit = vi.fn().mockRejectedValue(new Error('no network'));
    const queue = new OfflineQueue({ storage, submit, idFactory: () => 'job-2' });

    const result = await queue.submitOrQueue(makePayload({ taskId: 'task-2' }));

    expect(result.queued).toBe(true);
    if (result.queued) {
      expect(result.job.payload.taskId).toBe('task-2');
      expect(result.job.lastError).toBe('no network');
    }
    expect(queue.size).toBe(1);
  });

  it('flush removes successfully submitted jobs and keeps failed ones queued with incremented attempts', async () => {
    const storage = new InMemoryQueueStorage();
    let callCount = 0;
    const submit = vi.fn().mockImplementation(async (payload: CloseTaskJobPayload) => {
      callCount += 1;
      if (payload.taskId === 'fails-forever') {
        throw new Error('server error');
      }
      return undefined;
    });
    const queue = new OfflineQueue({ storage, submit, idFactory: () => `job-${callCount}` });

    await queue.enqueue(makePayload({ taskId: 'ok-1' }));
    await queue.enqueue(makePayload({ taskId: 'fails-forever' }));
    await queue.enqueue(makePayload({ taskId: 'ok-2' }));

    const result = await queue.flush();

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(queue.size).toBe(1);
    const remaining = queue.getPending();
    expect(remaining[0].payload.taskId).toBe('fails-forever');
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toBe('server error');
  });

  it('flush retries a previously failed job on the next call and succeeds once connectivity is back', async () => {
    const storage = new InMemoryQueueStorage();
    let shouldFail = true;
    const submit = vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error('offline');
      return undefined;
    });
    const queue = new OfflineQueue({ storage, submit });

    await queue.enqueue(makePayload());
    const firstFlush = await queue.flush();
    expect(firstFlush.failed).toHaveLength(1);
    expect(queue.size).toBe(1);
    expect(queue.getPending()[0].attempts).toBe(1);

    shouldFail = false;
    const secondFlush = await queue.flush();
    expect(secondFlush.succeeded).toHaveLength(1);
    expect(queue.size).toBe(0);
  });

  it('hydrate loads previously persisted jobs from storage exactly once', async () => {
    const storage = new InMemoryQueueStorage();
    await storage.save([
      {
        id: 'persisted-1',
        payload: makePayload({ taskId: 'restored' }),
        createdAt: new Date().toISOString(),
        attempts: 0,
      },
    ]);
    const submit = vi.fn().mockResolvedValue(undefined);
    const queue = new OfflineQueue({ storage, submit });

    await queue.hydrate();
    expect(queue.size).toBe(1);
    expect(queue.getPending()[0].payload.taskId).toBe('restored');

    // second hydrate should be a no-op (doesn't reset state even if storage changes)
    await storage.save([]);
    await queue.hydrate();
    expect(queue.size).toBe(1);
  });

  it('flush hydrates automatically even if enqueue/hydrate was never called first', async () => {
    const storage = new InMemoryQueueStorage();
    await storage.save([
      {
        id: 'p1',
        payload: makePayload(),
        createdAt: new Date().toISOString(),
        attempts: 0,
      },
    ]);
    const submit = vi.fn().mockResolvedValue(undefined);
    const queue = new OfflineQueue({ storage, submit });

    const result = await queue.flush();
    expect(result.succeeded).toEqual(['p1']);
  });
});
