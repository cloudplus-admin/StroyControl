import { Router } from 'express';
import { z } from 'zod';
import { requireAnyRole } from '../../auth/authorization';
import { prisma } from '../../db/prisma';

export const auditRouter = Router();
auditRouter.use(requireAnyRole('admin', 'owner', 'pm'));

const querySchema = z.object({
  entityType: z.string().min(1).max(60).optional(),
  entityId: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

auditRouter.get('/', async (req, res) => {
  const companyId = res.locals.auth.companyId as string;
  const query = querySchema.parse(req.query);
  const entries = await prisma.auditLog.findMany({
    where: { companyId, entityType: query.entityType, entityId: query.entityId },
    include: { actor: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  });
  return res.json(entries);
});
