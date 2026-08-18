import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';

export const notificationsRouter = Router();

notificationsRouter.put('/channels', async (req, res) => {
  const auth = res.locals.auth as { userId: string; companyId: string } | undefined;
  if (!auth) return res.status(401).json({ error: 'Bearer access token is required' });
  const input = z.object({ telegramChatId: z.string().trim().max(100).nullable().optional(), pushToken: z.string().trim().max(500).nullable().optional() }).parse(req.body);
  const user = await prisma.user.update({ where: { id: auth.userId }, data: input, select: { telegramChatId: true, pushToken: true } });
  return res.json(user);
});

notificationsRouter.get('/', async (req, res) => {
  const auth = res.locals.auth as { companyId: string; userId: string };
  const unreadOnly = req.query.unread === 'true';
  const items = await prisma.notification.findMany({ where: { companyId: auth.companyId, userId: auth.userId, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  const unread = await prisma.notification.count({ where: { companyId: auth.companyId, userId: auth.userId, readAt: null } });
  return res.json({ unread, items });
});

notificationsRouter.post('/read-all', async (_req, res) => {
  const auth = res.locals.auth as { companyId: string; userId: string };
  const result = await prisma.notification.updateMany({ where: { companyId: auth.companyId, userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
  return res.json({ updated: result.count });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const auth = res.locals.auth as { companyId: string; userId: string };
  const item = await prisma.notification.findFirst({ where: { id: req.params.id, companyId: auth.companyId, userId: auth.userId } });
  if (!item) return res.status(404).json({ error: 'not_found' });
  return res.json(await prisma.notification.update({ where: { id: item.id }, data: { readAt: item.readAt ?? new Date() } }));
});
