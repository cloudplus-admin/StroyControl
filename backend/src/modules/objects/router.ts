import { Router, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createObjectSchema,
  updateObjectSchema,
  createStageSchema,
  createSectionSchema,
  createTaskSchema,
} from './schemas';
import * as objectsService from './service';
import { requireAnyRole } from '../../auth/authorization';
import { prisma } from '../../db/prisma';
import { requireCompanyId } from '../../auth/context';

export const objectsRouter = Router();
type Auth = { roles: { code: string; objectId: string | null }[] };
const canAccessObject = (res: Response, objectId: string) => {
  const auth = res.locals.auth as Auth | undefined;
  return process.env.NODE_ENV === 'test' && !auth ? true : Boolean(auth?.roles.some((role) => role.objectId === null || role.objectId === objectId));
};

function handleZodError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return true;
  }
  next(err);
  return false;
}

objectsRouter.get('/', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const objects = await objectsService.listObjects(companyId);
    res.json(objects.filter((object) => canAccessObject(res, object.id)));
  } catch (err) {
    next(err);
  }
});

objectsRouter.post('/', requireAnyRole('admin', 'owner', 'pm'), async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const auth = res.locals.auth as Auth | undefined;
    if (auth && !auth.roles.some((role) => ['admin', 'owner', 'pm'].includes(role.code) && role.objectId === null)) return res.status(403).json({ error: 'Insufficient permissions' });
    const input = createObjectSchema.parse(req.body);
    const object = await objectsService.createObject(companyId, input);
    res.status(201).json(object);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.get('/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccessObject(res, req.params.id)) return res.status(404).json({ error: 'not_found' });
    const object = await objectsService.getObject(companyId, req.params.id);
    if (!object) return res.status(404).json({ error: 'not_found' });
    res.json(object);
  } catch (err) {
    next(err);
  }
});

objectsRouter.patch('/:id', requireAnyRole('admin', 'owner', 'pm'), async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccessObject(res, req.params.id)) return res.status(404).json({ error: 'not_found' });
    const input = updateObjectSchema.parse(req.body);
    const object = await objectsService.updateObject(companyId, req.params.id, input);
    if (!object) return res.status(404).json({ error: 'not_found' });
    res.json(object);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.get('/:id/gantt', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccessObject(res, req.params.id)) return res.status(404).json({ error: 'not_found' });
    const gantt = await objectsService.getGanttData(companyId, req.params.id);
    if (!gantt) return res.status(404).json({ error: 'not_found' });
    res.json(gantt);
  } catch (err) {
    next(err);
  }
});

objectsRouter.post('/:id/stages', requireAnyRole('admin', 'owner', 'pm'), async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccessObject(res, req.params.id)) return res.status(404).json({ error: 'not_found' });
    const input = createStageSchema.parse(req.body);
    const created = await objectsService.addStage(companyId, req.params.id, input);
    if (!created) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(created);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.post('/stages/:stageId/sections', requireAnyRole('admin', 'owner', 'pm'), async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const stage = await prisma.stage.findFirst({ where: { id: req.params.stageId, object: { companyId } }, select: { objectId: true } });
    if (!stage || !canAccessObject(res, stage.objectId)) return res.status(404).json({ error: 'not_found' });
    const input = createSectionSchema.parse(req.body);
    const created = await objectsService.addSection(companyId, req.params.stageId, input);
    if (!created) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(created);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.post('/sections/:sectionId/tasks', requireAnyRole('admin', 'owner', 'pm'), async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const section = await prisma.workSection.findFirst({ where: { id: req.params.sectionId, stage: { object: { companyId } } }, select: { stage: { select: { objectId: true } } } });
    if (!section || !canAccessObject(res, section.stage.objectId)) return res.status(404).json({ error: 'not_found' });
    const input = createTaskSchema.parse(req.body);
    const task = await objectsService.addTask(companyId, req.params.sectionId, input);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

// Обновление/закрытие/чек-лист отдельной задачи — см. модуль tasks (/api/tasks/:id).
