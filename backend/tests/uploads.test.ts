import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/crypto';
import { prisma } from '../src/db/prisma';

const app = createApp();

async function loginCompany(email: string, companyName: string) {
  const company = await prisma.company.create({ data: { name: companyName } });
  const role = await prisma.role.upsert({ where: { code: 'foreman' }, update: {}, create: { code: 'foreman', name: 'Прораб' } });
  await prisma.user.create({ data: { companyId: company.id, email, fullName: email, passwordHash: await hashPassword('StrongPassword123!'), roles: { create: { roleId: role.id } } } });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'StrongPassword123!' });
  return { company, token: login.body.accessToken as string };
}

beforeEach(async () => {
  await prisma.fileUpload.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.company.deleteMany({});
});
afterAll(async () => prisma.$disconnect());

describe('uploads', () => {
  it('reports database and upload storage health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', checks: { database: { status: 'ok' }, storage: { status: 'ok' } } });
  });

  it('uploads and reads an authenticated company image', async () => {
    const { token, company } = await loginCompany('photo@example.com', 'Photo Company');
    const object = await prisma.object.create({ data: { companyId: company.id, name: 'Photo object', stages: { create: { name: 'Stage', sections: { create: { name: 'Section' } } } } }, include: { stages: { include: { sections: true } } } });
    const task = await prisma.task.create({ data: { workSectionId: object.stages[0].sections[0].id, title: 'Photo task' } });
    const image = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(1020), Buffer.from([0xff, 0xd9])]);
    const uploaded = await request(app).post('/api/uploads').set('authorization', `Bearer ${token}`).set('idempotency-key', 'photo-1').set('x-task-id', task.id).set('content-type', 'image/jpeg').set('x-file-name', 'closure.jpg').send(image);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: 1024 });
    const fetched = await request(app).get(new URL(uploaded.body.url).pathname).set('authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toContain('image/jpeg');
    const replayed = await request(app).post('/api/uploads').set('authorization', `Bearer ${token}`).set('idempotency-key', 'photo-1').set('x-task-id', task.id).set('content-type', 'image/jpeg').send(image);
    expect(replayed.status).toBe(200);
    expect(replayed.body.id).toBe(uploaded.body.id);
    expect(await prisma.fileUpload.count()).toBe(1);
    const closed = await request(app).post(`/api/tasks/${task.id}/close`).set('authorization', `Bearer ${token}`).set('idempotency-key', 'close-with-photo-1').send({ photoUrl: uploaded.body.url, geoLat: 41.3, geoLng: 69.2 });
    expect(closed.status).toBe(200);
    const closeReplay = await request(app).post(`/api/tasks/${task.id}/close`).set('authorization', `Bearer ${token}`).set('idempotency-key', 'close-with-photo-1').send({ photoUrl: uploaded.body.url, geoLat: 41.3, geoLng: 69.2 });
    expect(closeReplay.status).toBe(200);
    expect(closeReplay.headers['idempotency-replayed']).toBe('true');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).closurePhotoUrl).toBe(uploaded.body.url);
  });

  it('isolates files between companies and rejects unsupported content', async () => {
    const first = await loginCompany('first@example.com', 'First');
    const second = await loginCompany('second@example.com', 'Second');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1016)]);
    const uploaded = await request(app).post('/api/uploads').set('authorization', `Bearer ${first.token}`).set('idempotency-key', 'photo-2').set('content-type', 'image/png').send(png);
    const forbidden = await request(app).get(new URL(uploaded.body.url).pathname).set('authorization', `Bearer ${second.token}`);
    expect(forbidden.status).toBe(404);
    const unsupported = await request(app).post('/api/uploads').set('authorization', `Bearer ${first.token}`).set('idempotency-key', 'photo-3').set('content-type', 'text/plain').send('not image');
    expect(unsupported.status).toBe(415);
    const spoofed = await request(app).post('/api/uploads').set('authorization', `Bearer ${first.token}`).set('idempotency-key', 'photo-spoof').set('content-type', 'image/jpeg').send(Buffer.from('not-a-jpeg'));
    expect(spoofed.status).toBe(415);
    const emptyJpeg = await request(app).post('/api/uploads').set('authorization', `Bearer ${first.token}`).set('idempotency-key', 'photo-empty').set('content-type', 'image/jpeg').send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(emptyJpeg.status).toBe(422);
  });

  it('stores a real PDF for documents and acts and rejects a spoofed PDF', async () => {
    const { token } = await loginCompany('pdf@example.com', 'PDF Company');
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    const uploaded = await request(app).post('/api/uploads').set('authorization', `Bearer ${token}`).set('idempotency-key', 'pdf-1').set('content-type', 'application/pdf').set('x-file-name', 'act.pdf').send(pdf);
    expect(uploaded.status).toBe(201); expect(uploaded.body).toMatchObject({ mimeType: 'application/pdf', sizeBytes: pdf.length });
    const fetched = await request(app).get(new URL(uploaded.body.url).pathname).set('authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200); expect(fetched.headers['content-type']).toContain('application/pdf');
    const spoofed = await request(app).post('/api/uploads').set('authorization', `Bearer ${token}`).set('idempotency-key', 'pdf-spoof').set('content-type', 'application/pdf').send(Buffer.from('not-pdf'));
    expect(spoofed.status).toBe(415);
  });
});
