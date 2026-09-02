import { Router } from 'express';
import { z } from 'zod';
import { getAuth } from '../../auth/context';
import { prisma } from '../../db/prisma';
import { asyncRoute } from '../../http/async-route';
import { isProductId } from './products';
import { verifyApple, verifyGoogle } from './verifier';

export const billingRouter = Router();
const bodySchema = z.object({ platform: z.enum(['ios', 'android']), productId: z.string(), transactionId: z.string().min(1), purchaseToken: z.string().min(1).optional() });

billingRouter.get('/status', asyncRoute(async (_req, res) => {
  const auth = getAuth(res)!;
  const rows = await prisma.companySubscription.findMany({ where: { companyId: auth.companyId }, orderBy: { verifiedAt: 'desc' } });
  const active = rows.find((row) => row.status === 'active' && (!row.expiresAt || row.expiresAt > new Date()));
  res.json({ active: Boolean(active), subscription: active ?? null });
}));

billingRouter.post('/verify', asyncRoute(async (req, res) => {
  const auth = getAuth(res)!;
  const body = bodySchema.parse(req.body);
  if (!isProductId(body.productId)) return res.status(400).json({ error: 'unknown_product' });
  const verified = body.platform === 'ios'
    ? await verifyApple(body.productId, body.transactionId)
    : await verifyGoogle(body.productId, body.purchaseToken ?? body.transactionId);
  const existing = await prisma.companySubscription.findUnique({
    where: { platform_transactionId: { platform: body.platform, transactionId: verified.transactionId } },
  });
  if (existing && existing.companyId !== auth.companyId) return res.status(409).json({ error: 'purchase_already_claimed' });
  const record = await prisma.companySubscription.upsert({
    where: { platform_transactionId: { platform: body.platform, transactionId: verified.transactionId } },
    create: { companyId: auth.companyId, userId: auth.userId, platform: body.platform, productId: verified.productId, transactionId: verified.transactionId, originalTransactionId: verified.originalTransactionId, status: verified.status, purchasedAt: verified.purchasedAt, expiresAt: verified.expiresAt, rawResponse: verified.raw as object },
    update: { status: verified.status, expiresAt: verified.expiresAt, verifiedAt: new Date(), rawResponse: verified.raw as object },
  });
  res.json({ active: record.status === 'active' && (!record.expiresAt || record.expiresAt > new Date()), subscription: record });
}));
