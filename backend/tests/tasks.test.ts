import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

const app = createApp();

async function seedCompanyWithSection() {
  const company = await prisma.company.create({ data: { name: 'Test Company' } });
  const object = await prisma.object.create({
    data: {
      companyId: company.id,
      name: 'Тестовый объект',
      stages: { create: [{ name: 'Этап 1', sortOrder: 0, sections: { create: [{ name: 'Раздел 1', sortOrder: 0 }] } }] },
    },
    include: { stages: { include: { sections: true } } },
  });
  return { company, sectionId: object.stages[0].sections[0].id };
}

beforeEach(async () => {
  await prisma.object.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Task checklist and closure', () => {
  it('adds and toggles checklist items', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Обход ТБ' });

    const itemRes = await request(app)
      .post(`/api/tasks/${taskRes.body.id}/checklist`)
      .set('x-company-id', company.id)
      .send({ label: 'Проверить каски' });
    expect(itemRes.status).toBe(201);
    expect(itemRes.body.isDone).toBe(false);

    const toggleRes = await request(app)
      .patch(`/api/tasks/${taskRes.body.id}/checklist/${itemRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ isDone: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isDone).toBe(true);
  });

  it('rejects closing a task without photo and geotag', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Задача без фото' });

    const closeRes = await request(app)
      .post(`/api/tasks/${taskRes.body.id}/close`)
      .set('x-company-id', company.id)
      .send({});
    expect(closeRes.status).toBe(400);
  });

  it('closes a task with photo and geotag, marking it done', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Задача с площадки' });

    const closeRes = await request(app)
      .post(`/api/tasks/${taskRes.body.id}/close`)
      .set('x-company-id', company.id)
      .send({ photoUrl: 'https://example.com/photo.jpg', geoLat: 41.3, geoLng: 69.2 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('done');
    expect(closeRes.body.closurePhotoUrl).toBe('https://example.com/photo.jpg');
  });
});

describe('SLA sweep', () => {
  it('escalates tasks past their planned end to overdue', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const overdue = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Просроченная задача', plannedEnd: new Date(Date.now() - 86400000).toISOString() });

    const future = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Задача в будущем', plannedEnd: new Date(Date.now() + 86400000).toISOString() });

    const sweepRes = await request(app).post('/api/tasks/sla-sweep').set('x-company-id', company.id);
    expect(sweepRes.status).toBe(200);
    const escalatedIds = sweepRes.body.escalated.map((t: { id: string }) => t.id);
    expect(escalatedIds).toContain(overdue.body.id);
    expect(escalatedIds).not.toContain(future.body.id);

    const refreshed = await request(app).get(`/api/tasks/${overdue.body.id}`).set('x-company-id', company.id);
    expect(refreshed.body.status).toBe('overdue');
  });

  it('does not leak SLA sweep across companies', async () => {
    const { company: companyA, sectionId } = await seedCompanyWithSection();
    const companyB = await prisma.company.create({ data: { name: 'Other Company' } });
    await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', companyA.id)
      .send({ title: 'Просроченная задача A', plannedEnd: new Date(Date.now() - 86400000).toISOString() });

    const sweepRes = await request(app).post('/api/tasks/sla-sweep').set('x-company-id', companyB.id);
    expect(sweepRes.body.escalated).toEqual([]);
  });
});

describe('Recurring tasks', () => {
  it('creates a daily instance from a recurring template', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const template = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Ежедневный обход по ТБ' });

    await prisma.task.update({ where: { id: template.body.id }, data: { isRecurring: true, recurrenceRule: 'daily' } });

    const sweepRes = await request(app).post('/api/tasks/recurring-sweep').set('x-company-id', company.id);
    expect(sweepRes.status).toBe(200);
    expect(sweepRes.body.created.length).toBe(1);
    expect(sweepRes.body.created[0].parentTaskId).toBe(template.body.id);

    const secondSweep = await request(app).post('/api/tasks/recurring-sweep').set('x-company-id', company.id);
    expect(secondSweep.body.created.length).toBe(0);
  });
});
