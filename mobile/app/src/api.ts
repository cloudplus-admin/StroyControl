export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://stroycontrol-api.cloudplus.uz'
).replace(/\/$/, '');

export type AuthUser = {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  fullName: string;
  locale: string;
  roles: { code: string; objectId: string | null }[];
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: AuthUser;
};

type FetchLike = typeof fetch;
type SessionUpdater = (session: Session | null) => Promise<void>;

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private session: Session | null,
    private readonly updateSession: SessionUpdater,
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = API_BASE_URL,
  ) {}

  getSession(): Session | null { return this.session; }

  async login(email: string, password: string): Promise<Session> {
    const response = await this.fetcher(`${this.baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'auth_invalid_credentials' : 'auth_server_unavailable');
    const session = await response.json() as Session;
    await this.setSession(session);
    return session;
  }

  async logout(): Promise<void> {
    const accessToken = this.session?.accessToken;
    if (accessToken) {
      try { await this.fetcher(`${this.baseUrl}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` } }); } catch { /* local logout must still work */ }
    }
    await this.setSession(null);
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    let response = await this.authorizedFetch(path, init);
    if (response.status !== 401 || !this.session?.refreshToken) return response;
    if (await this.refresh()) response = await this.authorizedFetch(path, init);
    return response;
  }

  private async authorizedFetch(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.session?.accessToken) headers.set('authorization', `Bearer ${this.session.accessToken}`);
    if (this.session?.user?.companyId) headers.set('x-company-id', this.session.user.companyId);
    return this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
  }

  private async refresh(): Promise<boolean> {
    if (!this.refreshPromise) this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<boolean> {
    const current = this.session;
    if (!current?.refreshToken) return false;
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) { await this.setSession(null); return false; }
      const tokens = await response.json() as Omit<Session, 'user'>;
      await this.setSession({ ...tokens, user: current.user });
      return true;
    } catch { return false; }
  }

  private async setSession(session: Session | null): Promise<void> {
    this.session = session;
    await this.updateSession(session);
  }
}
