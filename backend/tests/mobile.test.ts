import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/crypto';
import { prisma } from '../src/db/prisma';

const app = createApp();
beforeEach(async () => {
  await prisma.session.deleteMany({}); await prisma.userRole.deleteMany({}); await prisma.object.deleteMany({});
  await prisma.user.deleteMany({}); await prisma.role.deleteMany({}); await prisma.company.deleteMany({});
});
afterAll(async () => prisma.$disconnect());

describe('mobile bootstrap', () => {
  it('returns a task to an inspector assigned as its executor without requiring a reviewer', async () => {
    const company = await prisma.company.create({ data: { name: 'Inspector tasks' } });
    const inspectorRole = await prisma.role.create({ data: { code: 'inspector', name: 'Технадзор' } });
    const object = await prisma.object.create({
      data: {
        companyId: company.id,
        name: 'Объект',
        stages: { create: { name: 'Этап', sections: { create: { name: 'Раздел' } } } },
      },
      include: { stages: { include: { sections: true } } },
    });
    const inspector = await prisma.user.create({
      data: {
        companyId: company.id,
        email: 'inspector-assignee@example.com',
        fullName: 'Тестовый технадзор',
        passwordHash: await hashPassword('StrongPassword123!'),
        roles: { create: { roleId: inspectorRole.id, objectId: object.id } },
      },
    });
    const task = await prisma.task.create({
      data: {
        workSectionId: object.stages[0].sections[0].id,
        title: 'Задача исполнителя',
        assigneeId: inspector.id,
      },
    });

    const login = await request(app).post('/api/auth/login').send({ email: inspector.email, password: 'StrongPassword123!' });
    const response = await request(app).get('/api/mobile/bootstrap').set('authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.objects[0].tasks).toEqual([
      expect.objectContaining({ id: task.id, assigneeId: inspector.id, reviewerId: null }),
    ]);
  });

  it('returns only object-scoped data and maps tasks for APK', async () => {
    const company = await prisma.company.create({ data: { name: 'Mobile' } });
    const role = await prisma.role.create({ data: { code: 'foreman', name: 'Прораб' } });
    const createObject = (name: string) => prisma.object.create({ data: { companyId: company.id, name, nameUz: `${name} UZ`, address: 'Адрес RU', addressUz: 'Manzil UZ', stages: { create: { name: 'Каркас', nameUz: 'Karkas', sections: { create: { name: 'Колонны', nameUz: 'Ustunlar', tasks: { create: { title: `${name} task`, titleUz: `${name} vazifa`, priority: 'high', plannedEnd: new Date('2026-08-10') } } } } } } }, include: { stages: { include: { sections: { include: { tasks: true } } } } } });
    const allowed = await createObject('Allowed'); await createObject('Hidden');
    const user = await prisma.user.create({ data: { companyId: company.id, email: 'mobile@example.com', fullName: 'Mobile User', passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: role.id, objectId: allowed.id } } } });
    expect(user.id).toBeTruthy();
    await prisma.feedEvent.create({ data: { objectId: allowed.id, authorId: user.id, body: 'Mobile feed event' } });
    await prisma.photoReport.create({ data: { objectId: allowed.id, authorId: user.id, shootingPoint: 'Axis A', fileUrl: 'https://cdn.test/photo.jpg' } });
    await prisma.defect.create({ data: { objectId: allowed.id, reportedBy: user.id, description: 'Mobile defect' } });
    const login = await request(app).post('/api/auth/login').send({ email: 'mobile@example.com', password: 'StrongPassword123!' });
    const response = await request(app).get('/api/mobile/bootstrap').set('authorization', `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.objects).toHaveLength(1);
    expect(response.body.objects[0]).toMatchObject({ id: allowed.id, name: 'Allowed', tasks: [{ title: 'Allowed task', stage: 'Каркас', section: 'Колонны', priority: 'high' }], feed: [{ body: 'Mobile feed event', author: 'Mobile User' }], photoReports: [{ point: 'Axis A', fileUrl: 'https://cdn.test/photo.jpg' }], defects: [{ description: 'Mobile defect', status: 'open' }] });
    const uz = await request(app).get('/api/mobile/bootstrap?locale=uz').set('authorization', `Bearer ${login.body.accessToken}`);
    expect(uz.body.objects[0]).toMatchObject({ id: allowed.id, name: 'Allowed UZ', address: 'Manzil UZ', tasks: [{ title: 'Allowed vazifa', stage: 'Karkas', section: 'Ustunlar' }] });
  });

  it('persists offline module records idempotently and returns them in bootstrap', async () => {
    const company = await prisma.company.create({ data: { name: 'Offline modules' } });
    const role = await prisma.role.create({ data: { code: 'foreman', name: 'Прораб' } });
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Объект' } });
    const user = await prisma.user.create({ data: { companyId: company.id, email: 'offline@example.com', fullName: 'Прораб', passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: role.id, objectId: object.id } } } });
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'StrongPassword123!' });
    const authorization = `Bearer ${login.body.accessToken}`;

    const supply = (status: 'draft' | 'ordered') => ({ objectId: object.id, payload: { id: 'sr-offline-1', projectId: object.id, item: 'Цемент', quantity: '20 т', neededAt: '2026-08-20', author: 'Прораб', status, createdAt: '2026-08-18T12:00:00.000Z' } });
    const first = await request(app).put('/api/mobile/records/supply/sr-offline-1').set('authorization', authorization).send(supply('draft'));
    const second = await request(app).put('/api/mobile/records/supply/sr-offline-1').set('authorization', authorization).send(supply('ordered'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.mobileRecord.count()).toBe(1);

    const bootstrap = await request(app).get('/api/mobile/bootstrap').set('authorization', authorization);
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.mobileRecords).toEqual([expect.objectContaining({ id: 'sr-offline-1', kind: 'supply', objectId: object.id, payload: expect.objectContaining({ status: 'ordered' }) })]);
  });

  it('enforces role, object scope and tenant ownership for offline module records', async () => {
    const company = await prisma.company.create({ data: { name: 'Scoped company' } });
    const otherCompany = await prisma.company.create({ data: { name: 'Other company' } });
    const foremanRole = await prisma.role.create({ data: { code: 'foreman', name: 'Прораб' } });
    const customerRole = await prisma.role.create({ data: { code: 'customer', name: 'Заказчик' } });
    const allowed = await prisma.object.create({ data: { companyId: company.id, name: 'Allowed' } });
    const denied = await prisma.object.create({ data: { companyId: company.id, name: 'Denied' } });
    const foreign = await prisma.object.create({ data: { companyId: otherCompany.id, name: 'Foreign' } });
    const passwordHash = await hashPassword('StrongPassword123!');
    const foreman = await prisma.user.create({ data: { companyId: company.id, email: 'scoped-foreman@example.com', fullName: 'Прораб', passwordHash, roles: { create: { roleId: foremanRole.id, objectId: allowed.id } } } });
    const customer = await prisma.user.create({ data: { companyId: company.id, email: 'scoped-customer@example.com', fullName: 'Заказчик', passwordHash, roles: { create: { roleId: customerRole.id, objectId: allowed.id } } } });
    const login = async (email: string) => (await request(app).post('/api/auth/login').send({ email, password: 'StrongPassword123!' })).body.accessToken as string;
    const foremanAuth = `Bearer ${await login(foreman.email)}`;
    const customerAuth = `Bearer ${await login(customer.email)}`;
    const payload = (id: string, projectId: string) => ({ objectId: projectId, payload: { id, projectId, author: 'Прораб', text: 'Запись', createdAt: '2026-08-18T12:00:00.000Z', lang: 'ru' } });

    expect((await request(app).put('/api/mobile/records/journal/allowed').set('authorization', foremanAuth).send(payload('allowed', allowed.id))).status).toBe(200);
    expect((await request(app).put('/api/mobile/records/journal/denied').set('authorization', foremanAuth).send(payload('denied', denied.id))).status).toBe(403);
    expect((await request(app).put('/api/mobile/records/journal/foreign').set('authorization', foremanAuth).send(payload('foreign', foreign.id))).status).toBe(403);
    expect((await request(app).put('/api/mobile/records/journal/customer').set('authorization', customerAuth).send(payload('customer', allowed.id))).status).toBe(403);
    expect(await prisma.mobileRecord.count()).toBe(1);
  });
});
