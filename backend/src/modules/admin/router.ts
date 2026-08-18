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
      isActive: true,
      createdAt: true,
      roles: { select: { objectId: true, role: { select: { code: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(users);
}));

const roleAssignmentSchema = z.object({
  roleCode: z.string().min(2).max(40),
  objectId: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().min(5).max(30).nullable().optional(),
  locale: z.enum(['ru', 'uz']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
  roles: z.array(roleAssignmentSchema).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

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
      isActive: true,
      roles: { select: { objectId: true, role: { select: { code: true, name: true } } } },
    },
  });
  return res.status(201).json(user);
}));

adminRouter.patch('/users/:id', asyncRoute(async (req, res) => {
  const companyId = res.locals.auth.companyId as string;
  const actorId = res.locals.auth.userId as string;
  const input = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, companyId }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (input.isActive === false && existing.id === actorId) return res.status(400).json({ error: 'Cannot disable your own account' });

  const assignments = input.roles ? await Promise.all(input.roles.map(async (assignment) => {
    const role = await prisma.role.findUnique({ where: { code: assignment.roleCode } });
    if (!role) throw new z.ZodError([{ code: 'custom', path: ['roles'], message: `Unknown role: ${assignment.roleCode}` }]);
    if (assignment.objectId) {
      const object = await prisma.object.findFirst({ where: { id: assignment.objectId, companyId }, select: { id: true } });
      if (!object) throw new z.ZodError([{ code: 'custom', path: ['roles'], message: 'Object does not belong to the authenticated company' }]);
    }
    return { roleId: role.id, objectId: assignment.objectId ?? null };
  })) : undefined;

  const user = await prisma.$transaction(async (tx) => {
    if (assignments) {
      await tx.userRole.deleteMany({ where: { userId: existing.id } });
      await tx.userRole.createMany({ data: assignments.map((assignment) => ({ userId: existing.id, ...assignment })) });
    }
    const updated = await tx.user.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        locale: input.locale,
        isActive: input.isActive,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      },
      select: { id: true, email: true, phone: true, fullName: true, locale: true, isActive: true, roles: { select: { objectId: true, role: { select: { code: true, name: true } } } } },
    });
    if (input.isActive === false || input.password) await tx.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return updated;
  });
  return res.json(user);
}));
