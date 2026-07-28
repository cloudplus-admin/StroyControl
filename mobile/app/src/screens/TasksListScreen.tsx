import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchObjectDetail } from '../api/client';
import type { TaskDetail } from '../api/types';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'TasksList'>;

/**
 * У backend нет отдельного эндпоинта "GET /api/tasks?objectId=...", список задач
 * получается из GET /api/objects/:id (дерево stages -> sections -> tasks), см.
 * backend/src/modules/objects/service.ts getObject(). Разворачиваем дерево в плоский
 * список для мобильного экрана.
 */
function flattenTasks(stages: Awaited<ReturnType<typeof fetchObjectDetail>>['stages']): TaskDetail[] {
  return stages.flatMap((stage) => stage.sections.flatMap((section) => section.tasks));
}

const STATUS_LABEL: Record<TaskDetail['status'], string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  done: 'Закрыта',
  overdue: 'Просрочена',
};

export default function TasksListScreen({ route, navigation }: Props) {
  const { objectId, objectName } = route.params;
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const detail = await fetchObjectDetail(objectId);
      setTasks(flattenTasks(detail.stages));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить задачи');
    }
  }, [objectId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={tasks}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={<Text style={styles.header}>{objectName}</Text>}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.errorText}>Задач пока нет</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardStatus}>{STATUS_LABEL[item.status]}</Text>
          {item.status !== 'done' ? (
            <Pressable
              style={styles.closeButton}
              onPress={() => navigation.navigate('TaskClose', { taskId: item.id, taskTitle: item.title })}
            >
              <Text style={styles.closeButtonText}>Закрыть с фото и геометкой</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.textMuted, textAlign: 'center' },
  header: { fontSize: 18, fontWeight: '700', color: colors.textDefault, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.textDefault },
  cardStatus: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  closeButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
