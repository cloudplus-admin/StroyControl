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

const imageDownloadPromises = new Map<string, Promise<string>>();

function stableUrlHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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

  async uploadFile(path: string, fileUri: string, headers: Record<string, string>): Promise<Response> {
    let response = await this.authorizedFileUpload(path, fileUri, headers);
    if (response.status !== 401 || !this.session?.refreshToken) return response;
    if (await this.refresh()) response = await this.authorizedFileUpload(path, fileUri, headers);
    return response;
  }

  async downloadFile(url: string, targetUri: string): Promise<string> {
    let result = await this.authorizedFileDownload(url, targetUri);
    if (result.status === 401 && this.session?.refreshToken && await this.refresh()) result = await this.authorizedFileDownload(url, targetUri);
    if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}`);
    return result.uri;
  }

  async cachedImage(url: string): Promise<string> {
    const existing = imageDownloadPromises.get(url);
    if (existing) return existing;

    const promise = this.downloadAndCacheImage(url).finally(() => imageDownloadPromises.delete(url));
    imageDownloadPromises.set(url, promise);
    return promise;
  }

  private async downloadAndCacheImage(url: string): Promise<string> {
    const FileSystem = await import('expo-file-system/legacy');
    const extension = new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0]?.toLowerCase() ?? '.img';
    const targetUri = `${FileSystem.cacheDirectory}stroycontrol-photo-${stableUrlHash(url)}${extension}`;
    const cached = await FileSystem.getInfoAsync(targetUri);
    if (cached.exists && (cached.size ?? 0) > 0) return targetUri;

    const temporaryUri = `${targetUri}.part`;
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
    try {
      const downloadedUri = await this.downloadFile(url, temporaryUri);
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
      await FileSystem.moveAsync({ from: downloadedUri, to: targetUri });
      return targetUri;
    } catch (error) {
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
      throw error;
    }
  }

  private async authorizedFileDownload(url: string, targetUri: string): Promise<{ uri: string; status: number }> {
    const FileSystem = await import('expo-file-system/legacy');
    const headers: Record<string, string> = {};
    if (this.session?.accessToken) headers.authorization = `Bearer ${this.session.accessToken}`;
    if (this.session?.user?.companyId) headers['x-company-id'] = this.session.user.companyId;
    return FileSystem.downloadAsync(url, targetUri, { headers });
  }

  private async authorizedFileUpload(path: string, fileUri: string, requestHeaders: Record<string, string>): Promise<Response> {
    const FileSystem = await import('expo-file-system/legacy');
    const headers = { ...requestHeaders };
    if (this.session?.accessToken) headers.authorization = `Bearer ${this.session.accessToken}`;
    if (this.session?.user?.companyId) headers['x-company-id'] = this.session.user.companyId;
    const result = await FileSystem.uploadAsync(`${this.baseUrl}${path}`, fileUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers,
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
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
