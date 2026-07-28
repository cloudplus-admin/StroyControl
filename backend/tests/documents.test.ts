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
      email: `pm-${Date.now()}@example.com`,
      fullName: 'Азиз Каримов',
      passwordHash: 'test',
    },
  });
  return { company, object, user };
}

beforeEach(async () => {
  await prisma.photoReport.deleteMany({});
  await prisma.documentVersion.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Documents (документооборот)', () => {
  it('creates a document with its first version and lists it for an object', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/documents`)
      .set('x-company-id', company.id)
      .send({
        title: 'Договор подряда №12',
        docType: 'contract',
        fileUrl: 'https://example.com/docs/contract-v1.pdf',
        uploadedBy: user.id,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.versions.length).toBe(1);
    expect(createRes.body.versions[0].versionNo).toBe(1);

    const listRes = await request(app).get(`/api/objects/${object.id}/documents`).set('x-company-id', company.id);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].title).toBe('Договор подряда №12');
  });

  it('uploads a new version and preserves version history', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/documents`)
      .set('x-company-id', company.id)
      .send({
        title: 'Смета на фундаментные работы',
        docType: 'estimate',
        fileUrl: 'https://example.com/docs/estimate-v1.pdf',
        uploadedBy: user.id,
      });
    const documentId = createRes.body.id;

    const versionRes = await request(app)
      .post(`/api/documents/${documentId}/versions`)
      .set('x-company-id', company.id)
      .send({ fileUrl: 'https://example.com/docs/estimate-v2.pdf', uploadedBy: user.id });
    expect(versionRes.status).toBe(201);
    expect(versionRes.body.versionNo).toBe(2);

    const getRes = await request(app).get(`/api/documents/${documentId}`).set('x-company-id', company.id);
    expect(getRes.status).toBe(200);
    expect(getRes.body.versions.length).toBe(2);
    // последняя версия первая (сортировка по убыванию номера версии)
    expect(getRes.body.versions[0].versionNo).toBe(2);
    expect(getRes.body.versions[1].versionNo).toBe(1);
    expect(getRes.body.versions.every((v: { uploadedById: string }) => v.uploadedById === user.id)).toBe(true);
  });

  it('does not leak documents across companies', async () => {
    const { object, user } = await seedCompanyWithObjectAndUser();
    const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });
    const createRes = await request(app)
      .post(`/api/objects/${object.id}/documents`)
      .set('x-company-id', otherCompany.id)
      .send({
        title: 'Чужой договор',
        docType: 'contract',
        fileUrl: 'https://example.com/docs/x.pdf',
        uploadedBy: user.id,
      });
    expect(createRes.status).toBe(404);

    const listRes = await request(app).get(`/api/objects/${object.id}/documents`).set('x-company-id', otherCompany.id);
    expect(listRes.status).toBe(404);
  });

  it('links an existing photocontrol report to an act document', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const docRes = await request(app)
      .post(`/api/objects/${object.id}/documents`)
      .set('x-company-id', company.id)
      .send({
        title: 'Акт КС-2 №4',
        docType: 'act',
        templateCode: 'КС-2',
        fileUrl: 'https://example.com/docs/act-4.pdf',
        uploadedBy: user.id,
      });
    expect(docRes.status).toBe(201);

    const photoRes = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/photo-1.jpg', kind: 'after' });
    expect(photoRes.status).toBe(201);
    expect(photoRes.body.documentId).toBeNull();

    const linkRes = await request(app)
      .patch(`/api/photo-reports/${photoRes.body.id}/link-document`)
      .set('x-company-id', company.id)
      .send({ documentId: docRes.body.id });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.documentId).toBe(docRes.body.id);
  });

  it('returns 404 when linking a photo report to a document from another object', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();
    const otherObject = await prisma.object.create({ data: { companyId: company.id, name: 'Другой объект' } });
    const docRes = await request(app)
      .post(`/api/objects/${otherObject.id}/documents`)
      .set('x-company-id', company.id)
      .send({ title: 'Акт по другому объекту', docType: 'act', fileUrl: 'https://example.com/act.pdf', uploadedBy: user.id });

    const photoRes = await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/photo-2.jpg', kind: 'after' });

    const linkRes = await request(app)
      .patch(`/api/photo-reports/${photoRes.body.id}/link-document`)
      .set('x-company-id', company.id)
      .send({ documentId: docRes.body.id });
    expect(linkRes.status).toBe(404);
  });
});
