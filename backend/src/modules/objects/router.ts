import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createObjectSchema,
  updateObjectSchema,
  createStageSchema,
  createSectionSchema,
  createTaskSchema,
  updateTaskSchema,
} from './schemas';
import * as objectsService from './service';

export const objectsRouter = Router();

function requireCompanyId(req: Request, res: Response): string | null {
  const companyId = req.header('x-company-id');
  if (!companyId) {
    res.status(401).json({ error: 'x-company-id header is required (temporary stand-in until auth is implemented)' });
    return null;
  }
  return companyId;
}

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
    res.json(objects);
  } catch (err) {
    next(err);
  }
});

objectsRouter.post('/', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
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
    const object = await objectsService.getObject(companyId, req.params.id);
    if (!object) return res.status(404).json({ error: 'not_found' });
    res.json(object);
  } catch (err) {
    next(err);
  }
});

objectsRouter.patch('/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
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
    const gantt = await objectsService.getGanttData(companyId, req.params.id);
    if (!gantt) return res.status(404).json({ error: 'not_found' });
    res.json(gantt);
  } catch (err) {
    next(err);
  }
});

objectsRouter.post('/:id/stages', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createStageSchema.parse(req.body);
    const stage = await objectsService.addStage(companyId, req.params.id, input);
    if (!stage) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(stage);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.post('/stages/:stageId/sections', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createSectionSchema.parse(req.body);
    const section = await objectsService.addSection(companyId, req.params.stageId, input);
    if (!section) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(section);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.post('/sections/:sectionId/tasks', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createTaskSchema.parse(req.body);
    const task = await objectsService.addTask(companyId, req.params.sectionId, input);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

objectsRouter.patch('/tasks/:taskId', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = updateTaskSchema.parse(req.body);
    const task = await objectsService.updateTask(companyId, req.params.taskId, input);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.json(task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});
