import { prisma } from '../../db/prisma';

const eventInclude = {
  reactions: true,
  replies: { orderBy: { createdAt: 'asc' as const } },
};

export async function listFeed(companyId: string, objectId: string, limit = 50) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.feedEvent.findMany({
    where: { objectId, parentEventId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: eventInclude,
  });
}

export async function createFeedEvent(
  companyId: string,
  objectId: string,
  input: { authorId: string; body: string; mentionedUserIds: string[]; parentEventId?: string },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.feedEvent.create({
    data: { objectId, kind: 'message', ...input },
    include: eventInclude,
  });
}

/**
 * Системное событие ленты (смена статуса, приёмка и т.п.), вызывается из
 * других модулей (задачи, фотоконтроль) — не проходит через HTTP-роут.
 */
export async function createSystemEvent(objectId: string, kind: string, body: string) {
  return prisma.feedEvent.create({ data: { objectId, kind, body, authorId: null } });
}

export async function addReaction(companyId: string, eventId: string, userId: string, emoji: string) {
  const event = await prisma.feedEvent.findFirst({ where: { id: eventId, object: { companyId } } });
  if (!event) return null;
  return prisma.feedReaction.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: { emoji },
    create: { eventId, userId, emoji },
  });
}

export async function removeReaction(companyId: string, eventId: string, userId: string) {
  const event = await prisma.feedEvent.findFirst({ where: { id: eventId, object: { companyId } } });
  if (!event) return null;
  await prisma.feedReaction.deleteMany({ where: { eventId, userId } });
  return { ok: true };
}

/**
 * Полнотекстовый поиск: сейчас — простой ILIKE по телу сообщения. Реальный
 * полнотекстовый поиск (tsvector + GIN-индекс) — задел на будущее, когда
 * объём переписки потребует более быстрого поиска.
 */
export async function searchFeed(companyId: string, objectId: string, query: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.feedEvent.findMany({
    where: { objectId, body: { contains: query, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    include: eventInclude,
  });
}
