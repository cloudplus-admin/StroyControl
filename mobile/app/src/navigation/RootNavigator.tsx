import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ObjectDetailScreen from '../screens/ObjectDetailScreen';
import ObjectsListScreen from '../screens/ObjectsListScreen';
import TaskCloseScreen from '../screens/TaskCloseScreen';
import TasksListScreen from '../screens/TasksListScreen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textDefault,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ObjectsList" component={ObjectsListScreen} options={{ title: 'Объекты' }} />
      <Stack.Screen
        name="ObjectDetail"
        component={ObjectDetailScreen}
        options={({ route }) => ({ title: route.params.objectName })}
      />
      <Stack.Screen
        name="TasksList"
        component={TasksListScreen}
        options={{ title: 'Задачи' }}
      />
      <Stack.Screen
        name="TaskClose"
        component={TaskCloseScreen}
        options={{ title: 'Закрытие задачи' }}
      />
    </Stack.Navigator>
  );
}
