import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/crypto';
import { prisma } from '../src/db/prisma';

const app = createApp();
const password = 'StrongPassword123!';

beforeEach(async () => {
  await prisma.fileUpload.deleteMany({}); await prisma.idempotencyRecord.deleteMany({}); await prisma.session.deleteMany({});
  await prisma.userRole.deleteMany({}); await prisma.object.deleteMany({}); await prisma.user.deleteMany({}); await prisma.role.deleteMany({}); await prisma.company.deleteMany({});
});
afterAll(async () => prisma.$disconnect());

async function login(email: string) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200); return response.body.accessToken as string;
}

describe('first MVP milestone', () => {
  it('runs admin -> PM -> foreman offline sync -> inspector -> customer -> audit', async () => {
    const company = await prisma.company.create({ data: { name: 'E2E Construction' } });
    for (const [code, name] of [['admin', 'Администратор'], ['pm', 'Руководитель проекта'], ['foreman', 'Прораб'], ['inspector', 'Технадзор'], ['customer', 'Заказчик']] as const) await prisma.role.create({ data: { code, name } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
    await prisma.user.create({ data: { companyId: company.id, email: 'admin-e2e@example.com', fullName: 'E2E Admin', passwordHash: await hashPassword(password), roles: { create: { roleId: adminRole.id } } } });
    const target = await prisma.object.create({ data: { companyId: company.id, name: 'Target Object', stages: { create: { name: 'Каркас', sections: { create: { name: 'Колонны' } } } } }, include: { stages: { include: { sections: true } } } });
    await prisma.object.create({ data: { companyId: company.id, name: 'Hidden Object' } });
    const adminToken = await login('admin-e2e@example.com');
    const createUser = async (email: string, fullName: string, roleCode: string) => {
      const response = await request(app).post('/api/admin/users').set('authorization', `Bearer ${adminToken}`).send({ email, fullName, password, roleCode, objectId: target.id });
      expect(response.status).toBe(201); return response.body.id as string;
    };
    await createUser('pm-e2e@example.com', 'E2E PM', 'pm');
    const foremanId = await createUser('foreman-e2e@example.com', 'E2E Foreman', 'foreman');
    const inspectorId = await createUser('inspector-e2e@example.com', 'E2E Inspector', 'inspector');
    await createUser('customer-e2e@example.com', 'E2E Customer', 'customer');

    const pmToken = await login('pm-e2e@example.com');
    const sectionId = target.stages[0].sections[0].id;
    const created = await request(app).post(`/api/objects/sections/${sectionId}/tasks`).set('authorization', `Bearer ${pmToken}`).send({ title: 'Забетонировать колонну Д-4', assigneeId: foremanId, priority: 'high', plannedEnd: '2026-08-10', dependsOn: [] });
    expect(created.status).toBe(201); const taskId = created.body.id as string;

    const foremanToken = await login('foreman-e2e@example.com');
    const foremanBootstrap = await request(app).get('/api/mobile/bootstrap').set('authorization', `Bearer ${foremanToken}`);
    expect(foremanBootstrap.body.objects).toHaveLength(1);
    expect(foremanBootstrap.body.objects[0].tasks).toContainEqual(expect.objectContaining({ id: taskId, assignee: 'E2E Foreman' }));
    const photo = await request(app).post('/api/uploads').set('authorization', `Bearer ${foremanToken}`).set('idempotency-key', 'e2e-photo-1').set('x-task-id', taskId).set('content-type', 'image/jpeg').send(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(1020), Buffer.from([0xff, 0xd9])]));
    expect(photo.status).toBe(201);
    const reviewerAssignment = await request(app).post(`/api/tasks/${taskId}/reviewer`).set('authorization', `Bearer ${pmToken}`).send({ reviewerId: inspectorId });
    expect(reviewerAssignment.status).toBe(200);
    const submitted = await request(app).post(`/api/tasks/${taskId}/close`).set('authorization', `Bearer ${foremanToken}`).set('idempotency-key', 'e2e-close-1').send({ photoUrl: photo.body.url, geoLat: 41.3111, geoLng: 69.2797 });
    expect(submitted.body.status).toBe('review');
    const closeReplay = await request(app).post(`/api/tasks/${taskId}/close`).set('authorization', `Bearer ${foremanToken}`).set('idempotency-key', 'e2e-close-1').send({ photoUrl: photo.body.url, geoLat: 41.3111, geoLng: 69.2797 });
    expect(closeReplay.headers['idempotency-replayed']).toBe('true');


    const inspectorToken = await login('inspector-e2e@example.com');
    const inspectorBootstrap = await request(app).get('/api/mobile/bootstrap').set('authorization', `Bearer ${inspectorToken}`);
    expect(inspectorBootstrap.body.objects[0].tasks.map((task: { id: string }) => task.id)).toEqual([taskId]);
    const accepted = await request(app).post(`/api/tasks/${taskId}/review`).set('authorization', `Bearer ${inspectorToken}`).set('idempotency-key', 'e2e-accept-1').send({ decision: 'accepted', note: 'Соответствует проекту' });
    expect(accepted.body.status).toBe('done');

    const customerToken = await login('customer-e2e@example.com');
    const customerBootstrap = await request(app).get('/api/mobile/bootstrap').set('authorization', `Bearer ${customerToken}`);
    expect(customerBootstrap.body.objects.map((object: { name: string }) => object.name)).toEqual(['Target Object']);
    expect(customerBootstrap.body.objects[0].tasks[0]).toMatchObject({ id: taskId, status: 'done', reviewNote: 'Соответствует проекту' });

    const audit = await request(app).get(`/api/audit?entityType=task&entityId=${taskId}`).set('authorization', `Bearer ${pmToken}`);
    expect(audit.status).toBe(200);
    expect(audit.body.map((entry: { action: string }) => entry.action).sort()).toEqual(['task.accept', 'task.close', 'task.reviewer.assign']);
    expect(await prisma.feedEvent.count({ where: { objectId: target.id } })).toBe(3);
  });
});
