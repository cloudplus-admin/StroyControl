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
});
