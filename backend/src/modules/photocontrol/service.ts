import { prisma } from '../../db/prisma';
import { createSystemEvent } from '../feed/service';

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

/**
 * Привязка фотофиксации к акту выполненных работ (документ типа `act`,
 * модуль «Документооборот», формы РУз раздел 6 ТЗ).
 */
export async function linkPhotoReportToDocument(companyId: string, photoReportId: string, documentId: string) {
  const photoReport = await prisma.photoReport.findFirst({ where: { id: photoReportId, object: { companyId } } });
  if (!photoReport) return null;
  const document = await prisma.document.findFirst({ where: { id: documentId, objectId: photoReport.objectId } });
  if (!document) return null;
  return prisma.photoReport.update({ where: { id: photoReportId }, data: { documentId } });
}

export async function updateDefectStatus(companyId: string, defectId: string, status: string) {
  const defect = await prisma.defect.findFirst({ where: { id: defectId, object: { companyId } } });
  if (!defect) return null;
  const updated = await prisma.defect.update({ where: { id: defectId }, data: { status } });
  await createSystemEvent(
    defect.objectId,
    'status_change',
    `Замечание «${defect.description}» — статус изменён на «${status}»`,
  );
  return updated;
}
