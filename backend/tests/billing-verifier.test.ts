import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyApple, verifyGoogle } from '../src/modules/billing/verifier';

const productId = 'uz.cloudplus.stroycontrol.houses_monthly' as const;
const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.x`;

afterEach(() => vi.unstubAllEnvs());

describe('store purchase verification', () => {
  it('accepts a matching active App Store transaction returned by Apple', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    vi.stubEnv('APPLE_ISSUER_ID', 'issuer'); vi.stubEnv('APPLE_KEY_ID', 'key');
    vi.stubEnv('APPLE_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ signedTransactionInfo: jwt({ bundleId: 'uz.cloudplus.stroycontrol', productId, transactionId: 'apple-1', expiresDate: Date.now() + 60_000 }) }), { status: 200 }));
    await expect(verifyApple(productId, 'apple-1', fetcher)).resolves.toMatchObject({ transactionId: 'apple-1', status: 'active' });
  });

  it('rejects a transaction for another App Store product', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    vi.stubEnv('APPLE_ISSUER_ID', 'issuer'); vi.stubEnv('APPLE_KEY_ID', 'key');
    vi.stubEnv('APPLE_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ signedTransactionInfo: jwt({ bundleId: 'uz.cloudplus.stroycontrol', productId: 'wrong', transactionId: 'apple-1' }) }), { status: 200 }));
    await expect(verifyApple(productId, 'apple-1', fetcher)).rejects.toThrow('apple_purchase_mismatch');
  });

  it('marks an expired Google Play subscription as expired', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', 'billing@example.test');
    vi.stubEnv('GOOGLE_PLAY_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ expiryTimeMillis: String(Date.now() - 1000) }), { status: 200 }));
    await expect(verifyGoogle(productId, 'purchase-token', fetcher)).resolves.toMatchObject({ status: 'expired' });
  });
});
