import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../../auth/crypto';
import { requireAnyRole } from '../../auth/authorization';
import { prisma } from '../../db/prisma';
import { asyncRoute } from '../../http/async-route';

export const adminRouter = Router();
adminRouter.use(requireAnyRole('admin'));

adminRouter.get('/roles', asyncRoute(async (_req, res) => {
  return res.json(await prisma.role.findMany({ orderBy: { id: 'asc' } }));
}));

adminRouter.get('/users', asyncRoute(async (_req, res) => {
  const companyId = res.locals.auth.companyId as string;
  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      locale: true,
      createdAt: true,
      roles: { select: { objectId: true, role: { select: { code: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(users);
}));

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(5).max(30).optional(),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(200),
  locale: z.enum(['ru', 'uz']).default('ru'),
  roleCode: z.string().min(2).max(40),
  objectId: z.string().uuid().nullable().optional(),
});

adminRouter.post('/users', asyncRoute(async (req, res) => {
  const companyId = res.locals.auth.companyId as string;
  const input = createUserSchema.parse(req.body);
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) return res.status(400).json({ error: 'Unknown role' });
  if (input.objectId) {
    const object = await prisma.object.findFirst({ where: { id: input.objectId, companyId } });
    if (!object) return res.status(400).json({ error: 'Object does not belong to the authenticated company' });
  }
  const user = await prisma.user.create({
    data: {
      companyId,
      email: input.email.trim().toLowerCase(),
      phone: input.phone,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      locale: input.locale,
      roles: { create: { roleId: role.id, objectId: input.objectId ?? null } },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      locale: true,
      roles: { select: { objectId: true, role: { select: { code: true, name: true } } } },
    },
  });
  return res.status(201).json(user);
}));
