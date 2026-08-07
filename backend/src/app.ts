import express from 'express';
import { access, mkdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { objectsRouter } from './modules/objects/router';
import { tasksRouter } from './modules/tasks/router';
import { photocontrolRouter } from './modules/photocontrol/router';
import { feedRouter } from './modules/feed/router';
import { authRouter } from './auth/router';
import { requireAccessToken } from './auth/middleware';
import { adminRouter } from './modules/admin/router';
import { auditRouter } from './modules/audit/router';
import { uploadsRouter } from './modules/uploads/router';
import { mobileRouter } from './modules/mobile/router';
import { planningRouter } from './modules/planning/router';
import { documentsRouter } from './modules/documents/router';
import { notificationsRouter } from './modules/notifications/router';
import { prisma } from './db/prisma';
import { ZodError } from 'zod';

export function createApp() {
  const app = express();
  app.use((req, res, next) => {
    const allowedOrigin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:48031';
    if (req.header('origin') === allowedOrigin) {
      res.setHeader('access-control-allow-origin', allowedOrigin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, idempotency-key, x-file-name, x-task-id');
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).send();
    return next();
  });
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const checks: Record<string, { status: string; detail?: string }> = {};
    try { await prisma.$queryRaw`SELECT 1`; checks.database = { status: 'ok' }; } catch { checks.database = { status: 'error' }; }
    try {
      const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');
      await mkdir(uploadDir, { recursive: true }); await access(uploadDir);
      const disk = await statfs(uploadDir); const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      const minimum = Number(process.env.MIN_UPLOAD_FREE_BYTES ?? 536870912);
      checks.storage = { status: freeBytes >= minimum ? 'ok' : 'error', detail: `${freeBytes} bytes free` };
    } catch { checks.storage = { status: 'error' }; }
    const healthy = Object.values(checks).every((check) => check.status === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', requireAccessToken);
  app.use('/api/admin', adminRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/mobile', mobileRouter);
  app.use('/api/planning', planningRouter);
  app.use('/api', documentsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/objects', objectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api', photocontrolRouter);
  app.use('/api', feedRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error: 'validation_error', details: error.issues });
    console.error(error);
    return res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
