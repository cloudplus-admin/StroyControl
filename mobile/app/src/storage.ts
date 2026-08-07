import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, Lang, Role, seedData } from './domain';

const KEY = 'stroycontrol:mvp:v7';
const PREFS_KEY = 'stroycontrol:preferences:v1';
export const BACKUP_VERSION = 1;
export type Preferences = { role: Role | null; lang: Lang };
export type BackupEnvelope = { app: 'StroyControl'; version: number; exportedAt: string; data: AppData };

export async function loadData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return seedData;
  try {
    const saved = JSON.parse(raw) as Partial<AppData>;
    const queue = (saved.queue ?? []).map((item) => ({ ...item, idempotencyKey: item.idempotencyKey ?? item.id, status: item.status ?? 'pending', attempts: item.attempts ?? 0 }));
    return { ...seedData, ...saved, projects: saved.projects ?? seedData.projects, reviewers: saved.reviewers ?? [], queue, acts: saved.acts ?? [], supplyRequests: saved.supplyRequests ?? seedData.supplyRequests, tools: saved.tools ?? seedData.tools, materials: saved.materials ?? seedData.materials, stockMovements: saved.stockMovements ?? seedData.stockMovements, crews: saved.crews ?? seedData.crews, shifts: saved.shifts ?? seedData.shifts, safetyChecklists: saved.safetyChecklists ?? [], safetyViolations: saved.safetyViolations ?? [] };
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

export function createBackup(data: AppData, exportedAt = new Date().toISOString()): BackupEnvelope {
  return { app: 'StroyControl', version: BACKUP_VERSION, exportedAt, data };
}

export function validateBackup(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Partial<BackupEnvelope>;
  if (envelope.app !== 'StroyControl' || envelope.version !== BACKUP_VERSION || !envelope.data) return null;
  const data = envelope.data as Partial<AppData>;
  if (!Array.isArray(data.tasks) || !Array.isArray(data.queue) || !Array.isArray(data.materials) || !Array.isArray(data.shifts)) return null;
  return { ...seedData, ...data, projects: data.projects ?? seedData.projects, acts: data.acts ?? [], crews: data.crews ?? seedData.crews, safetyChecklists: data.safetyChecklists ?? [], safetyViolations: data.safetyViolations ?? [] } as AppData;
}
