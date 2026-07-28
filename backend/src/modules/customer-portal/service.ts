import { prisma } from '../../db/prisma';
import { createSystemEvent } from '../feed/service';
import * as objectsService from '../objects/service';
import * as photocontrolService from '../photocontrol/service';
import * as documentsService from '../documents/service';

const RECENT_PHOTO_REPORTS_LIMIT = 10;

/**
 * Кабинет заказчика (Этап 1, раздел 12 ТЗ): агрегированный обзор объекта —
 * график (Гант/прогресс), последние фотоотчёты и список документов — без
 * повторных запросов к БД, а переиспользованием сервисов модулей
 * objects/photocontrol/documents.
 */
export async function getPortalOverview(companyId: string, objectId: string) {
  const gantt = await objectsService.getGanttData(companyId, objectId);
  if (!gantt) return null;

  const [photoReports, documents, paymentSchedule, approvals] = await Promise.all([
    photocontrolService.listPhotoReports(companyId, objectId),
    documentsService.listDocuments(companyId, objectId),
    listPaymentSchedule(companyId, objectId),
    listCustomerApprovals(companyId, objectId),
  ]);

  return {
    objectId: gantt.objectId,
    objectName: gantt.objectName,
    gantt,
    recentPhotoReports: (photoReports ?? []).slice(0, RECENT_PHOTO_REPORTS_LIMIT),
    documents: documents ?? [],
    paymentsSummary: {
      pendingCount: (paymentSchedule ?? []).filter((p) => p.status === 'pending').length,
      overdueCount: (paymentSchedule ?? []).filter((p) => p.status === 'overdue').length,
      paidCount: (paymentSchedule ?? []).filter((p) => p.status === 'paid').length,
    },
    approvalsSummary: {
      pendingCount: (approvals ?? []).filter((a) => a.status === 'pending').length,
    },
  };
}

/**
 * Статус платежей "overdue" не хранится в БД, а вычисляется при чтении по
 * `dueDate` — тот же приём, что и `riskLevel` в модуле objects (см.
 * computeTaskRisk), чтобы не заводить отдельный джоб-свип для Этапа 1.
 */
function withEffectivePaymentStatus<T extends { status: string; dueDate: Date }>(payment: T, now = new Date()): T {
  if (payment.status === 'paid') return payment;
  if (payment.dueDate.getTime() < now.getTime()) return { ...payment, status: 'overdue' };
  return payment;
}

export async function listPaymentSchedule(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  const payments = await prisma.paymentSchedule.findMany({ where: { objectId }, orderBy: { dueDate: 'asc' } });
  return payments.map((p) => withEffectivePaymentStatus(p));
}

export async function createPaymentScheduleEntry(
  companyId: string,
  objectId: string,
  input: { description: string; amount: number; dueDate: Date },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.paymentSchedule.create({ data: { objectId, ...input } });
}

export async function markPaymentAsPaid(companyId: string, paymentId: string, paidAt?: Date) {
  const payment = await prisma.paymentSchedule.findFirst({ where: { id: paymentId, object: { companyId } } });
  if (!payment) return null;
  return prisma.paymentSchedule.update({
    where: { id: paymentId },
    data: { status: 'paid', paidAt: paidAt ?? new Date() },
  });
}

export async function listCustomerApprovals(companyId: string, objectId: string) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.customerApproval.findMany({ where: { objectId }, orderBy: { createdAt: 'desc' } });
}

export async function createCustomerApproval(
  companyId: string,
  objectId: string,
  input: { taskId?: string; stageId?: string; title: string; comment?: string; raisedBy: string },
) {
  const object = await prisma.object.findFirst({ where: { id: objectId, companyId } });
  if (!object) return null;
  return prisma.customerApproval.create({
    data: {
      objectId,
      taskId: input.taskId,
      stageId: input.stageId,
      title: input.title,
      comment: input.comment,
      raisedById: input.raisedBy,
    },
  });
}

/**
 * Ответ заказчика: согласовано / есть замечания (с комментарием). Публикует
 * системное событие в ленту объекта — тот же приём, что и в photocontrol
 * (смена статуса замечания), см. updateDefectStatus.
 */
export async function respondToCustomerApproval(
  companyId: string,
  approvalId: string,
  input: { status: 'approved' | 'changes_requested'; respondedBy: string; responseComment?: string },
) {
  const approval = await prisma.customerApproval.findFirst({ where: { id: approvalId, object: { companyId } } });
  if (!approval) return null;
  const updated = await prisma.customerApproval.update({
    where: { id: approvalId },
    data: {
      status: input.status,
      respondedById: input.respondedBy,
      responseComment: input.responseComment,
      respondedAt: new Date(),
    },
  });
  const statusLabel = input.status === 'approved' ? 'согласовано' : 'есть замечания';
  await createSystemEvent(
    approval.objectId,
    'status_change',
    `Согласование «${approval.title}» — заказчик: ${statusLabel}`,
  );
  return updated;
}
