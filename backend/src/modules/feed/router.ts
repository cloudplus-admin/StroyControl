import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createFeedEventSchema, reactionSchema, searchQuerySchema } from './schemas';
import * as feedService from './service';

export const feedRouter = Router();

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

feedRouter.get('/objects/:objectId/feed', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
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
    const input = createFeedEventSchema.parse(req.body);
    const event = await feedService.createFeedEvent(companyId, req.params.objectId, input);
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
    const reaction = await feedService.addReaction(companyId, req.params.eventId, input.userId, input.emoji);
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
    const result = await feedService.removeReaction(companyId, req.params.eventId, req.params.userId);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
