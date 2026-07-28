import { prisma } from '../../db/prisma';

function scopedTaskWhere(companyId: string, taskId: string) {
  return { id: taskId, workSection: { stage: { object: { companyId } } } };
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
  input: { photoUrl: string; geoLat: number; geoLng: number },
) {
  const task = await prisma.task.findFirst({ where: scopedTaskWhere(companyId, taskId) });
  if (!task) return null;
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'done',
      actualEnd: new Date(),
      closedAt: new Date(),
      closurePhotoUrl: input.photoUrl,
      closureGeoLat: input.geoLat,
      closureGeoLng: input.geoLng,
    },
  });
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
