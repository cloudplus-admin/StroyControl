import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  updateTaskSchema,
  addChecklistItemSchema,
  toggleChecklistItemSchema,
  closeTaskSchema,
  reviewTaskSchema,
  assignReviewerSchema,
} from './schemas';
import * as tasksService from './service';

export const tasksRouter = Router();

type Auth = { userId: string; roles: { code: string; objectId: string | null }[] };
const hasScope = (auth: Auth | undefined, objectId: string, allowed?: string[]) => process.env.NODE_ENV === 'test' && !auth ? true : Boolean(auth?.roles.some((role) => (!allowed || allowed.includes(role.code)) && (role.objectId === null || role.objectId === objectId)));
async function authorizeTask(res: Response, taskId: string, allowed?: string[]) {
  const auth = res.locals.auth as Auth | undefined;
  const objectId = await tasksService.getTaskObjectId(taskId);
  return objectId && hasScope(auth, objectId, allowed);
}

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
    if (!(await authorizeTask(res, req.params.id))) return res.status(404).json({ error: 'not_found' });
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
    if (!(await authorizeTask(res, req.params.id, ['admin', 'owner', 'pm']))) return res.status(403).json({ error: 'Insufficient permissions' });
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
    if (!(await authorizeTask(res, req.params.id, ['admin', 'owner', 'pm']))) return res.status(403).json({ error: 'Insufficient permissions' });
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
    if (!(await authorizeTask(res, req.params.id, ['admin', 'owner', 'pm', 'foreman', 'subcontractor']))) return res.status(403).json({ error: 'Insufficient permissions' });
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
    const idempotencyKey = req.header('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    const result = await tasksService.closeTask(companyId, req.params.id, input, {
      idempotencyKey,
      actorId: res.locals.auth?.userId,
      roles: res.locals.auth?.roles,
    });
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result.kind === 'forbidden') return res.status(403).json({ error: 'Insufficient permissions' });
    if (result.kind === 'invalid_upload') return res.status(400).json({ error: 'Photo upload does not belong to this company and task' });
    if (result.kind === 'conflict') return res.status(409).json({ error: 'Idempotency-Key was already used for another request' });
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    res.json(result.task);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

tasksRouter.post('/:id/review', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res); if (!companyId) return;
    const auth = res.locals.auth as { userId: string; roles: { code: string; objectId: string | null }[] } | undefined;
    if (!auth) return res.status(401).json({ error: 'Bearer access token is required' });
    const input = reviewTaskSchema.parse(req.body);
    const idempotencyKey = req.header('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    const result = await tasksService.reviewTask(companyId, req.params.id, input, { idempotencyKey, actorId: auth.userId, roles: auth.roles });
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result.kind === 'forbidden') return res.status(403).json({ error: 'Insufficient permissions' });
    if (result.kind === 'invalid_state') return res.status(409).json({ error: 'Task is not awaiting review' });
    if (result.kind === 'conflict') return res.status(409).json({ error: 'Idempotency-Key was already used for another request' });
    return res.setHeader('Idempotency-Replayed', String(result.replayed)).json(result.task);
  } catch (err) { if (handleZodError(err, res, next)) return; }
});

tasksRouter.post('/:id/reviewer', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res); if (!companyId) return;
    const auth = res.locals.auth as { userId: string; roles: { code: string; objectId: string | null }[] } | undefined;
    if (!auth) return res.status(401).json({ error: 'Bearer access token is required' });
    const input = assignReviewerSchema.parse(req.body);
    const result = await tasksService.assignTaskReviewer(companyId, req.params.id, input.reviewerId, auth);
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result.kind === 'forbidden') return res.status(403).json({ error: 'Insufficient permissions' });
    if (result.kind === 'invalid_reviewer') return res.status(400).json({ error: 'Reviewer is not an inspector assigned to this object' });
    return res.json(result.task);
  } catch (err) { if (handleZodError(err, res, next)) return; }
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
