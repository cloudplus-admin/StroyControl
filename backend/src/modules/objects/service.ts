import { prisma } from '../../db/prisma';
import { OBJECT_TEMPLATES, ObjectTemplateCode } from './templates';

type TaskLike = { status: string; plannedEnd: Date | null };

type ScheduleTask = {
  id: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  dependsOn: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateCriticalPath(tasks: ScheduleTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (taskId: string) => {
    if (visiting.has(taskId)) throw new Error('dependency_cycle');
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    const task = byId.get(taskId);
    for (const dependencyId of task?.dependsOn ?? []) {
      if (!byId.has(dependencyId)) throw new Error('dependency_not_found');
      visit(dependencyId);
    }
    visiting.delete(taskId);
    visited.add(taskId);
    order.push(taskId);
  };

  for (const task of tasks) visit(task.id);

  const earliestFinish = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  for (const taskId of order) {
    const task = byId.get(taskId)!;
    const durationDays = task.plannedStart && task.plannedEnd
      ? Math.max(1, Math.ceil((task.plannedEnd.getTime() - task.plannedStart.getTime()) / DAY_MS))
      : 1;
    let bestDependency: string | null = null;
    let bestFinish = 0;
    for (const dependencyId of task.dependsOn) {
      const finish = earliestFinish.get(dependencyId) ?? 0;
      if (finish > bestFinish) {
        bestFinish = finish;
        bestDependency = dependencyId;
      }
    }
    earliestFinish.set(taskId, bestFinish + durationDays);
    predecessor.set(taskId, bestDependency);
  }

  let lastTaskId: string | null = null;
  let durationDays = 0;
  for (const [taskId, finish] of earliestFinish) {
    if (finish > durationDays) {
      durationDays = finish;
      lastTaskId = taskId;
    }
  }
  const taskIds: string[] = [];
  while (lastTaskId) {
    taskIds.unshift(lastTaskId);
    lastTaskId = predecessor.get(lastTaskId) ?? null;
  }
  return { taskIds, durationDays };
}

const RISK_WINDOW_DAYS = 5;

export function computeTaskRisk(task: TaskLike, now = new Date()): 'overdue' | 'risk' | 'on_track' {
  if (task.status === 'done') return 'on_track';
  if (!task.plannedEnd) return 'on_track';
  if (task.plannedEnd.getTime() < now.getTime()) return 'overdue';
  const riskThreshold = now.getTime() + RISK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (task.plannedEnd.getTime() < riskThreshold) return 'risk';
  return 'on_track';
}

function aggregateObjectRisk(tasks: TaskLike[], now = new Date()): 'overdue' | 'risk' | 'on_track' {
  let hasRisk = false;
  for (const task of tasks) {
    const level = computeTaskRisk(task, now);
    if (level === 'overdue') return 'overdue';
    if (level === 'risk') hasRisk = true;
  }
  return hasRisk ? 'risk' : 'on_track';
}

export async function listObjects(companyId: string) {
  const objects = await prisma.object.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      stages: {
        include: { sections: { include: { tasks: true } } },
      },
    },
  });

  return objects.map((object) => {
    const tasks = object.stages.flatMap((s) => s.sections.flatMap((sec) => sec.tasks));
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      id: object.id,
      name: object.name,
      address: object.address,
      status: object.status,
      templateCode: object.templateCode,
      createdAt: object.createdAt,
      progress,
      riskLevel: aggregateObjectRisk(tasks),
      taskCount: total,
    };
  });
}

export async function createObject(
  companyId: string,
  input: { name: string; nameUz?: string; address?: string; addressUz?: string; latitude?: number; longitude?: number; templateCode?: ObjectTemplateCode },
) {
  return prisma.object.create({
    data: {
      companyId,
      name: input.name,
      nameUz: input.nameUz,
      address: input.address,
      addressUz: input.addressUz,
      latitude: input.latitude,
      longitude: input.longitude,
      templateCode: input.templateCode,
      stages: input.templateCode
        ? {
            create: OBJECT_TEMPLATES[input.templateCode].map((stage, stageIndex) => ({
              name: stage.name,
              sortOrder: stageIndex,
              sections: {
                create: stage.sections.map((section, sectionIndex) => ({
                  name: section.name,
                  sortOrder: sectionIndex,
                })),
              },
            })),
          }
        : undefined,
    },
    include: { stages: { include: { sections: true } } },
  });
}

export async function getObject(companyId: string, objectId: string) {
  return prisma.object.findFirst({
    where: { id: objectId, companyId },
    include: {
      stages: {
        orderBy: { sortOrder: 'asc' },
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' },
            include: { tasks: { orderBy: { createdAt: 'asc' } } },
          },
        },
      },
    },
  });
}

