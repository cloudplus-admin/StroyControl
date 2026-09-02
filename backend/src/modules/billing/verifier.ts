import { createSign } from 'node:crypto';
import { products, type ProductId } from './products';

export type VerifiedPurchase = { productId: ProductId; transactionId: string; originalTransactionId?: string; status: 'active' | 'expired' | 'revoked'; purchasedAt?: Date; expiresAt?: Date; raw: unknown };
const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const decodeJwt = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;

async function serviceAccountToken(fetcher: typeof fetch) {
  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('google_play_not_configured');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key);
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64(signature)}` }) });
  if (!response.ok) throw new Error('google_auth_failed');
  return String((await response.json() as { access_token: string }).access_token);
}

export async function verifyGoogle(productId: ProductId, purchaseToken: string, fetcher = fetch): Promise<VerifiedPurchase> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'uz.cloudplus.stroycontrol';
  const accessToken = await serviceAccountToken(fetcher);
  const kind = products[productId] === 'subscription' ? `subscriptions/${encodeURIComponent(productId)}/tokens` : `products/${encodeURIComponent(productId)}/tokens`;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/${kind}/${encodeURIComponent(purchaseToken)}`;
  const response = await fetcher(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error('google_purchase_invalid');
  const raw = await response.json() as Record<string, unknown>;
  const expiresAt = raw.expiryTimeMillis ? new Date(Number(raw.expiryTimeMillis)) : undefined;
  const cancelled = Number(raw.cancelReason ?? -1) >= 0 || Number(raw.purchaseState ?? 0) !== 0;
  return { productId, transactionId: purchaseToken, status: cancelled ? 'revoked' : expiresAt && expiresAt <= new Date() ? 'expired' : 'active', purchasedAt: raw.startTimeMillis ? new Date(Number(raw.startTimeMillis)) : undefined, expiresAt, raw };
}

function appleToken() {
  const issuer = process.env.APPLE_ISSUER_ID, keyId = process.env.APPLE_KEY_ID;
  const key = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const bundleId = process.env.APPLE_BUNDLE_ID ?? 'uz.cloudplus.stroycontrol';
  if (!issuer || !keyId || !key) throw new Error('apple_store_not_configured');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))}.${b64(JSON.stringify({ iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: bundleId }))}`;
  return `${unsigned}.${b64(createSign('SHA256').update(unsigned).sign({ key, dsaEncoding: 'ieee-p1363' }))}`;
}

export async function verifyApple(productId: ProductId, transactionId: string, fetcher = fetch): Promise<VerifiedPurchase> {
  const base = process.env.APPLE_STORE_ENV === 'production' ? 'https://api.storekit.itunes.apple.com' : 'https://api.storekit-sandbox.itunes.apple.com';
  const response = await fetcher(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, { headers: { authorization: `Bearer ${appleToken()}` } });
  if (!response.ok) throw new Error('apple_purchase_invalid');
  const envelope = await response.json() as { signedTransactionInfo: string };
  const raw = decodeJwt(envelope.signedTransactionInfo);
  if (raw.productId !== productId || raw.bundleId !== (process.env.APPLE_BUNDLE_ID ?? 'uz.cloudplus.stroycontrol')) throw new Error('apple_purchase_mismatch');
  const expiresAt = raw.expiresDate ? new Date(Number(raw.expiresDate)) : undefined;
  return { productId, transactionId: String(raw.transactionId), originalTransactionId: raw.originalTransactionId ? String(raw.originalTransactionId) : undefined, status: raw.revocationDate ? 'revoked' : expiresAt && expiresAt <= new Date() ? 'expired' : 'active', purchasedAt: raw.purchaseDate ? new Date(Number(raw.purchaseDate)) : undefined, expiresAt, raw };
}
