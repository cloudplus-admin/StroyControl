import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createDocumentSchema, createVersionSchema } from './schemas';
import * as documentsService from './service';

export const documentsRouter = Router();

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

documentsRouter.get('/objects/:objectId/documents', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const documents = await documentsService.listDocuments(companyId, req.params.objectId);
    if (documents === null) return res.status(404).json({ error: 'not_found' });
    res.json(documents);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/objects/:objectId/documents', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createDocumentSchema.parse(req.body);
    const document = await documentsService.createDocument(companyId, req.params.objectId, input);
    if (!document) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(document);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

documentsRouter.get('/documents/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const document = await documentsService.getDocument(companyId, req.params.id);
    if (!document) return res.status(404).json({ error: 'not_found' });
    res.json(document);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/documents/:id/versions', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createVersionSchema.parse(req.body);
    const version = await documentsService.addDocumentVersion(companyId, req.params.id, input);
    if (!version) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(version);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});
