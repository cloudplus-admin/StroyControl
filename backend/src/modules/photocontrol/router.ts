import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createPhotoReportSchema, createDefectSchema, updateDefectSchema, linkDocumentSchema } from './schemas';
import * as photocontrolService from './service';

export const photocontrolRouter = Router();

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

photocontrolRouter.get('/objects/:objectId/photo-reports', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const reports = await photocontrolService.listPhotoReports(companyId, req.params.objectId);
    if (reports === null) return res.status(404).json({ error: 'not_found' });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

photocontrolRouter.post('/objects/:objectId/photo-reports', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createPhotoReportSchema.parse(req.body);
    const report = await photocontrolService.createPhotoReport(companyId, req.params.objectId, input);
    if (!report) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(report);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.get('/objects/:objectId/shooting-points', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const points = await photocontrolService.listShootingPoints(companyId, req.params.objectId);
    if (points === null) return res.status(404).json({ error: 'not_found' });
    res.json(points);
  } catch (err) {
    next(err);
  }
});

photocontrolRouter.get('/objects/:objectId/shooting-points/:point/timeline', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const timeline = await photocontrolService.getShootingPointTimeline(
      companyId,
      req.params.objectId,
      req.params.point,
    );
    if (timeline === null) return res.status(404).json({ error: 'not_found' });
    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

photocontrolRouter.get('/objects/:objectId/defects', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const defects = await photocontrolService.listDefects(companyId, req.params.objectId);
    if (defects === null) return res.status(404).json({ error: 'not_found' });
    res.json(defects);
  } catch (err) {
    next(err);
  }
});

photocontrolRouter.post('/objects/:objectId/defects', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = createDefectSchema.parse(req.body);
    const defect = await photocontrolService.createDefect(companyId, req.params.objectId, input);
    if (!defect) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(defect);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.patch('/photo-reports/:id/link-document', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = linkDocumentSchema.parse(req.body);
    const report = await photocontrolService.linkPhotoReportToDocument(companyId, req.params.id, input.documentId);
    if (!report) return res.status(404).json({ error: 'not_found' });
    res.json(report);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.patch('/defects/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const input = updateDefectSchema.parse(req.body);
    const defect = await photocontrolService.updateDefectStatus(companyId, req.params.id, input.status);
    if (!defect) return res.status(404).json({ error: 'not_found' });
    res.json(defect);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});
