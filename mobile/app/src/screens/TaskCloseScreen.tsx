import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { env } from '../config/env';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { useTaskCloseQueue } from '../offline/useTaskCloseQueue';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskClose'>;

type Coords = { lat: number; lng: number };

export default function TaskCloseScreen({ route, navigation }: Props) {
  const { taskId, taskTitle } = route.params;
  const { submitOrQueue, isConnected, pending } = useTaskCloseQueue();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа к камере', 'Разрешите доступ к камере в настройках устройства');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function captureLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа к геолокации', 'Разрешите доступ к геолокации в настройках устройства');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
  }

  async function onSubmit() {
    if (!photoUri || !coords) {
      Alert.alert('Заполните данные', 'Нужны фото и геометка, чтобы закрыть задачу');
      return;
    }
    setBusy(true);
    try {
      const result = await submitOrQueue({
        taskId,
        companyId: env.companyId,
        photoUrl: photoUri,
        geoLat: coords.lat,
        geoLng: coords.lng,
      });
      if (result.queued) {
        Alert.alert(
          'Сохранено офлайн',
          'Нет соединения — закрытие задачи сохранено локально и отправится автоматически при восстановлении сети.',
        );
      } else {
        Alert.alert('Готово', 'Задача закрыта');
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось закрыть задачу');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{taskTitle}</Text>

      {isConnected === false ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Нет сети — закрытия будут отправлены в очередь</Text>
        </View>
      ) : null}
      {pending.length > 0 ? (
        <View style={styles.queueBanner}>
          <Text style={styles.queueBannerText}>В офлайн-очереди: {pending.length}</Text>
        </View>
      ) : null}

      <Pressable style={styles.actionButton} onPress={pickPhoto}>
        <Text style={styles.actionButtonText}>{photoUri ? 'Переснять фото' : 'Сделать фото'}</Text>
      </Pressable>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} /> : null}

      <Pressable style={styles.actionButton} onPress={captureLocation}>
        <Text style={styles.actionButtonText}>
          {coords ? 'Обновить геометку' : 'Определить геометку'}
        </Text>
      </Pressable>
      {coords ? (
        <Text style={styles.coordsText}>
          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </Text>
      ) : null}

      <Pressable
        style={[styles.submitButton, busy ? styles.submitButtonDisabled : null]}
        onPress={onSubmit}
        disabled={busy}
      >
        <Text style={styles.submitButtonText}>{busy ? 'Отправка…' : 'Закрыть задачу'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textDefault, marginBottom: 16 },
  offlineBanner: {
    backgroundColor: colors.warning,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  offlineBannerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  queueBanner: {
    backgroundColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  queueBannerText: { color: colors.textDefault, fontSize: 12 },
  actionButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: { color: colors.textDefault, fontWeight: '600' },
  preview: { width: '100%', height: 200, borderRadius: 10, marginBottom: 16 },
  coordsText: { color: colors.textMuted, fontSize: 12, marginBottom: 16 },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontWeight: '700' },
});
