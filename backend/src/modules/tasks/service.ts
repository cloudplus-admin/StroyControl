import { prisma } from '../../db/prisma';
import { createHash } from 'crypto';
import { notifyObjectRoles, notifyUsers } from '../notifications/service';

function scopedTaskWhere(companyId: string, taskId: string) {
  return { id: taskId, workSection: { stage: { object: { companyId } } } };
}

export async function getTaskObjectId(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { workSection: { select: { stage: { select: { objectId: true } } } } },
  });
  return task?.workSection.stage.objectId ?? null;
}

export async function getTask(companyId: string, taskId: string) {
  return prisma.task.findFirst({
    where: scopedTaskWhere(companyId, taskId),
    include: { checklist: true },
  });
}

export async function updateTask(companyId: string, taskId: string, input: Record<string, unknown>) {
  const task = await prisma.task.findFirst({ where: scopedTaskWhere(companyId, taskId) });
  if (!task) return null;
  return prisma.task.update({ where: { id: taskId }, data: input });
}

export async function addChecklistItem(companyId: string, taskId: string, label: string) {
  const task = await prisma.task.findFirst({ where: scopedTaskWhere(companyId, taskId) });
  if (!task) return null;
  return prisma.taskChecklistItem.create({ data: { taskId, label } });
}

export async function toggleChecklistItem(
  companyId: string,
  taskId: string,
  itemId: string,
  isDone: boolean,
) {
  const item = await prisma.taskChecklistItem.findFirst({
    where: { id: itemId, taskId, task: scopedTaskWhere(companyId, taskId) },
  });
  if (!item) return null;
  return prisma.taskChecklistItem.update({ where: { id: itemId }, data: { isDone } });
}

export async function closeTask(
  companyId: string,
  taskId: string,
  input: { photoUrls: string[]; geoLat: number; geoLng: number },
  options: { idempotencyKey: string; actorId?: string; roles?: { code: string; objectId: string | null }[] },
) {
  const requestHash = createHash('sha256').update(JSON.stringify({ taskId, ...input })).digest('hex');
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { companyId_key: { companyId, key: options.idempotencyKey } },
  });
  if (existing) {
    if (existing.operation !== 'task.close' || existing.requestHash !== requestHash) {
      return { kind: 'conflict' as const };
    }
    return { kind: 'ok' as const, task: existing.responseBody, replayed: true };
  }

  const task = await prisma.task.findFirst({
    where: scopedTaskWhere(companyId, taskId),
    select: { id: true, title: true, reviewerId: true, workSection: { select: { stage: { select: { objectId: true } } } } },
  });
  if (!task) return null;
  if (options.actorId) {
    const uploadIds = input.photoUrls.map((photoUrl) => {
      try {
        const match = new URL(photoUrl).pathname.match(/^\/api\/uploads\/([0-9a-f-]+)$/i);
        return match?.[1] ?? null;
      } catch { return null; }
    });
    if (uploadIds.some((id) => !id)) return { kind: 'invalid_upload' as const };
    const uploads = await prisma.fileUpload.count({ where: { id: { in: uploadIds as string[] }, companyId, taskId } });
    if (uploads !== uploadIds.length) return { kind: 'invalid_upload' as const };
  }
  if (options.roles) {
    const objectId = task.workSection.stage.objectId;
    const allowed = options.roles.some((role) => ['foreman', 'subcontractor', 'pm', 'admin', 'owner'].includes(role.code) && (role.objectId === null || role.objectId === objectId));
    if (!allowed) return { kind: 'forbidden' as const };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({
        data: { companyId, key: options.idempotencyKey, operation: 'task.close', requestHash },
      });
      const closed = await tx.task.update({
        where: { id: taskId },
        data: {
          status: task.reviewerId ? 'review' : 'done',
          submittedAt: new Date(),
          ...(!task.reviewerId ? { actualEnd: new Date(), closedAt: new Date() } : {}),
          closurePhotoUrl: input.photoUrls[0],
          closurePhotos: input.photoUrls,
          closureGeoLat: input.geoLat,
          closureGeoLng: input.geoLng,
        },
      });
      await tx.feedEvent.create({
        data: {
          objectId: task.workSection.stage.objectId,
          kind: 'status_change',
          body: task.reviewerId
            ? `Задача «${task.title}» отправлена на проверку (фото + геометка)`
            : `Задача «${task.title}» завершена (фото + геометка)`,
        },
      });
      if (task.reviewerId) await notifyUsers(tx, { companyId, userIds: [task.reviewerId], objectId: task.workSection.stage.objectId, kind: 'task_review', title: 'Задача ожидает проверки', body: task.title, entityType: 'task', entityId: taskId });
      if (options.actorId) {
        await tx.auditLog.create({
          data: {
            companyId,
            actorId: options.actorId,
            action: 'task.close',
            entityType: 'task',
            entityId: taskId,
            payload: { photoUrls: input.photoUrls, geoLat: input.geoLat, geoLng: input.geoLng },
          },
        });
      }
      await tx.idempotencyRecord.update({
        where: { companyId_key: { companyId, key: options.idempotencyKey } },
        data: { responseBody: closed, statusCode: 200 },
      });
      return closed;
    });
    return { kind: 'ok' as const, task: updated, replayed: false };
  } catch (error) {
    const raced = await prisma.idempotencyRecord.findUnique({
      where: { companyId_key: { companyId, key: options.idempotencyKey } },
    });
    if (raced?.operation === 'task.close' && raced.requestHash === requestHash && raced.responseBody) {
      return { kind: 'ok' as const, task: raced.responseBody, replayed: true };
    }
    throw error;
  }
}

