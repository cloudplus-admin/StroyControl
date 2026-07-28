import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchObjects } from '../api/client';
import type { ObjectSummary } from '../api/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, riskColors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ObjectsList'>;

const RISK_LABEL: Record<ObjectSummary['riskLevel'], string> = {
  overdue: 'Просрочка',
  risk: 'Риск',
  on_track: 'В графике',
};

export default function ObjectsListScreen({ navigation }: Props) {
  const [objects, setObjects] = useState<ObjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchObjects();
      setObjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить объекты');
    }
  }, []);

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
      data={objects}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.errorText}>Объектов пока нет</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() =>
            navigation.navigate('ObjectDetail', { objectId: item.id, objectName: item.name })
          }
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={[styles.badge, { backgroundColor: riskColors[item.riskLevel] }]}>
              <Text style={styles.badgeText}>{RISK_LABEL[item.riskLevel]}</Text>
            </View>
          </View>
          {item.address ? <Text style={styles.cardSubtitle}>{item.address}</Text> : null}
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{item.progress}%</Text>
          </View>
          <Text style={styles.taskCount}>Задач: {item.taskCount}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.textDefault, flexShrink: 1 },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progressLabel: { fontSize: 12, color: colors.textMuted, width: 36, textAlign: 'right' },
  taskCount: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
});
