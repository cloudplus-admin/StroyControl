import { prisma } from '../../db/prisma';
import { OBJECT_TEMPLATES, ObjectTemplateCode } from './templates';

type TaskLike = { status: string; plannedEnd: Date | null };

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
  input: { name: string; address?: string; templateCode?: ObjectTemplateCode },
) {
  return prisma.object.create({
    data: {
      companyId,
      name: input.name,
      address: input.address,
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
  input: { name?: string; address?: string; status?: string },
) {
  const existing = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!existing) return null;
  return prisma.object.update({ where: { id: objectId }, data: input });
}

export async function addStage(companyId: string, objectId: string, input: { name: string; sortOrder: number }) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.stage.create({ data: { objectId, name: input.name, sortOrder: input.sortOrder } });
}

export async function addSection(
  companyId: string,
  stageId: string,
  input: { name: string; sortOrder: number },
) {
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, object: { companyId } },
  });
  if (!stage) return null;
  return prisma.workSection.create({ data: { stageId, name: input.name, sortOrder: input.sortOrder } });
}

export async function addTask(
  companyId: string,
  workSectionId: string,
  input: {
    title: string;
    description?: string;
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
  return prisma.task.create({ data: { workSectionId, ...input } });
}

export async function getGanttData(companyId: string, objectId: string) {
  const object = await getObject(companyId, objectId);
  if (!object) return null;

  const now = new Date();
  return {
    objectId: object.id,
    objectName: object.name,
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
          riskLevel: computeTaskRisk(task, now),
        })),
      })),
    })),
  };
}
