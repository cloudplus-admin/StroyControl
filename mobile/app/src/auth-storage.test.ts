import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);

import { loadSession, saveSession } from './auth-storage';

const session = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900,
};

describe('auth storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses an Android SecureStore-compatible key', async () => {
    await saveSession(session);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'stroycontrol.auth.session.v1',
      JSON.stringify(session),
    );
  });

  it('loads and deletes the same session key', async () => {
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(session));

    await expect(loadSession()).resolves.toEqual(session);
    await saveSession(null);

    expect(secureStore.getItemAsync).toHaveBeenCalledWith('stroycontrol.auth.session.v1');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('stroycontrol.auth.session.v1');
  });
});
