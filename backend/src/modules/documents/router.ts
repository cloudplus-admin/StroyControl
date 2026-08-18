import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { notifyObjectRoles, notifyUsers } from '../notifications/service';
import { asyncRoute } from '../../http/async-route';

type Auth = { companyId: string; userId: string; roles: { code: string; objectId: string | null }[] };
const canAccess = (auth: Auth, objectId: string) => auth.roles.some((role) => role.objectId === null || role.objectId === objectId);
const canManage = (auth: Auth, objectId: string) => auth.roles.some((role) => ['admin', 'owner', 'pm', 'foreman'].includes(role.code) && (role.objectId === null || role.objectId === objectId));
const canDecide = (auth: Auth, objectId: string) => auth.roles.some((role) => ['inspector', 'customer'].includes(role.code) && (role.objectId === null || role.objectId === objectId));
const canSignAct = (auth: Auth, objectId: string) => auth.roles.some((role) => ['inspector', 'customer'].includes(role.code) && (role.objectId === null || role.objectId === objectId));

export const documentsRouter = Router();

documentsRouter.get('/objects/:objectId/documents', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  if (!canAccess(auth, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
  return res.json(await prisma.projectDocument.findMany({
    where: { companyId: auth.companyId, objectId: req.params.objectId },
    include: { createdBy: { select: { fullName: true } }, approvals: { include: { actor: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  }));
}));

documentsRouter.post('/objects/:objectId/documents', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  if (!canManage(auth, req.params.objectId)) return res.status(403).json({ error: 'forbidden' });
  const input = z.object({ title: z.string().trim().min(2).max(200), kind: z.enum(['project', 'estimate', 'contract', 'act', 'other']), fileUrl: z.string().url(), version: z.number().int().positive().default(1) }).parse(req.body);
  const object = await prisma.object.findFirst({ where: { id: req.params.objectId, companyId: auth.companyId } });
  if (!object) return res.status(404).json({ error: 'not_found' });
  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.projectDocument.create({ data: { ...input, companyId: auth.companyId, objectId: object.id, createdById: auth.userId, status: 'review' } });
    await notifyObjectRoles(tx, { companyId: auth.companyId, objectId: object.id, roleCodes: ['customer', 'inspector'], excludeUserId: auth.userId, kind: 'document_review', title: 'Документ на согласование', body: input.title, entityType: 'document', entityId: created.id });
    return created;
  });
  return res.status(201).json(document);
}));

documentsRouter.post('/documents/:id/decision', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  const input = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(1000).optional() }).parse(req.body);
  if (input.decision === 'rejected' && !input.note) return res.status(400).json({ error: 'note_required' });
  const document = await prisma.projectDocument.findFirst({ where: { id: req.params.id, companyId: auth.companyId } });
  if (!document) return res.status(404).json({ error: 'not_found' });
  if (!canDecide(auth, document.objectId)) return res.status(403).json({ error: 'forbidden' });
  if (document.status !== 'review') return res.status(409).json({ error: 'invalid_state' });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.documentApproval.upsert({ where: { documentId_actorId: { documentId: document.id, actorId: auth.userId } }, create: { documentId: document.id, actorId: auth.userId, ...input }, update: input });
    const requiredAssignments = await tx.userRole.findMany({
      where: { user: { companyId: auth.companyId, isActive: true }, role: { code: { in: ['customer', 'inspector'] } }, OR: [{ objectId: null }, { objectId: document.objectId }] },
      select: { userId: true, role: { select: { code: true } } },
    });
    const requiredRoles = [...new Set(requiredAssignments.map((assignment) => assignment.role.code))];
    const approvals = await tx.documentApproval.findMany({
      where: { documentId: document.id, decision: 'approved' },
      include: { actor: { include: { roles: { include: { role: { select: { code: true } } } } } } },
    });
    const coveredRoles = new Set(approvals.flatMap((approval) => approval.actor.roles
      .filter((assignment) => assignment.objectId === null || assignment.objectId === document.objectId)
      .map((assignment) => assignment.role.code)));
    const status = input.decision === 'rejected'
      ? 'rejected'
      : requiredRoles.every((role) => coveredRoles.has(role)) && approvals.length >= requiredRoles.length ? 'approved' : 'review';
    const result = await tx.projectDocument.update({ where: { id: document.id }, data: { status } });
    await notifyUsers(tx, { companyId: auth.companyId, userIds: [document.createdById], objectId: document.objectId, kind: 'document_decision', title: status === 'approved' ? 'Документ согласован' : status === 'rejected' ? 'Документ отклонен' : 'Получено решение по документу', body: status === 'rejected' ? `${document.title}: ${input.note}` : document.title, entityType: 'document', entityId: document.id });
    return result;
  });
  return res.json(updated);
}));

documentsRouter.get('/objects/:objectId/acts', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  if (!canAccess(auth, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
  return res.json(await prisma.workAct.findMany({ where: { companyId: auth.companyId, objectId: req.params.objectId }, include: { createdBy: { select: { fullName: true } }, signedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }));
}));

documentsRouter.post('/objects/:objectId/acts', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  if (!canManage(auth, req.params.objectId)) return res.status(403).json({ error: 'forbidden' });
  const input = z.object({ template: z.enum(['completed', 'hidden', 'acceptance']), number: z.string().trim().min(1).max(60), title: z.string().trim().min(2).max(200), amount: z.number().nonnegative(), pdfUrl: z.string().url().optional() }).parse(req.body);
  const object = await prisma.object.findFirst({ where: { id: req.params.objectId, companyId: auth.companyId } });
  if (!object) return res.status(404).json({ error: 'not_found' });
  const act = await prisma.$transaction(async (tx) => {
    const created = await tx.workAct.create({ data: { ...input, companyId: auth.companyId, objectId: object.id, createdById: auth.userId, status: 'review' } });
    await notifyObjectRoles(tx, { companyId: auth.companyId, objectId: object.id, roleCodes: ['customer', 'inspector'], excludeUserId: auth.userId, kind: 'act_review', title: 'Акт на подписание', body: `${input.number} - ${input.title}`, entityType: 'act', entityId: created.id });
    return created;
  });
  return res.status(201).json(act);
}));

documentsRouter.post('/acts/:id/sign', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as Auth;
  const act = await prisma.workAct.findFirst({ where: { id: req.params.id, companyId: auth.companyId } });
  if (!act) return res.status(404).json({ error: 'not_found' });
  if (!canSignAct(auth, act.objectId)) return res.status(403).json({ error: 'forbidden' });
  if (act.status !== 'review') return res.status(409).json({ error: 'invalid_state' });
  const signed = await prisma.$transaction(async (tx) => {
    const updated = await tx.workAct.update({ where: { id: act.id }, data: { status: 'signed', signedById: auth.userId, signedAt: new Date() } });
    await notifyUsers(tx, { companyId: auth.companyId, userIds: [act.createdById], objectId: act.objectId, kind: 'act_signed', title: 'Акт подписан', body: `${act.number} - ${act.title}`, entityType: 'act', entityId: act.id });
    return updated;
  });
  return res.json(signed);
}));