export async function reviewTask(
  companyId: string,
  taskId: string,
  input: { decision: 'accepted' | 'rejected'; note: string },
  options: { idempotencyKey: string; actorId: string; roles: { code: string; objectId: string | null }[] },
) {
  const requestHash = createHash('sha256').update(JSON.stringify({ taskId, ...input })).digest('hex');
  const existing = await prisma.idempotencyRecord.findUnique({ where: { companyId_key: { companyId, key: options.idempotencyKey } } });
  if (existing) {
    if (existing.operation !== 'task.review' || existing.requestHash !== requestHash) return { kind: 'conflict' as const };
    return { kind: 'ok' as const, task: existing.responseBody, replayed: true };
  }
  const task = await prisma.task.findFirst({ where: scopedTaskWhere(companyId, taskId), select: { id: true, title: true, status: true, reviewerId: true, assigneeId: true, workSection: { select: { stage: { select: { objectId: true } } } } } });
  if (!task) return null;
  const objectId = task.workSection.stage.objectId;
  const allowed = options.roles.some((role) => ['inspector', 'admin', 'owner', 'pm'].includes(role.code) && (role.objectId === null || role.objectId === objectId));
  if (!allowed) return { kind: 'forbidden' as const };
  const isInspectorOnly = options.roles.some((role) => role.code === 'inspector') && !options.roles.some((role) => ['admin', 'owner', 'pm'].includes(role.code));
  if (isInspectorOnly && task.reviewerId !== options.actorId) return { kind: 'forbidden' as const };
  if (task.status !== 'review') return { kind: 'invalid_state' as const };
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.idempotencyRecord.create({ data: { companyId, key: options.idempotencyKey, operation: 'task.review', requestHash } });
    const reviewed = await tx.task.update({ where: { id: taskId }, data: {
      status: input.decision === 'accepted' ? 'done' : 'in_progress', reviewedAt: now, reviewedById: options.actorId,
      reviewNote: input.note || (input.decision === 'accepted' ? 'Принято технадзором' : null),
      ...(input.decision === 'accepted' ? { actualEnd: now, closedAt: now } : { actualEnd: null, closedAt: null }),
    } });
    await tx.feedEvent.create({ data: { objectId, authorId: options.actorId, kind: 'acceptance', body: input.decision === 'accepted' ? `Задача «${task.title}» принята технадзором` : `Задача «${task.title}» отклонена: ${input.note}` } });
    if (task.assigneeId) await notifyUsers(tx, { companyId, userIds: [task.assigneeId], objectId, kind: 'task_decision', title: input.decision === 'accepted' ? 'Работа принята' : 'Работа отклонена', body: input.decision === 'accepted' ? task.title : `${task.title}: ${input.note}`, entityType: 'task', entityId: taskId });
    await tx.auditLog.create({ data: { companyId, actorId: options.actorId, action: input.decision === 'accepted' ? 'task.accept' : 'task.reject', entityType: 'task', entityId: taskId, payload: input } });
    await tx.idempotencyRecord.update({ where: { companyId_key: { companyId, key: options.idempotencyKey } }, data: { responseBody: reviewed, statusCode: 200 } });
    return reviewed;
  });
  return { kind: 'ok' as const, task: updated, replayed: false };
}

