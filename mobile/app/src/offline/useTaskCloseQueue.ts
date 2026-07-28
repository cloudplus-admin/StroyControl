import { useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { closeTask } from '../api/client';
import { AsyncStorageQueueStorage } from './asyncStorageQueueStorage';
import { CloseTaskJobPayload, OfflineQueue, QueuedJob } from './offlineQueue';

/**
 * React-хук, связывающий OfflineQueue с реальным окружением RN:
 * - хранилище — AsyncStorage (asyncStorageQueueStorage.ts)
 * - отправка — POST /api/tasks/:id/close через api/client.ts
 * - автоматический flush при восстановлении сети — @react-native-community/netinfo
 *
 * Вся содержательная логика (что считать успехом, как ретраить, как персистить)
 * находится в offlineQueue.ts и покрыта юнит-тестами независимо от этого хука.
 */
export function useTaskCloseQueue() {
  const queueRef = useRef<OfflineQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new OfflineQueue({
      storage: new AsyncStorageQueueStorage(),
      submit: (payload) =>
        closeTask(
          payload.taskId,
          { photoUrl: payload.photoUrl, geoLat: payload.geoLat, geoLng: payload.geoLng },
          payload.companyId,
        ).then(() => undefined),
    });
  }
  const queue = queueRef.current;

  const [pending, setPending] = useState<QueuedJob[]>([]);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const refreshPending = useMemo(
    () => async () => {
      await queue.hydrate();
      setPending(queue.getPending());
    },
    [queue],
  );

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(connected);
      if (connected) {
        queue.flush().then(() => refreshPending());
      }
    });
    return () => unsubscribe();
  }, [queue, refreshPending]);

  async function submitOrQueue(payload: CloseTaskJobPayload) {
    const result = await queue.submitOrQueue(payload);
    await refreshPending();
    return result;
  }

  return { pending, isConnected, submitOrQueue, refreshPending };
}
