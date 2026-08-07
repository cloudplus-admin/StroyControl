import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/crypto';
import { prisma } from '../src/db/prisma';

const app = createApp();

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs" CASCADE');
  await prisma.session.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => prisma.$disconnect());

async function createAdmin() {
  const company = await prisma.company.create({ data: { name: 'Auth Company' } });
  const role = await prisma.role.create({ data: { code: 'admin', name: 'Администратор' } });
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email: 'admin@example.com',
      fullName: 'Admin',
      passwordHash: await hashPassword('StrongPassword123!'),
      roles: { create: { roleId: role.id } },
    },
  });
  return { company, user };
}

describe('auth', () => {
  it('logs in and derives company scope from the access token', async () => {
    const { company } = await createAdmin();
    await prisma.object.create({ data: { companyId: company.id, name: 'Protected object' } });

    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'StrongPassword123!',
    });
    expect(login.status).toBe(200);
    expect(login.body.user.roles).toEqual([{ code: 'admin', objectId: null }]);

    const objects = await request(app)
      .get('/api/objects')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .set('x-company-id', 'attacker-controlled-company');
    expect(objects.status).toBe(200);
    expect(objects.body).toHaveLength(1);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    await createAdmin();
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'StrongPassword123!',
    });
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(first.status).toBe(200);
    expect(reused.status).toBe(401);
  });

  it('rejects an invalid password', async () => {
    await createAdmin();
    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'WrongPassword123!',
    });
    expect(response.status).toBe(401);
  });

  it('returns JSON validation errors instead of dropping malformed auth requests', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'x', password: 'x' });
    expect(response.status).toBe(400); expect(response.body).toMatchObject({ error: 'validation_error' });
  });

  it('lets an admin create a scoped user and blocks non-admin access', async () => {
    const { company } = await createAdmin();
    await prisma.role.create({ data: { code: 'foreman', name: 'Прораб' } });
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Object A' } });
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'StrongPassword123!',
    });
    const created = await request(app)
      .post('/api/admin/users')
      .set('authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        email: 'foreman@example.com',
        fullName: 'Foreman',
        password: 'ForemanPassword123!',
        roleCode: 'foreman',
        objectId: object.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.roles[0]).toMatchObject({ objectId: object.id, role: { code: 'foreman' } });

    const foremanLogin = await request(app).post('/api/auth/login').send({
      email: 'foreman@example.com',
      password: 'ForemanPassword123!',
    });
    const forbidden = await request(app)
      .get('/api/admin/users')
      .set('authorization', `Bearer ${foremanLogin.body.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('writes an append-only audit entry for an authenticated task closure', async () => {
    const { company } = await createAdmin();
    const object = await prisma.object.create({
      data: {
        companyId: company.id,
        name: 'Audited object',
        stages: { create: { name: 'Stage', sections: { create: { name: 'Section' } } } },
      },
      include: { stages: { include: { sections: true } } },
    });
    const task = await prisma.task.create({
      data: { workSectionId: object.stages[0].sections[0].id, title: 'Audited task' },
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'StrongPassword123!',
    });
    const upload = await request(app)
      .post('/api/uploads')
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .set('idempotency-key', 'audited-photo-1')
      .set('x-task-id', task.id)
      .set('content-type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(upload.status).toBe(201);
    const closed = await request(app)
      .post(`/api/tasks/${task.id}/close`)
      .set('authorization', `Bearer ${login.body.accessToken}`)
      .set('idempotency-key', 'audited-close-1')
      .send({ photoUrl: upload.body.url, geoLat: 41.3, geoLng: 69.2 });
    expect(closed.status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: task.id } });
    expect(audit.action).toBe('task.close');
    const auditResponse = await request(app)
      .get(`/api/audit?entityType=task&entityId=${task.id}`)
      .set('authorization', `Bearer ${login.body.accessToken}`);
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body).toHaveLength(1);
    await expect(prisma.auditLog.update({ where: { id: audit.id }, data: { action: 'tampered' } })).rejects.toThrow();
  });

  it('lets an object-scoped inspector accept once and audits the decision', async () => {
    const { company } = await createAdmin();
    const inspectorRole = await prisma.role.create({ data: { code: 'inspector', name: 'Технадзор' } });
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Review object', stages: { create: { name: 'Stage', sections: { create: { name: 'Section' } } } } }, include: { stages: { include: { sections: true } } } });
    const task = await prisma.task.create({ data: { workSectionId: object.stages[0].sections[0].id, title: 'Review task', status: 'review' } });
    const inspector = await prisma.user.create({ data: { companyId: company.id, email: 'inspector@example.com', fullName: 'Inspector', passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: inspectorRole.id, objectId: object.id } } } });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'StrongPassword123!' });
    const assigned = await request(app).post(`/api/tasks/${task.id}/reviewer`).set('authorization', `Bearer ${adminLogin.body.accessToken}`).send({ reviewerId: inspector.id });
    expect(assigned.status).toBe(200); expect(assigned.body.reviewerId).toBe(inspector.id);
    const login = await request(app).post('/api/auth/login').send({ email: 'inspector@example.com', password: 'StrongPassword123!' });
    const endpoint = `/api/tasks/${task.id}/review`;
    const accepted = await request(app).post(endpoint).set('authorization', `Bearer ${login.body.accessToken}`).set('idempotency-key', 'accept-task-1').send({ decision: 'accepted', note: 'Работа соответствует проекту' });
    expect(accepted.status).toBe(200); expect(accepted.body.status).toBe('done');
    const replay = await request(app).post(endpoint).set('authorization', `Bearer ${login.body.accessToken}`).set('idempotency-key', 'accept-task-1').send({ decision: 'accepted', note: 'Работа соответствует проекту' });
    expect(replay.status).toBe(200); expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(await prisma.auditLog.count({ where: { entityId: task.id, action: 'task.accept' } })).toBe(1);
    const rejectedTask = await prisma.task.create({ data: { workSectionId: object.stages[0].sections[0].id, title: 'Rejected task', status: 'review', reviewerId: inspector.id } });
    const rejected = await request(app).post(`/api/tasks/${rejectedTask.id}/review`).set('authorization', `Bearer ${login.body.accessToken}`).set('idempotency-key', 'reject-task-by-inspector-1').send({ decision: 'rejected', note: 'Переделать армирование' });
    expect(rejected.status).toBe(200); expect(rejected.body).toMatchObject({ status: 'in_progress', reviewNote: 'Переделать армирование' });
    expect(await prisma.auditLog.count({ where: { entityId: rejectedTask.id, action: 'task.reject' } })).toBe(1);
  });

  it('requires a rejection note and blocks a foreman from review', async () => {
    const { company } = await createAdmin();
    const foremanRole = await prisma.role.create({ data: { code: 'foreman', name: 'Прораб' } });
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Forbidden review', stages: { create: { name: 'Stage', sections: { create: { name: 'Section' } } } } }, include: { stages: { include: { sections: true } } } });
    const task = await prisma.task.create({ data: { workSectionId: object.stages[0].sections[0].id, title: 'Review task', status: 'review' } });
    await prisma.user.create({ data: { companyId: company.id, email: 'foreman-review@example.com', fullName: 'Foreman', passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: foremanRole.id, objectId: object.id } } } });
    const login = await request(app).post('/api/auth/login').send({ email: 'foreman-review@example.com', password: 'StrongPassword123!' });
    const endpoint = `/api/tasks/${task.id}/review`;
    const noNote = await request(app).post(endpoint).set('authorization', `Bearer ${login.body.accessToken}`).set('idempotency-key', 'reject-no-note').send({ decision: 'rejected', note: '' });
    expect(noNote.status).toBe(400);
    const forbidden = await request(app).post(endpoint).set('authorization', `Bearer ${login.body.accessToken}`).set('idempotency-key', 'reject-task-1').send({ decision: 'rejected', note: 'Переделать узел' });
    expect(forbidden.status).toBe(403);
  });

  it('keeps object-scoped users out of other objects and tasks', async () => {
    const { company } = await createAdmin();
    const customerRole = await prisma.role.create({ data: { code: 'customer', name: 'Заказчик' } });
    const own = await prisma.object.create({ data: { companyId: company.id, name: 'Own object' } });
    const foreign = await prisma.object.create({ data: { companyId: company.id, name: 'Foreign object', stages: { create: { name: 'Stage', sections: { create: { name: 'Section' } } } } }, include: { stages: { include: { sections: true } } } });
    const foreignTask = await prisma.task.create({ data: { workSectionId: foreign.stages[0].sections[0].id, title: 'Foreign task' } });
    await prisma.user.create({ data: { companyId: company.id, email: 'scoped-customer@example.com', fullName: 'Scoped customer', passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: customerRole.id, objectId: own.id } } } });
    const login = await request(app).post('/api/auth/login').send({ email: 'scoped-customer@example.com', password: 'StrongPassword123!' });
    const authorization = `Bearer ${login.body.accessToken}`;
    const list = await request(app).get('/api/objects').set('authorization', authorization);
    expect(list.status).toBe(200); expect(list.body.map((item: { id: string }) => item.id)).toEqual([own.id]);
    expect((await request(app).get(`/api/objects/${foreign.id}`).set('authorization', authorization)).status).toBe(404);
    expect((await request(app).get(`/api/tasks/${foreignTask.id}`).set('authorization', authorization)).status).toBe(404);
    expect((await request(app).patch(`/api/tasks/${foreignTask.id}`).set('authorization', authorization).send({ title: 'Hacked' })).status).toBe(403);
  });
});