export async function assignTaskReviewer(
  companyId: string,
  taskId: string,
  reviewerId: string,
  options: { userId: string; roles: { code: string; objectId: string | null }[] },
) {
  const task = await prisma.task.findFirst({ where: scopedTaskWhere(companyId, taskId), select: { id: true, title: true, assigneeId: true, workSection: { select: { stage: { select: { objectId: true } } } } } });
  if (!task) return null;
  const objectId = task.workSection.stage.objectId;
  const allowed = options.roles.some((role) => ['admin', 'owner', 'pm'].includes(role.code) && (role.objectId === null || role.objectId === objectId));
  if (!allowed) return { kind: 'forbidden' as const };
  if (task.assigneeId === reviewerId) return { kind: 'same_user' as const };
  const reviewer = await prisma.user.findFirst({ where: { id: reviewerId, companyId, roles: { some: { role: { code: 'inspector' }, OR: [{ objectId: null }, { objectId }] } } }, select: { id: true, fullName: true } });
  if (!reviewer) return { kind: 'invalid_reviewer' as const };
  const updated = await prisma.$transaction(async (tx) => {
    const assigned = await tx.task.update({ where: { id: taskId }, data: { reviewerId }, include: { reviewer: { select: { id: true, fullName: true } } } });
    await tx.auditLog.create({ data: { companyId, actorId: options.userId, action: 'task.reviewer.assign', entityType: 'task', entityId: taskId, payload: { reviewerId, reviewerName: reviewer.fullName } } });
    await tx.feedEvent.create({ data: { objectId, authorId: options.userId, kind: 'assignment', body: `Задача «${task.title}» назначена технадзору ${reviewer.fullName}` } });
    return assigned;
  });
  return { kind: 'ok' as const, task: updated };
}

/**
 * Помечает задачи компании просроченными, если plannedEnd (+ slaHours, если задан)
 * уже прошёл, а статус ещё не done/overdue. Реальная нотификация прорабу/ПМ
 * (Telegram/push) не реализована — модуль «Лента и коммуникации» ещё не построен;
 * это точка интеграции на будущее.
 */
export async function runSlaSweep(companyId: string) {
  const now = new Date();
  const candidates = await prisma.task.findMany({
    where: {
      workSection: { stage: { object: { companyId } } },
      status: { in: ['open', 'in_progress'] },
      plannedEnd: { not: null },
    },
  });

  const toEscalate = candidates.filter((task) => {
    if (!task.plannedEnd) return false;
    const deadline = task.slaHours
      ? new Date(task.plannedEnd.getTime() + task.slaHours * 60 * 60 * 1000)
      : task.plannedEnd;
    return deadline.getTime() < now.getTime();
  });

  if (toEscalate.length === 0) return [];

  await prisma.task.updateMany({
    where: { id: { in: toEscalate.map((t) => t.id) } },
    data: { status: 'overdue', escalatedAt: now },
  });

  return toEscalate.map((t) => ({ id: t.id, title: t.title, assigneeId: t.assigneeId }));
}

/**
 * Создаёт новый экземпляр повторяющейся задачи (только rule='daily'), если для
 * сегодняшнего дня экземпляр ещё не создавался. Упрощённая реализация —
 * покрывает пример из ТЗ («ежедневный обход, контроль ТБ»).
 */
export async function runRecurringSweep(companyId: string) {
  const templates = await prisma.task.findMany({
    where: {
      workSection: { stage: { object: { companyId } } },
      isRecurring: true,
      recurrenceRule: 'daily',
      parentTaskId: null,
    },
  });

  const created = [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (const template of templates) {
    const existingToday = await prisma.task.findFirst({
      where: { parentTaskId: template.id, createdAt: { gte: startOfToday } },
    });
    if (existingToday) continue;

    const instance = await prisma.task.create({
      data: {
        workSectionId: template.workSectionId,
        parentTaskId: template.id,
        assigneeId: template.assigneeId,
        title: template.title,
        description: template.description,
        priority: template.priority,
        tags: template.tags,
        plannedStart: startOfToday,
        plannedEnd: template.slaHours
          ? new Date(startOfToday.getTime() + template.slaHours * 60 * 60 * 1000)
          : undefined,
        slaHours: template.slaHours,
      },
    });
    created.push(instance);
  }

  return created;
}
