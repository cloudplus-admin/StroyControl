import { describe, expect, it, vi } from 'vitest';
import { ApiClient, Session } from './api';

const session: Session = { accessToken: 'old-access', refreshToken: 'old-refresh-token-123456', expiresIn: 900 };

describe('ApiClient', () => {
  it('сохраняет сессию после login', async () => {
    const saved = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }));
    const api = new ApiClient(null, saved, fetcher, 'http://api');
    await expect(api.login('user@example.com', 'password1')).resolves.toEqual(session);
    expect(saved).toHaveBeenCalledWith(session);
  });

  it('выполняет один refresh для параллельных 401 и повторяет запросы', async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh-token-123456', expiresIn: 900 }), { status: 200 });
      }
      protectedCalls += 1;
      return new Response('{}', { status: protectedCalls <= 2 ? 401 : 200 });
    }) as typeof fetch;
    const api = new ApiClient(session, vi.fn(), fetcher, 'http://api');
    const responses = await Promise.all([api.request('/api/tasks/1'), api.request('/api/tasks/2')]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it('передает company scope во все авторизованные запросы', async () => {
    const scoped = { ...session, user: { id: 'user-1', companyId: 'company-1', companyName: 'Stroy', email: 'user@example.com', fullName: 'User', locale: 'ru', roles: [] } };
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const api = new ApiClient(scoped, vi.fn(), fetcher as typeof fetch, 'http://api');
    await api.request('/api/objects/object-1/feed');
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('x-company-id')).toBe('company-1');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer old-access');
  });
});
