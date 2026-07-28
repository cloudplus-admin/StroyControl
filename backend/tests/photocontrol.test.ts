import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

const app = createApp();

async function seedCompanyWithObjectAndUser() {
  const company = await prisma.company.create({ data: { name: 'Test Company' } });
  const object = await prisma.object.create({ data: { companyId: company.id, name: 'Тестовый объект' } });
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email: `inspector-${Date.now()}@example.com`,
      fullName: 'Гуля Мирзаева',
      passwordHash: 'test',
    },
  });
  return { company, object, user };
}

beforeEach(async () => {
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Photo reports', () => {
  it('creates and lists photo reports for an object', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/1.jpg', shootingPoint: 'point-1', kind: 'progress' });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get(`/api/objects/${object.id}/photo-reports`).set('x-company-id', company.id);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
  });

  it('requires inspector signature for hidden_works photos', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const res = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/1.jpg', kind: 'hidden_works' });
    expect(res.status).toBe(400);
  });

  it('accepts hidden_works photos with a signature', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const res = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({
        authorId: user.id,
        fileUrl: 'https://example.com/1.jpg',
        kind: 'hidden_works',
        inspectorSignature: 'Г. Мирзаева',
      });
    expect(res.status).toBe(201);
  });

  it('builds a timeline for a shooting point sorted by date', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/before.jpg', shootingPoint: 'point-4', kind: 'before' });
    await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/after.jpg', shootingPoint: 'point-4', kind: 'after' });

    const timeline = await request(app)
      .get(`/api/objects/${object.id}/shooting-points/point-4/timeline`)
      .set('x-company-id', company.id);
    expect(timeline.status).toBe(200);
    expect(timeline.body.length).toBe(2);
    expect(timeline.body[0].kind).toBe('before');
    expect(timeline.body[1].kind).toBe('after');
  });

  it('does not leak photo reports across companies', async () => {
    const { object, user } = await seedCompanyWithObjectAndUser();
    const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });
    const res = await request(app).get(`/api/objects/${object.id}/photo-reports`).set('x-company-id', otherCompany.id);
    expect(res.status).toBe(404);
  });
});

describe('Defects (журнал замечаний)', () => {
  it('creates a defect and moves it through the status pipeline', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/defects`)
      .set('x-company-id', company.id)
      .send({ reportedBy: user.id, description: 'Отсутствие СИЗ у рабочих на 6 этаже' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('open');

    const updateRes = await request(app)
      .patch(`/api/defects/${createRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'in_progress' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('in_progress');

    const listRes = await request(app).get(`/api/objects/${object.id}/defects`).set('x-company-id', company.id);
    expect(listRes.body.length).toBe(1);
  });

  it('rejects an invalid status transition value', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/defects`)
      .set('x-company-id', company.id)
      .send({ reportedBy: user.id, description: 'Неровность кладки' });

    const updateRes = await request(app)
      .patch(`/api/defects/${createRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'not_a_real_status' });
    expect(updateRes.status).toBe(400);
  });
});
