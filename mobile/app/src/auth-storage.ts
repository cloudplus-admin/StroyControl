import * as SecureStore from 'expo-secure-store';
import { Session } from './api';

// SecureStore keys may contain only alphanumeric characters, ".", "-" and "_".
const SESSION_KEY = 'stroycontrol.auth.session.v1';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch { return null; }
}

export async function saveSession(session: Session | null): Promise<void> {
  if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}
