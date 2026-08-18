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
      .send({ authorId: user.id, fileUrl: 'https://example.com/1.jpg', shootingPoint: 'point-1', kind: 'progress', requiredAngles: ['overview'], photos: [{ angle: 'overview', uri: 'https://example.com/1.jpg' }] });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get(`/api/objects/${object.id}/photo-reports`).set('x-company-id', company.id);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
  });

  it('accepts hidden_works photos without a signature', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const res = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/1.jpg', kind: 'hidden_works', requiredAngles: ['overview'], photos: [{ angle: 'overview', uri: 'https://example.com/1.jpg' }] });
    expect(res.status).toBe(201);
  });

  it('stores a multi-angle mobile report and inspector decision', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/front.jpg', shootingPoint: 'axis-a', kind: 'hidden_works', status: 'review', requiredAngles: ['front', 'side'], photos: [{ angle: 'front', uri: 'https://example.com/front.jpg' }, { angle: 'side', uri: 'https://example.com/side.jpg' }] });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({ status: 'review', requiredAngles: ['front', 'side'] });
    const reviewRes = await request(app)
      .post(`/api/photo-reports/${createRes.body.id}/review`)
      .set('x-company-id', company.id)
      .send({ decision: 'accepted', note: 'ok' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body).toMatchObject({ status: 'accepted', inspectorNote: 'ok' });
    expect(reviewRes.body.inspectorSignature).toBeNull();
  });

  it('builds a timeline for a shooting point sorted by date', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/before.jpg', shootingPoint: 'point-4', kind: 'before', requiredAngles: ['overview'], photos: [{ angle: 'overview', uri: 'https://example.com/before.jpg' }] });
    await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/after.jpg', shootingPoint: 'point-4', kind: 'after', requiredAngles: ['overview'], photos: [{ angle: 'overview', uri: 'https://example.com/after.jpg' }] });

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
      .send({ reportedBy: user.id, assignedToId: user.id, description: 'Отсутствие СИЗ у рабочих на 6 этаже', beforePhotos: ['https://example.com/before.jpg'] });
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
      .send({ reportedBy: user.id, assignedToId: user.id, description: 'Неровность кладки', beforePhotos: ['https://example.com/before.jpg'] });

    const updateRes = await request(app)
      .patch(`/api/defects/${createRes.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'not_a_real_status' });
    expect(updateRes.status).toBe(400);
  });

  it('requires complete angles and defect before/after evidence', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const incomplete = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/front.jpg', requiredAngles: ['front', 'side'], photos: [{ angle: 'front', uri: 'https://example.com/front.jpg' }] });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error).toBe('incomplete_angles');

    const emptyAngles = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/front.jpg', requiredAngles: [], photos: [] });
    expect(emptyAngles.status).toBe(400);

    const noBefore = await request(app)
      .post(`/api/objects/${object.id}/defects`)
      .set('x-company-id', company.id)
      .send({ reportedBy: user.id, assignedToId: user.id, description: 'Дефект без фото' });
    expect(noBefore.status).toBe(400);

    const created = await request(app)
      .post(`/api/objects/${object.id}/defects`)
      .set('x-company-id', company.id)
      .send({ reportedBy: user.id, assignedToId: user.id, description: 'Трещина', beforePhotos: ['https://example.com/before.jpg'] });
    const skipped = await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'review' });
    expect(skipped.status).toBe(409);
    await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'in_progress' }).expect(200);
    const withoutAfter = await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'review' });
    expect(withoutAfter.status).toBe(422);
    const verified = await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'review', afterPhotos: ['https://example.com/after.jpg'] });
    expect(verified.status).toBe(200);
    const closed = await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'closed' });
    expect(closed.body.resolvedAt).toBeTruthy();
  });

  it('requires a comment when a reviewer rejects a defect', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const created = await request(app).post(`/api/objects/${object.id}/defects`).set('x-company-id', company.id)
      .send({ reportedBy: user.id, assignedToId: user.id, description: 'Скол бетона', beforePhotos: ['https://example.com/before.jpg'] });
    await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'in_progress' }).expect(200);
    await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'review', afterPhotos: ['https://example.com/after.jpg'] }).expect(200);
    await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'in_progress' }).expect(422);
    const rejected = await request(app).patch(`/api/defects/${created.body.id}`).set('x-company-id', company.id).send({ status: 'in_progress', note: 'Переделать кромку' }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'in_progress', reviewNote: 'Переделать кромку' });
  });
});
