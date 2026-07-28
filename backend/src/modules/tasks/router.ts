import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  updateTaskSchema,
  addChecklistItemSchema,
  toggleChecklistItemSchema,
  closeTaskSchema,
} from './schemas';
import * as tasksService from './service';

export const tasksRouter = Router();

function requireCompanyId(req: Request, res: Response): string | null {
  const companyId = req.header('x-company-id');
  if (!companyId) {
    res.status(401).json({ error: 'x-company-id header is required (temporary stand-in until auth is implemented)' });
    return null;
  }
  return companyId;
}

function handleZodError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return true;
  }
  next(err);
  return false;
}

tasksRouter.get('/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const task = await tasksService.getTask(companyId, req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = updateTaskSchema.parse(req.body);
    const task = await tasksService.updateTask(companyId, req.params.id, input);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.json(task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

tasksRouter.post('/:id/checklist', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = addChecklistItemSchema.parse(req.body);
    const item = await tasksService.addChecklistItem(companyId, req.params.id, input.label);
    if (!item) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(item);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

tasksRouter.patch('/:id/checklist/:itemId', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = toggleChecklistItemSchema.parse(req.body);
    const item = await tasksService.toggleChecklistItem(companyId, req.params.id, req.params.itemId, input.isDone);
    if (!item) return res.status(404).json({ error: 'not_found' });
    res.json(item);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

tasksRouter.post('/:id/close', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = closeTaskSchema.parse(req.body);
    const task = await tasksService.closeTask(companyId, req.params.id, input);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.json(task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

tasksRouter.post('/sla-sweep', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const escalated = await tasksService.runSlaSweep(companyId);
    res.json({ escalated });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/recurring-sweep', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const created = await tasksService.runRecurringSweep(companyId);
    res.json({ created });
  } catch (err) {
    next(err);
  }
});
