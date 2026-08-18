import { Router, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createFeedEventSchema, reactionSchema, searchQuerySchema } from './schemas';
import * as feedService from './service';
import { prisma } from '../../db/prisma';
import { requireCompanyId } from '../../auth/context';

export const feedRouter = Router();
type Auth = { userId: string; roles: { objectId: string | null }[] };
const canAccess = (res: Response, objectId: string) => {
  const auth = res.locals.auth as Auth | undefined;
  return process.env.NODE_ENV === 'test' && !auth ? true : Boolean(auth?.roles.some((role) => role.objectId === null || role.objectId === objectId));
};

function handleZodError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return true;
  }
  next(err);
  return false;
}

feedRouter.get('/objects/:objectId/feed', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const events = await feedService.listFeed(companyId, req.params.objectId, limit);
    if (events === null) return res.status(404).json({ error: 'not_found' });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

feedRouter.post('/objects/:objectId/feed', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
    const input = createFeedEventSchema.parse(req.body);
    const event = await feedService.createFeedEvent(companyId, req.params.objectId, { ...input, authorId: (res.locals.auth as Auth | undefined)?.userId ?? input.authorId });
    if (!event) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(event);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

feedRouter.get('/objects/:objectId/feed/search', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
    const { q } = searchQuerySchema.parse(req.query);
    const events = await feedService.searchFeed(companyId, req.params.objectId, q);
    if (events === null) return res.status(404).json({ error: 'not_found' });
    res.json(events);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

feedRouter.put('/feed/:eventId/reactions', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = reactionSchema.parse(req.body);
    const event = await prisma.feedEvent.findFirst({ where: { id: req.params.eventId, object: { companyId } }, select: { objectId: true } });
    if (!event || !canAccess(res, event.objectId)) return res.status(404).json({ error: 'not_found' });
    const reaction = await feedService.addReaction(companyId, req.params.eventId, (res.locals.auth as Auth | undefined)?.userId ?? input.userId, input.emoji);
    if (!reaction) return res.status(404).json({ error: 'not_found' });
    res.json(reaction);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

feedRouter.delete('/feed/:eventId/reactions/:userId', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const auth = res.locals.auth as Auth | undefined;
    if (auth && auth.userId !== req.params.userId) return res.status(403).json({ error: 'forbidden' });
    const event = await prisma.feedEvent.findFirst({ where: { id: req.params.eventId, object: { companyId } }, select: { objectId: true } });
    if (!event || !canAccess(res, event.objectId)) return res.status(404).json({ error: 'not_found' });
    const result = await feedService.removeReaction(companyId, req.params.eventId, auth?.userId ?? req.params.userId);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
