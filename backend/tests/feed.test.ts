import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

const app = createApp();

async function seedCompanyWithObjectAndUsers() {
  const company = await prisma.company.create({ data: { name: 'Test Company' } });
  const object = await prisma.object.create({ data: { companyId: company.id, name: 'Тестовый объект' } });
  const author = await prisma.user.create({
    data: { companyId: company.id, email: `pm-${Date.now()}@example.com`, fullName: 'Рустам Бек', passwordHash: 'x' },
  });
  const other = await prisma.user.create({
    data: { companyId: company.id, email: `foreman-${Date.now()}@example.com`, fullName: 'Азиз Каримов', passwordHash: 'x' },
  });
  return { company, object, author, other };
}

beforeEach(async () => {
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Feed messages', () => {
  it('creates and lists messages with mentions', async () => {
    const { company, object, author, other } = await seedCompanyWithObjectAndUsers();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Прошу согласовать переход к следующему этапу', mentionedUserIds: [other.id] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.mentionedUserIds).toEqual([other.id]);

    const listRes = await request(app).get(`/api/objects/${object.id}/feed`).set('x-company-id', company.id);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
  });

  it('supports threaded replies', async () => {
    const { company, object, author } = await seedCompanyWithObjectAndUsers();
    const root = await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Когда фотоотчёт по фасаду?' });

    const reply = await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Завтра утром', parentEventId: root.body.id });
    expect(reply.status).toBe(201);

    const listRes = await request(app).get(`/api/objects/${object.id}/feed`).set('x-company-id', company.id);
    const rootEvent = listRes.body.find((e: { id: string }) => e.id === root.body.id);
    expect(rootEvent.replies.length).toBe(1);
  });

  it('does not leak feed events across companies', async () => {
    const { object } = await seedCompanyWithObjectAndUsers();
    const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });
    const res = await request(app).get(`/api/objects/${object.id}/feed`).set('x-company-id', otherCompany.id);
    expect(res.status).toBe(404);
  });
});

describe('Reactions', () => {
  it('adds and removes a reaction', async () => {
    const { company, object, author } = await seedCompanyWithObjectAndUsers();
    const msg = await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Готово!' });

    const reactRes = await request(app)
      .put(`/api/feed/${msg.body.id}/reactions`)
      .set('x-company-id', company.id)
      .send({ userId: author.id, emoji: '👍' });
    expect(reactRes.status).toBe(200);

    const removeRes = await request(app)
      .delete(`/api/feed/${msg.body.id}/reactions/${author.id}`)
      .set('x-company-id', company.id);
    expect(removeRes.status).toBe(204);
  });
});

describe('Search', () => {
  it('finds messages by substring', async () => {
    const { company, object, author } = await seedCompanyWithObjectAndUsers();
    await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Акт скрытых работ подписан' });
    await request(app)
      .post(`/api/objects/${object.id}/feed`)
      .set('x-company-id', company.id)
      .send({ authorId: author.id, body: 'Обсуждаем фасад' });

    const res = await request(app)
      .get(`/api/objects/${object.id}/feed/search`)
      .query({ q: 'акт' })
      .set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('Cross-module system events', () => {
  it('emits a feed event when a defect status changes', async () => {
    const { company, object, author } = await seedCompanyWithObjectAndUsers();
    const defect = await request(app)
      .post(`/api/objects/${object.id}/defects`)
      .set('x-company-id', company.id)
      .send({ reportedBy: author.id, description: 'Неровность кладки' });

    await request(app)
      .patch(`/api/defects/${defect.body.id}`)
      .set('x-company-id', company.id)
      .send({ status: 'verified' });

    const feedRes = await request(app).get(`/api/objects/${object.id}/feed`).set('x-company-id', company.id);
    const systemEvent = feedRes.body.find((e: { kind: string }) => e.kind === 'status_change');
    expect(systemEvent).toBeTruthy();
    expect(systemEvent.body).toContain('Неровность кладки');
  });
});
