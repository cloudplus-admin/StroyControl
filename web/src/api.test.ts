import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

describe('web API client', () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('sends the access token without a client-controlled company header', async () => {
    storage.set('stroycontrol:web:session:v1', JSON.stringify({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      user: { id: 'user-1', fullName: 'Admin', email: 'admin@example.com', companyName: 'Company', roles: [] },
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { Api } = await import('./api');

    await new Api().request('/api/objects');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.has('x-company-id')).toBe(false);
  });

  it('clears an invalid session when refresh is rejected', async () => {
    storage.set('stroycontrol:web:session:v1', JSON.stringify({
      accessToken: 'expired', refreshToken: 'invalid', expiresIn: 0,
      user: { id: 'user-1', fullName: 'Admin', email: 'admin@example.com', companyName: 'Company', roles: [] },
    }));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 })));
    const { Api } = await import('./api');

    const response = await new Api().request('/api/objects');

    expect(response.status).toBe(401);
    expect(storage.has('stroycontrol:web:session:v1')).toBe(false);
  });
});
