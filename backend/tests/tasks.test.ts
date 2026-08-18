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
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Task checklist and closure', () => {
  it('edits planning fields and clears a deadline', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app).post(`/api/objects/sections/${sectionId}/tasks`).set('x-company-id', company.id)
      .send({ title: 'Исходная задача', plannedEnd: '2026-08-20' });
    const assignee = await prisma.user.create({ data: { companyId: company.id, email: 'worker@example.com', passwordHash: 'hash', fullName: 'Рабочий' } });
    const updated = await request(app).patch(`/api/tasks/${taskRes.body.id}`).set('x-company-id', company.id)
      .send({ title: 'Обновленная задача', description: 'Проверить по чертежу', priority: 'high', assigneeId: assignee.id, plannedEnd: null });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ title: 'Обновленная задача', description: 'Проверить по чертежу', priority: 'high', assigneeId: assignee.id, plannedEnd: null });
  });

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

  it('submits a task with multiple photos and geotag for review', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const reviewer = await prisma.user.create({ data: { companyId: company.id, email: 'reviewer@example.com', passwordHash: 'hash', fullName: 'Проверяющий' } });
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Задача с площадки' });
    await prisma.task.update({ where: { id: taskRes.body.id }, data: { reviewerId: reviewer.id } });

    const closeRes = await request(app)
      .post(`/api/tasks/${taskRes.body.id}/close`)
      .set('x-company-id', company.id)
      .set('idempotency-key', 'close-task-from-site-1')
      .send({ photoUrls: ['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg'], geoLat: 41.3, geoLng: 69.2 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('review');
    expect(closeRes.body.closurePhotoUrl).toBe('https://example.com/photo-1.jpg');
    expect(closeRes.body.closurePhotos).toEqual(['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg']);
  });

  it('completes a task immediately when no reviewer is assigned', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app).post(`/api/objects/sections/${sectionId}/tasks`).set('x-company-id', company.id).send({ title: 'Без приемки' });
    const closeRes = await request(app).post(`/api/tasks/${taskRes.body.id}/close`).set('x-company-id', company.id).set('idempotency-key', 'close-without-reviewer').send({ photoUrl: 'https://example.com/done.jpg', geoLat: 41.3, geoLng: 69.2 });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('done');
    expect(closeRes.body.closedAt).toBeTruthy();
  });

  it('replays the same offline close operation without duplicate side effects', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Офлайн-задача' });
    const payload = { photoUrl: 'https://example.com/offline.jpg', geoLat: 41.31, geoLng: 69.21 };
    const sendClose = () => request(app)
      .post(`/api/tasks/${taskRes.body.id}/close`)
      .set('x-company-id', company.id)
      .set('idempotency-key', 'device-operation-123')
      .send(payload);

    const first = await sendClose();
    const replay = await sendClose();
    expect(first.status).toBe(200);
    expect(first.headers['idempotency-replayed']).toBe('false');
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.id).toBe(first.body.id);
    expect(await prisma.idempotencyRecord.count()).toBe(1);
    expect(await prisma.feedEvent.count({ where: { body: { contains: 'Офлайн-задача' } } })).toBe(1);
  });

  it('rejects reuse of an idempotency key with different data', async () => {
    const { company, sectionId } = await seedCompanyWithSection();
    const taskRes = await request(app)
      .post(`/api/objects/sections/${sectionId}/tasks`)
      .set('x-company-id', company.id)
      .send({ title: 'Конфликт ключа' });
    const endpoint = `/api/tasks/${taskRes.body.id}/close`;
    await request(app).post(endpoint).set('x-company-id', company.id).set('idempotency-key', 'same-key')
      .send({ photoUrl: 'https://example.com/a.jpg', geoLat: 41.3, geoLng: 69.2 });
    const conflict = await request(app).post(endpoint).set('x-company-id', company.id).set('idempotency-key', 'same-key')
      .send({ photoUrl: 'https://example.com/b.jpg', geoLat: 41.4, geoLng: 69.3 });
    expect(conflict.status).toBe(409);
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
