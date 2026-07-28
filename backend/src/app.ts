import express from 'express';
import { objectsRouter } from './modules/objects/router';
import { tasksRouter } from './modules/tasks/router';
import { photocontrolRouter } from './modules/photocontrol/router';
import { feedRouter } from './modules/feed/router';
import { documentsRouter } from './modules/documents/router';
import { customerPortalRouter } from './modules/customer-portal/router';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/objects', objectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api', photocontrolRouter);
  app.use('/api', feedRouter);
  app.use('/api', documentsRouter);
  app.use('/api', customerPortalRouter);

  return app;
}