export async function updateObject(
  companyId: string,
  objectId: string,
  input: { name?: string; nameUz?: string; address?: string; addressUz?: string; latitude?: number | null; longitude?: number | null; status?: string },
) {
  const existing = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!existing) return null;
  return prisma.object.update({ where: { id: objectId }, data: input });
}

export async function addStage(companyId: string, objectId: string, input: { name: string; nameUz?: string; sortOrder: number }) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.stage.create({ data: { objectId, name: input.name, nameUz: input.nameUz, sortOrder: input.sortOrder } });
}

export async function addSection(
  companyId: string,
  stageId: string,
  input: { name: string; nameUz?: string; sortOrder: number },
) {
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, object: { companyId } },
  });
  if (!stage) return null;
  return prisma.workSection.create({ data: { stageId, name: input.name, nameUz: input.nameUz, sortOrder: input.sortOrder } });
}

export async function addTask(
  companyId: string,
  workSectionId: string,
  input: {
    title: string;
    titleUz?: string;
    description?: string;
    descriptionUz?: string;
    assigneeId?: string | null;
    parentTaskId?: string;
    priority: string;
    plannedStart?: Date;
    plannedEnd?: Date;
    baselineStart?: Date;
    baselineEnd?: Date;
    dependsOn: string[];
    slaHours?: number;
  },
) {
  const section = await prisma.workSection.findFirst({
    where: { id: workSectionId, stage: { object: { companyId } } },
  });
  if (!section) return null;
  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({ where: { id: input.assigneeId, companyId } });
    if (!assignee) return null;
  }
  const relatedIds = [...input.dependsOn, ...(input.parentTaskId ? [input.parentTaskId] : [])];
  if (new Set(relatedIds).size !== relatedIds.length) return { kind: 'invalid_dependencies' as const };
  if (relatedIds.length) {
    const objectId = await prisma.stage.findUnique({ where: { id: section.stageId }, select: { objectId: true } });
    const objectRelatedCount = objectId ? await prisma.task.count({
      where: { id: { in: relatedIds }, workSection: { stage: { objectId: objectId.objectId, object: { companyId } } } },
    }) : 0;
    if (objectRelatedCount !== relatedIds.length) return { kind: 'invalid_dependencies' as const };
  }
  const task = await prisma.task.create({ data: { workSectionId, ...input } });
  return { kind: 'ok' as const, task };
}

export async function captureBaseline(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId }, select: { id: true } });
  if (!object) return null;
  const tasks = await prisma.task.findMany({
    where: { workSection: { stage: { objectId, object: { companyId } } } },
    select: { id: true, plannedStart: true, plannedEnd: true },
  });
  await prisma.$transaction(tasks.map((task) => prisma.task.update({
    where: { id: task.id },
    data: { baselineStart: task.plannedStart, baselineEnd: task.plannedEnd },
  })));
  return { objectId, capturedTasks: tasks.length, capturedAt: new Date() };
}

export async function getGanttData(companyId: string, objectId: string) {
  const object = await getObject(companyId, objectId);
  if (!object) return null;

  const now = new Date();
  const allTasks = object.stages.flatMap((stage) => stage.sections.flatMap((section) => section.tasks));
  const plannedEnds = allTasks.flatMap((task) => task.plannedEnd ? [new Date(task.plannedEnd)] : []);
  const plannedCompletion = plannedEnds.length
    ? new Date(Math.max(...plannedEnds.map((date) => date.getTime())))
    : null;
  const unfinishedTasks = allTasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  const overdueDays = unfinishedTasks.reduce((maximum, task) => {
    if (!task.plannedEnd) return maximum;
    const delay = Math.max(0, Math.ceil((now.getTime() - new Date(task.plannedEnd).getTime()) / 86_400_000));
    return Math.max(maximum, delay);
  }, 0);
  const forecastCompletion = plannedCompletion
    ? new Date(plannedCompletion.getTime() + overdueDays * 86_400_000)
    : null;
  let criticalPath: { taskIds: string[]; durationDays: number };
  try {
    criticalPath = calculateCriticalPath(allTasks);
  } catch (error) {
    criticalPath = { taskIds: [], durationDays: 0 };
  }
  return {
    objectId: object.id,
    objectName: object.name,
    forecast: {
      plannedCompletion,
      forecastCompletion,
      delayDays: overdueDays,
      basis: overdueDays > 0 ? 'current_overdue_tasks' : 'current_schedule',
    },
    criticalPath,
    stages: object.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      sections: stage.sections.map((section) => ({
        id: section.id,
        name: section.name,
        tasks: section.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          plannedStart: task.plannedStart,
          plannedEnd: task.plannedEnd,
          baselineStart: task.baselineStart,
          baselineEnd: task.baselineEnd,
          dependsOn: task.dependsOn,
          isCritical: criticalPath.taskIds.includes(task.id),
          riskLevel: computeTaskRisk(task, now),
        })),
      })),
    })),
  };
}
