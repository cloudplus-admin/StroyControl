import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

const app = createApp();

async function seedCompany() {
  return prisma.company.create({ data: { name: 'Test Company' } });
}

beforeEach(async () => {
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/objects', () => {
  it('requires x-company-id header', async () => {
    const res = await request(app).get('/api/objects');
    expect(res.status).toBe(401);
  });

  it('returns an empty list for a company with no objects', async () => {
    const company = await seedCompany();
    const res = await request(app).get('/api/objects').set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not leak objects from other companies', async () => {
    const companyA = await seedCompany();
    const companyB = await prisma.company.create({ data: { name: 'Other Company' } });
    await prisma.object.create({ data: { companyId: companyA.id, name: 'Object A' } });

    const res = await request(app).get('/api/objects').set('x-company-id', companyB.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/objects', () => {
  it('creates an object from a template with pre-populated stages and sections', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/objects')
      .set('x-company-id', company.id)
      .send({ name: 'ЖК Тест', address: 'г. Ташкент', latitude: 41.311081, longitude: 69.240562, templateCode: 'high_rise' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('ЖК Тест');
    expect(res.body.latitude).toBe(41.311081);
    expect(res.body.longitude).toBe(69.240562);
    expect(res.body.stages.length).toBe(3);
    expect(res.body.stages[0].sections.length).toBeGreaterThan(0);
  });

  it('rejects an empty name', async () => {
    const company = await seedCompany();
    const res = await request(app).post('/api/objects').set('x-company-id', company.id).send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects coordinates outside valid ranges', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .post('/api/objects')
      .set('x-company-id', company.id)
      .send({ name: 'Неверная точка', latitude: 91, longitude: 181 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});

describe('object progress and risk aggregation', () => {
  it('computes progress and overdue risk from task statuses', async () => {
    const company = await seedCompany();
    const created = await request(app)
      .post('/api/objects')
      .set('x-company-id', company.id)
      .send({ name: 'Объект с задачами', templateCode: 'typical_house' });

    const stageId = created.body.stages[0].id;
    const sectionRes = await request(app)
      .post(`/api/objects/stages/${stageId}/sections`)
      .set('x-company-id', company.id)
      .send({ name: 'Доп. раздел', sortOrder: 0 });
    const sectionId = sectionRes.body.id;

    await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Готовая задача', plannedEnd: new Date(Date.now() + 86400000).toISOString() });

    const overdueTaskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Просроченная задача', plannedEnd: new Date(Date.now() - 86400000).toISOString() });

    await request(app)
      .patch(`/api/tasks/${overdueTaskRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'done' });

    await request(app)
      .patch(`/api/tasks/${overdueTaskRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'open' });

    const list = await request(app).get('/api/objects').set('x-company-id', company.id);
    const object = list.body.find((o: { id: string }) => o.id === created.body.id);
    expect(object.riskLevel).toBe('overdue');
    expect(object.taskCount).toBe(2);
  });
});

describe('GET /api/objects/:id/gantt', () => {
  it('returns hierarchical stage/section/task data with computed risk', async () => {
    const company = await seedCompany();
    const created = await request(app)
      .post('/api/objects')
      .set('x-company-id', company.id)
      .send({ name: 'Объект для Ганта', templateCode: 'renovation' });

    const res = await request(app)
      .get(`/api/objects/${created.body.id}/gantt`)
      .set('x-company-id', company.id);

    expect(res.status).toBe(200);
    expect(res.body.objectId).toBe(created.body.id);
    expect(res.body.stages.length).toBe(3);
    expect(res.body.criticalPath).toEqual({ taskIds: [], durationDays: 0 });
    expect(res.body.forecast).toEqual({
      plannedCompletion: null,
      forecastCompletion: null,
      delayDays: 0,
      basis: 'current_schedule',
    });
  });

  it('returns 404 for an unknown object', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .get('/api/objects/00000000-0000-0000-0000-000000000099/gantt')
      .set('x-company-id', company.id);
    expect(res.status).toBe(404);
  });

  it('calculates the critical path and marks its tasks', async () => {
    const company = await seedCompany();
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Критический путь' } });
    const stage = await prisma.stage.create({ data: { objectId: object.id, name: 'Строительство' } });
    const section = await prisma.workSection.create({ data: { stageId: stage.id, name: 'Работы' } });
    const first = await prisma.task.create({ data: { workSectionId: section.id, title: 'A', plannedStart: new Date('2026-01-01'), plannedEnd: new Date('2026-01-04') } });
    const short = await prisma.task.create({ data: { workSectionId: section.id, title: 'B', plannedStart: new Date('2026-01-01'), plannedEnd: new Date('2026-01-02') } });
    const last = await prisma.task.create({ data: { workSectionId: section.id, title: 'C', plannedStart: new Date('2026-01-04'), plannedEnd: new Date('2026-01-06'), dependsOn: [first.id, short.id] } });

    const res = await request(app).get(`/api/objects/${object.id}/gantt`).set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body.criticalPath).toEqual({ taskIds: [first.id, last.id], durationDays: 5 });
    const tasks = res.body.stages[0].sections[0].tasks;
    expect(tasks.find((task: { id: string }) => task.id === first.id).isCritical).toBe(true);
    expect(tasks.find((task: { id: string }) => task.id === short.id).isCritical).toBe(false);
  });

  it('captures planned dates as a baseline', async () => {
    const company = await seedCompany();
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Baseline' } });
    const stage = await prisma.stage.create({ data: { objectId: object.id, name: 'Stage' } });
    const section = await prisma.workSection.create({ data: { stageId: stage.id, name: 'Section' } });
    const task = await prisma.task.create({ data: { workSectionId: section.id, title: 'Task', plannedStart: new Date('2026-02-01'), plannedEnd: new Date('2026-02-05') } });

    const res = await request(app).post(`/api/objects/${object.id}/baseline`).set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body.capturedTasks).toBe(1);
    const saved = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.baselineStart?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(saved.baselineEnd?.toISOString()).toBe('2026-02-05T00:00:00.000Z');
  });

  it('forecasts completion shift from the longest current delay', async () => {
    const company = await seedCompany();
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Forecast' } });
    const stage = await prisma.stage.create({ data: { objectId: object.id, name: 'Stage' } });
    const section = await prisma.workSection.create({ data: { stageId: stage.id, name: 'Section' } });
    const yesterday = new Date(Date.now() - 86_400_000);
    const completion = new Date(Date.now() + 5 * 86_400_000);
    await prisma.task.create({ data: { workSectionId: section.id, title: 'Delayed', plannedEnd: yesterday, status: 'in_progress' } });
    await prisma.task.create({ data: { workSectionId: section.id, title: 'Final', plannedEnd: completion, status: 'open' } });

    const res = await request(app).get(`/api/objects/${object.id}/gantt`).set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body.forecast.delayDays).toBeGreaterThanOrEqual(1);
    expect(new Date(res.body.forecast.forecastCompletion).getTime()).toBeGreaterThan(completion.getTime());
    expect(res.body.forecast.basis).toBe('current_overdue_tasks');
  });

  it('rejects dependencies from another object', async () => {
    const company = await seedCompany();
    const firstObject = await prisma.object.create({ data: { companyId: company.id, name: 'One' } });
    const firstStage = await prisma.stage.create({ data: { objectId: firstObject.id, name: 'Stage' } });
    const firstSection = await prisma.workSection.create({ data: { stageId: firstStage.id, name: 'Section' } });
    const foreignTask = await prisma.task.create({ data: { workSectionId: firstSection.id, title: 'Foreign' } });
    const secondObject = await prisma.object.create({ data: { companyId: company.id, name: 'Two' } });
    const secondStage = await prisma.stage.create({ data: { objectId: secondObject.id, name: 'Stage' } });
    const secondSection = await prisma.workSection.create({ data: { stageId: secondStage.id, name: 'Section' } });

    const res = await request(app).post(`/api/objects/sections/${secondSection.id}/tasks`).set('x-company-id', company.id).send({ title: 'Invalid', dependsOn: [foreignTask.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_dependencies');
  });
});
