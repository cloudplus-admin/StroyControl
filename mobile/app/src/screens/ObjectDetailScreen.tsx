import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchObjectGantt } from '../api/client';
import type { GanttData, GanttTask } from '../api/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, riskColors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ObjectDetail'>;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
}

function TaskRow({ task }: { task: GanttTask }) {
  return (
    <View style={styles.taskRow}>
      <View style={[styles.riskDot, { backgroundColor: riskColors[task.riskLevel] }]} />
      <View style={styles.taskInfo}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.taskDates}>
          {formatDate(task.plannedStart)} → {formatDate(task.plannedEnd)}
        </Text>
      </View>
      <Text style={styles.taskStatus}>{task.status}</Text>
    </View>
  );
}

export default function ObjectDetailScreen({ route, navigation }: Props) {
  const { objectId, objectName } = route.params;
  const [gantt, setGantt] = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchObjectGantt(objectId)
      .then((data) => {
        if (!cancelled) setGantt(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить данные объекта');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !gantt) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Данные недоступны'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable
        style={styles.tasksButton}
        onPress={() => navigation.navigate('TasksList', { objectId, objectName })}
      >
        <Text style={styles.tasksButtonText}>Открыть задачи объекта →</Text>
      </Pressable>

      {gantt.stages.length === 0 ? (
        <Text style={styles.errorText}>Стадий пока нет</Text>
      ) : (
        gantt.stages.map((stage) => (
          <View key={stage.id} style={styles.stageBlock}>
            <Text style={styles.stageTitle}>{stage.name}</Text>
            {stage.sections.map((section) => (
              <View key={section.id} style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{section.name}</Text>
                {section.tasks.length === 0 ? (
                  <Text style={styles.emptyText}>Нет задач</Text>
                ) : (
                  section.tasks.map((task) => <TaskRow key={task.id} task={task} />)
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.textMuted, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 12, paddingVertical: 4 },
  tasksButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  tasksButtonText: { color: '#fff', fontWeight: '600' },
  stageBlock: {
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  stageTitle: { fontSize: 15, fontWeight: '700', color: colors.textDefault, marginBottom: 8 },
  sectionBlock: { marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 13, color: colors.textDefault },
  taskDates: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  taskStatus: { fontSize: 11, color: colors.textMuted },
});
