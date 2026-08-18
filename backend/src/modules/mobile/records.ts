import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';

const kinds = ['journal', 'supply', 'tool', 'material', 'stockMovement', 'crew', 'shift', 'safetyChecklist', 'safetyViolation'] as const;
const bodySchema = z.object({ objectId: z.string().uuid().nullable().optional(), payload: z.record(z.unknown()) });
type Auth = { companyId: string; roles: { code: string; objectId: string | null }[] };
const id = z.string().min(1).max(160);
const timestamp = z.string().datetime();
const projectPayload = z.object({ id, projectId: z.string().uuid() }).passthrough();
const payloadSchemas: Record<(typeof kinds)[number], z.ZodType<Record<string, unknown>>> = {
  journal: projectPayload.extend({ author: z.string().min(1), text: z.string().min(1), createdAt: timestamp, lang: z.enum(['ru', 'uz', 'en']) }),
  supply: projectPayload.extend({ item: z.string().min(1), quantity: z.string().min(1), neededAt: z.string().min(1), author: z.string().min(1), status: z.enum(['draft', 'ordered', 'delivered']), createdAt: timestamp }),
  tool: z.object({ id, qr: z.string().min(1), name: z.string().min(1), serial: z.string(), status: z.enum(['available', 'issued', 'repair']), location: z.string().min(1), updatedAt: timestamp }).passthrough(),
  material: projectPayload.extend({ name: z.string().min(1), unit: z.string().min(1), quantity: z.number().finite(), minimum: z.number().finite().nonnegative(), location: z.string().min(1), updatedAt: timestamp }),
  stockMovement: z.object({ id, materialId: id, kind: z.enum(['receipt', 'writeoff']), quantity: z.number().positive(), note: z.string(), createdAt: timestamp, material: projectPayload.extend({ name: z.string().min(1), unit: z.string().min(1) }) }).passthrough(),
  crew: z.object({ id, name: z.string().min(1), specialty: z.string().min(1), foreman: z.string().min(1), defaultWorkers: z.number().int().positive(), active: z.boolean(), updatedAt: timestamp }).passthrough(),
  shift: projectPayload.extend({ crew: z.string().min(1), workers: z.number().int().nonnegative(), hours: z.number().nonnegative(), output: z.string(), downtime: z.string(), date: z.string().min(1), createdAt: timestamp }),
  safetyChecklist: projectPayload.extend({ date: z.string().min(1), responsible: z.string().min(1), items: z.array(z.object({ id, text: z.string().min(1), done: z.boolean() })).min(1), signature: z.array(z.object({ x: z.number(), y: z.number() })).min(1) }),
  safetyViolation: projectPayload.extend({ title: z.string().min(1), responsible: z.string().min(1), status: z.enum(['open', 'fixing', 'closed']), createdAt: timestamp }),
};

const writeRoles: Record<(typeof kinds)[number], string[]> = {
  journal: ['admin', 'owner', 'pm', 'foreman'],
  supply: ['admin', 'owner', 'pm', 'foreman', 'supplier'],
  tool: ['admin', 'owner', 'pm', 'supplier'],
  material: ['admin', 'owner', 'pm', 'supplier'],
  stockMovement: ['admin', 'owner', 'pm', 'supplier'],
  crew: ['admin', 'owner', 'pm', 'foreman'],
  shift: ['admin', 'owner', 'pm', 'foreman'],
  safetyChecklist: ['admin', 'owner', 'pm', 'foreman', 'inspector'],
  safetyViolation: ['admin', 'owner', 'pm', 'foreman', 'inspector'],
};

function canWrite(auth: Auth, kind: (typeof kinds)[number], objectId: string | null | undefined) {
  return auth.roles.some((role) => writeRoles[kind].includes(role.code)
    && (role.objectId === null || (objectId !== null && objectId !== undefined && role.objectId === objectId)));
}

export const mobileRecordsRouter = Router();

mobileRecordsRouter.put('/records/:kind/:clientId', async (req, res, next) => {
  try {
    const auth = res.locals.auth as Auth | undefined;
    if (!auth) return res.status(401).json({ error: 'unauthorized' });
    const kind = z.enum(kinds).parse(req.params.kind);
    const clientId = z.string().min(1).max(160).parse(req.params.clientId);
    const body = bodySchema.parse(req.body);
    if (!canWrite(auth, kind, body.objectId)) return res.status(403).json({ error: 'record_write_denied' });
    const parsedPayload = payloadSchemas[kind].parse(body.payload);
    if (parsedPayload.id !== clientId) return res.status(400).json({ error: 'client_id_mismatch' });
    if (body.objectId && typeof parsedPayload.projectId === 'string' && parsedPayload.projectId !== body.objectId) return res.status(400).json({ error: 'object_id_mismatch' });
    const payload = parsedPayload as Prisma.InputJsonObject;
    const hasCompanyScope = auth.roles.some((role) => role.objectId === null);
    if (body.objectId) {
      const allowed = hasCompanyScope || auth.roles.some((role) => role.objectId === body.objectId);
      if (!allowed) return res.status(403).json({ error: 'object_access_denied' });
      const object = await prisma.object.findFirst({ where: { id: body.objectId, companyId: auth.companyId }, select: { id: true } });
      if (!object) return res.status(404).json({ error: 'object_not_found' });
    }
    const record = await prisma.mobileRecord.upsert({
      where: { companyId_kind_clientId: { companyId: auth.companyId, kind, clientId } },
      create: { companyId: auth.companyId, objectId: body.objectId ?? null, kind, clientId, payload },
      update: { objectId: body.objectId ?? null, payload },
    });
    return res.json({ id: record.clientId, kind: record.kind, objectId: record.objectId, payload: record.payload, updatedAt: record.updatedAt.toISOString() });
  } catch (error) { next(error); }
});
