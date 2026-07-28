import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueuedJob, QueueStorage } from './offlineQueue';

const STORAGE_KEY = '@stroycontrol/task-close-queue';

/**
 * RN-специфичная обвязка над OfflineQueue: персистит задания в AsyncStorage
 * в виде одного JSON-ключа. Логика очереди (offlineQueue.ts) ничего не знает
 * про AsyncStorage — это единственное место, где он используется.
 */
export class AsyncStorageQueueStorage implements QueueStorage {
  async load(): Promise<QueuedJob[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueuedJob[]) : [];
    } catch {
      return [];
    }
  }

  async save(jobs: QueuedJob[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }
}
