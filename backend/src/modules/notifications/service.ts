import type { Prisma } from '@prisma/client';

export async function notifyObjectRoles(
  tx: Prisma.TransactionClient,
  input: { companyId: string; objectId: string; roleCodes: string[]; kind: string; title: string; body: string; entityType?: string; entityId?: string; excludeUserId?: string },
) {
  const users = await tx.user.findMany({
    where: { companyId: input.companyId, ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}), roles: { some: { role: { code: { in: input.roleCodes } }, OR: [{ objectId: null }, { objectId: input.objectId }] } } },
    select: { id: true },
  });
  if (users.length) await tx.notification.createMany({ data: users.map(({ id }) => ({ companyId: input.companyId, userId: id, objectId: input.objectId, kind: input.kind, title: input.title, body: input.body, entityType: input.entityType, entityId: input.entityId })) });
}

export async function notifyUsers(tx: Prisma.TransactionClient, input: { companyId: string; userIds: string[]; objectId?: string; kind: string; title: string; body: string; entityType?: string; entityId?: string }) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length) await tx.notification.createMany({ data: userIds.map((userId) => ({ companyId: input.companyId, userId, objectId: input.objectId, kind: input.kind, title: input.title, body: input.body, entityType: input.entityType, entityId: input.entityId })) });
}
