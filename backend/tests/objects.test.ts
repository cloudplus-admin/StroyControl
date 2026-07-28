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
      .send({ name: 'ЖК Тест', address: 'г. Ташкент', templateCode: 'high_rise' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('ЖК Тест');
    expect(res.body.stages.length).toBe(3);
    expect(res.body.stages[0].sections.length).toBeGreaterThan(0);
  });

  it('rejects an empty name', async () => {
    const company = await seedCompany();
    const res = await request(app).post('/api/objects').set('x-company-id', company.id).send({ name: '' });
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
  });

  it('returns 404 for an unknown object', async () => {
    const company = await seedCompany();
    const res = await request(app)
      .get('/api/objects/00000000-0000-0000-0000-000000000099/gantt')
      .set('x-company-id', company.id);
    expect(res.status).toBe(404);
  });
});
