import { Router } from 'express';
import { requireAnyRole } from '../../auth/authorization';
import { prisma } from '../../db/prisma';

export const planningRouter = Router();
planningRouter.use(requireAnyRole('admin', 'owner', 'pm'));
planningRouter.get('/users', async (_req, res) => {
  const companyId = res.locals.auth.companyId as string;
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true, fullName: true, email: true, roles: { select: { objectId: true, role: { select: { code: true, name: true } } } } }, orderBy: { fullName: 'asc' } });
  return res.json(users);
});
