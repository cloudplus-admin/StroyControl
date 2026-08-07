import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/auth/crypto';

const app = createApp();
async function fixture() {
  const company = await prisma.company.create({ data: { name: `Docs ${Date.now()}` } });
  for (const [code, name] of [['admin', 'Администратор'], ['customer', 'Заказчик']] as const) await prisma.role.upsert({ where: { code }, create: { code, name }, update: {} });
  const object = await prisma.object.create({ data: { companyId: company.id, name: 'Пилот' } });
  const makeUser = async (email: string, roleCode: string) => prisma.user.create({ data: { companyId: company.id, email, fullName: roleCode, passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: (await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })).id, objectId: roleCode === 'customer' ? object.id : null } } } });
  const admin = await makeUser(`admin-${Date.now()}@example.com`, 'admin');
  const customer = await makeUser(`customer-${Date.now()}@example.com`, 'customer');
  const login = async (email: string) => (await request(app).post('/api/auth/login').send({ email, password: 'StrongPassword123!' })).body.accessToken as string;
  return { object, adminToken: await login(admin.email), customerToken: await login(customer.email) };
}

describe('documents and customer portal', () => {
  it('lets management publish a document and customer approve it', async () => {
    const f = await fixture();
    const created = await request(app).post(`/api/objects/${f.object.id}/documents`).set('authorization', `Bearer ${f.adminToken}`).send({ title: 'Рабочий проект', kind: 'project', fileUrl: 'https://files.example/project.pdf' });
    expect(created.status).toBe(201); expect(created.body.status).toBe('review');
    const customerNotifications = await request(app).get('/api/notifications?unread=true').set('authorization', `Bearer ${f.customerToken}`);
    expect(customerNotifications.body).toMatchObject({ unread: 1 });
    expect(customerNotifications.body.items[0]).toMatchObject({ kind: 'document_review', entityId: created.body.id });
    const decision = await request(app).post(`/api/documents/${created.body.id}/decision`).set('authorization', `Bearer ${f.customerToken}`).send({ decision: 'approved', note: 'Согласовано' });
    expect(decision.status).toBe(200); expect(decision.body.status).toBe('approved');
    const repeated = await request(app).post(`/api/documents/${created.body.id}/decision`).set('authorization', `Bearer ${f.customerToken}`).send({ decision: 'rejected', note: 'Позднее решение' });
    expect(repeated.status).toBe(409); expect(repeated.body.error).toBe('invalid_state');
    const adminNotifications = await request(app).get('/api/notifications').set('authorization', `Bearer ${f.adminToken}`);
    expect(adminNotifications.body.items[0]).toMatchObject({ kind: 'document_decision', entityId: created.body.id });
    const read = await request(app).post('/api/notifications/read-all').set('authorization', `Bearer ${f.adminToken}`);
    expect(read.body.updated).toBe(1);
    const listed = await request(app).get(`/api/objects/${f.object.id}/documents`).set('authorization', `Bearer ${f.customerToken}`);
    expect(listed.body[0].approvals[0].decision).toBe('approved');
  });

  it('returns a stable 400 for malformed document input', async () => {
    const f = await fixture();
    const response = await request(app).post(`/api/objects/${f.object.id}/documents`).set('authorization', `Bearer ${f.adminToken}`).send({ title: '', kind: 'invalid', fileUrl: 'not-a-url' });
    expect(response.status).toBe(400); expect(response.body).toMatchObject({ error: 'validation_error' });
  });

  it('creates and signs an act while preventing customer creation', async () => {
    const f = await fixture();
    const forbidden = await request(app).post(`/api/objects/${f.object.id}/acts`).set('authorization', `Bearer ${f.customerToken}`).send({ template: 'completed', number: 'A-1', title: 'Работы', amount: 1500 });
    expect(forbidden.status).toBe(403);
    const created = await request(app).post(`/api/objects/${f.object.id}/acts`).set('authorization', `Bearer ${f.adminToken}`).send({ template: 'completed', number: `A-${Date.now()}`, title: 'Выполненные работы', amount: 1500 });
    const signed = await request(app).post(`/api/acts/${created.body.id}/sign`).set('authorization', `Bearer ${f.customerToken}`);
    expect(signed.status).toBe(200); expect(signed.body.status).toBe('signed');
    const repeated = await request(app).post(`/api/acts/${created.body.id}/sign`).set('authorization', `Bearer ${f.customerToken}`);
    expect(repeated.status).toBe(409); expect(repeated.body.error).toBe('invalid_state');
    const adminNotifications = await request(app).get('/api/notifications').set('authorization', `Bearer ${f.adminToken}`);
    expect(adminNotifications.body.items.some((item: { kind: string; entityId: string }) => item.kind === 'act_signed' && item.entityId === created.body.id)).toBe(true);
  });
});
