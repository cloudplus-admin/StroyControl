const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

export type UserSession = { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; fullName: string; email: string; companyName: string; roles: { code: string; objectId: string | null }[] } };
const KEY = 'stroycontrol:web:session:v1';

export class Api {
  private session: UserSession | null = JSON.parse(localStorage.getItem(KEY) ?? 'null') as UserSession | null;
  private refreshPromise: Promise<boolean> | null = null;
  getSession() { return this.session; }
  private save(value: UserSession | null) { this.session = value; value ? localStorage.setItem(KEY, JSON.stringify(value)) : localStorage.removeItem(KEY); }
  async login(email: string, password: string) {
    const response = await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error('Неверный email или пароль');
    const value = await response.json() as UserSession; this.save(value); return value;
  }
  async logout() { try { await this.request('/api/auth/logout', { method: 'POST' }); } finally { this.save(null); } }
  async request(path: string, init: RequestInit = {}) {
    let response = await this.authorized(path, init);
    if (response.status === 401 && this.session?.refreshToken && await this.refresh()) response = await this.authorized(path, init);
    return response;
  }
  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? `HTTP ${response.status}`); }
    return response.json() as Promise<T>;
  }
  private authorized(path: string, init: RequestInit) { const headers = new Headers(init.headers); if (this.session) headers.set('authorization', `Bearer ${this.session.accessToken}`); return fetch(`${BASE_URL}${path}`, { ...init, headers }); }
  private refresh() { if (!this.refreshPromise) this.refreshPromise = this.doRefresh().finally(() => { this.refreshPromise = null; }); return this.refreshPromise; }
  private async doRefresh() {
    const current = this.session; if (!current) return false;
    const response = await fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) });
    if (!response.ok) { this.save(null); return false; }
    const tokens = await response.json() as Pick<UserSession, 'accessToken' | 'refreshToken' | 'expiresIn'>; this.save({ ...current, ...tokens }); return true;
  }
}

export const api = new Api();
