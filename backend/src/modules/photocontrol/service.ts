import { prisma } from '../../db/prisma';

export async function listPhotoReports(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.photoReport.findMany({ where: { objectId }, orderBy: { createdAt: 'desc' } });
}

export async function createPhotoReport(
  companyId: string,
  objectId: string,
  input: {
    taskId?: string;
    authorId: string;
    shootingPoint?: string;
    kind: string;
    fileUrl: string;
    geoLat?: number;
    geoLng?: number;
    inspectorSignature?: string;
  },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.photoReport.create({ data: { objectId, ...input } });
}

/**
 * Таймлайн прогресса: фото по одной точке съёмки, отсортированные по дате,
 * для визуального сравнения "было / стало" во времени.
 */
export async function getShootingPointTimeline(companyId: string, objectId: string, shootingPoint: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.photoReport.findMany({
    where: { objectId, shootingPoint },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listShootingPoints(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  const points = await prisma.photoReport.findMany({
    where: { objectId, shootingPoint: { not: null } },
    distinct: ['shootingPoint'],
    select: { shootingPoint: true },
  });
  return points.map((p) => p.shootingPoint).filter((p): p is string => Boolean(p));
}

export async function listDefects(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.defect.findMany({ where: { objectId }, orderBy: { createdAt: 'desc' } });
}

export async function createDefect(
  companyId: string,
  objectId: string,
  input: { taskId?: string; reportedBy: string; description: string },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.defect.create({ data: { objectId, ...input } });
}

export async function updateDefectStatus(companyId: string, defectId: string, status: string) {
  const defect = await prisma.defect.findFirst({ where: { id: defectId, object: { companyId } } });
  if (!defect) return null;
  return prisma.defect.update({ where: { id: defectId }, data: { status } });
}
