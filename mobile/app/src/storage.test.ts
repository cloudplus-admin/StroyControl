import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedData, toggleChecklist } from './domain';
import { loadData, migrateLegacyChecklistQueue } from './storage';

const asyncStorage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { asyncStorage.set(key, value); }),
  },
}));

describe('legacy checklist queue migration', () => {
  beforeEach(() => asyncStorage.clear());

  it('removes every legacy checklist update for review and done tasks', () => {
    let legacy = toggleChecklist(seedData, 't-101', 'c-101-1');
    legacy = toggleChecklist(legacy, 't-101', 'c-101-2');
    legacy = {
      ...legacy,
      tasks: legacy.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'done' as const } : task),
      queue: legacy.queue.map((item, index) => ({
        ...item,
        status: index === 0 ? 'conflict' as const : 'failed' as const,
        nextAttemptAt: '2099-01-01T00:00:00.000Z',
      })),
    };

    const migrated = migrateLegacyChecklistQueue(legacy);

    expect(migrated.queue).toHaveLength(0);
  });

  it('keeps pending checklist work for an active task and other operations', () => {
    const active = toggleChecklist(seedData, 't-101', 'c-101-1');
    const withClose = {
      ...active,
      queue: [...active.queue, { ...active.queue[0]!, id: 'close-1', type: 'task.closed' as const }],
    };

    expect(migrateLegacyChecklistQueue(withClose).queue).toEqual(withClose.queue);
  });

  it('is idempotent', () => {
    const closed = {
      ...toggleChecklist(seedData, 't-101', 'c-101-1'),
      tasks: seedData.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'review' as const } : task),
    };
    const once = migrateLegacyChecklistQueue(closed);

    expect(migrateLegacyChecklistQueue(once)).toBe(once);
  });

  it('upgrades and persists the database written by an older installed APK', async () => {
    let oldDatabase = toggleChecklist(seedData, 't-101', 'c-101-1');
    for (let index = 1; index < 17; index += 1) {
      oldDatabase = toggleChecklist(oldDatabase, 't-101', index % 2 ? 'c-101-2' : 'c-101-1');
    }
    oldDatabase = {
      ...oldDatabase,
      tasks: oldDatabase.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'done' as const } : task),
      queue: oldDatabase.queue.map((item) => ({ ...item, status: 'failed' as const })),
    };
    asyncStorage.set('stroycontrol:mvp:v7', JSON.stringify(oldDatabase));

    const loaded = await loadData();
    const persisted = JSON.parse(asyncStorage.get('stroycontrol:mvp:v7')!) as typeof oldDatabase;

    expect(oldDatabase.queue).toHaveLength(17);
    expect(loaded.queue).toHaveLength(0);
    expect(persisted.queue).toHaveLength(0);
    expect(asyncStorage.get('stroycontrol:migration:legacy-checklist-queue:v2')).toBe('done');
  });

  it('runs corrected v2 migration even when an earlier APK marked v1 complete', async () => {
    let oldDatabase = toggleChecklist(seedData, 't-101', 'c-101-1');
    oldDatabase = {
      ...oldDatabase,
      tasks: oldDatabase.tasks.map((task) => task.id === 't-101' ? { ...task, status: 'done' as const } : task),
    };
    asyncStorage.set('stroycontrol:mvp:v7', JSON.stringify(oldDatabase));
    asyncStorage.set('stroycontrol:migration:legacy-checklist-queue:v1', 'done');

    const loaded = await loadData();

    expect(loaded.queue).toHaveLength(0);
    expect(asyncStorage.get('stroycontrol:migration:legacy-checklist-queue:v2')).toBe('done');
  });
});
