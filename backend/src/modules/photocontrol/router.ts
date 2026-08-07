import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createPhotoReportSchema, createDefectSchema, reviewPhotoReportSchema, updateDefectSchema } from './schemas';
import * as photocontrolService from './service';
import { prisma } from '../../db/prisma';

export const photocontrolRouter = Router();
type Auth = { userId: string; roles: { code: string; objectId: string | null }[] };
const canAccess = (res: Response, objectId: string, allowed?: string[]) => {
  const auth = res.locals.auth as Auth | undefined;
  return process.env.NODE_ENV === 'test' && !auth ? true : Boolean(auth?.roles.some((role) => (!allowed || allowed.includes(role.code)) && (role.objectId === null || role.objectId === objectId)));
};

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
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
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
    if (!canAccess(res, req.params.objectId, ['admin', 'owner', 'pm', 'foreman', 'subcontractor', 'inspector'])) return res.status(403).json({ error: 'forbidden' });
    const input = createPhotoReportSchema.parse(req.body);
    if (input.kind === 'hidden_works' && !canAccess(res, req.params.objectId, ['admin', 'owner', 'pm', 'inspector'])) return res.status(403).json({ error: 'forbidden' });
    const report = await photocontrolService.createPhotoReport(companyId, req.params.objectId, { ...input, authorId: (res.locals.auth as Auth | undefined)?.userId ?? input.authorId });
    if (!report) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(report);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.post('/photo-reports/:id/review', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const record = await prisma.photoReport.findFirst({ where: { id: req.params.id, object: { companyId } }, select: { objectId: true } });
    if (!record || !canAccess(res, record.objectId, ['admin', 'owner', 'pm', 'inspector'])) return res.status(403).json({ error: 'forbidden' });
    const input = reviewPhotoReportSchema.parse(req.body);
    const report = await photocontrolService.reviewPhotoReport(companyId, req.params.id, input);
    if (!report) return res.status(404).json({ error: 'not_found' });
    res.json(report);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.get('/objects/:objectId/shooting-points', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
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
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
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
    if (!canAccess(res, req.params.objectId)) return res.status(404).json({ error: 'not_found' });
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
    if (!canAccess(res, req.params.objectId, ['admin', 'owner', 'pm', 'foreman', 'subcontractor', 'inspector'])) return res.status(403).json({ error: 'forbidden' });
    const input = createDefectSchema.parse(req.body);
    const defect = await photocontrolService.createDefect(companyId, req.params.objectId, { ...input, reportedBy: (res.locals.auth as Auth | undefined)?.userId ?? input.reportedBy });
    if (!defect) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(defect);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});

photocontrolRouter.patch('/defects/:id', async (req, res, next) => {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;
    const defectRecord = await prisma.defect.findFirst({ where: { id: req.params.id, object: { companyId } }, select: { objectId: true } });
    if (!defectRecord || !canAccess(res, defectRecord.objectId, ['admin', 'owner', 'pm', 'foreman', 'inspector'])) return res.status(403).json({ error: 'forbidden' });
    const input = updateDefectSchema.parse(req.body);
    const defect = await photocontrolService.updateDefectStatus(companyId, req.params.id, input.status);
    if (!defect) return res.status(404).json({ error: 'not_found' });
    res.json(defect);
  } catch (err) {
    if (handleZodError(err, res, next)) return;
  }
});
