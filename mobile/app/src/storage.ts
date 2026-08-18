import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, Lang, Role, seedData } from './domain';

const KEY = 'stroycontrol:mvp:v7';
const PREFS_KEY = 'stroycontrol:preferences:v1';
// v1 shipped in intermediate field builds and could be marked complete before
// the final reconciliation rules were installed. Use a new key so every device
// that has already run those builds performs the corrected migration once.
const LEGACY_CHECKLIST_QUEUE_MIGRATION_KEY = 'stroycontrol:migration:legacy-checklist-queue:v2';
export type Preferences = { role: Role | null; lang: Lang };

export function migrateLegacyChecklistQueue(data: AppData): AppData {
  const closedTaskIds = new Set(
    data.tasks
      .filter((task) => task.status === 'review' || task.status === 'done')
      .map((task) => task.id),
  );
  const queue = data.queue.filter(
    (item) => item.type !== 'task.updated' || !closedTaskIds.has(item.entityId),
  );
  return queue.length === data.queue.length ? data : { ...data, queue };
}

export async function loadData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return seedData;
  try {
    const saved = JSON.parse(raw) as Partial<AppData>;
    const queue = (saved.queue ?? []).map((item) => ({ ...item, idempotencyKey: item.idempotencyKey ?? item.id, status: item.status ?? 'pending', attempts: item.attempts ?? 0 }));
    const hydrated = { ...seedData, ...saved, projects: saved.projects ?? seedData.projects, reviewers: saved.reviewers ?? [], queue, acts: saved.acts ?? [], supplyRequests: saved.supplyRequests ?? seedData.supplyRequests, tools: saved.tools ?? seedData.tools, materials: saved.materials ?? seedData.materials, stockMovements: saved.stockMovements ?? seedData.stockMovements, crews: saved.crews ?? seedData.crews, shifts: saved.shifts ?? seedData.shifts, safetyChecklists: saved.safetyChecklists ?? [], safetyViolations: saved.safetyViolations ?? [] } as AppData;
    const migrationDone = await AsyncStorage.getItem(LEGACY_CHECKLIST_QUEUE_MIGRATION_KEY);
    if (migrationDone) return hydrated;
    const migrated = migrateLegacyChecklistQueue(hydrated);
    // Persist the cleaned database before marking the migration complete and
    // before App renders it. Re-running after a partial write is safe.
    await AsyncStorage.setItem(KEY, JSON.stringify(migrated));
    await AsyncStorage.setItem(LEGACY_CHECKLIST_QUEUE_MIGRATION_KEY, 'done');
    return migrated;
  } catch { return seedData; }
}

export async function saveData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { role: null, lang: 'ru' };
    const value = JSON.parse(raw) as Partial<Preferences>;
    return { role: value.role ?? null, lang: value.lang === 'uz' || value.lang === 'en' ? value.lang : 'ru' };
  } catch { return { role: null, lang: 'ru' }; }
}

export async function savePreferences(value: Preferences): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(value));
}
