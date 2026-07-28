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
      email: `pm-${Date.now()}-${Math.random()}@example.com`,
      fullName: 'Азиз Каримов',
      passwordHash: 'test',
    },
  });
  return { company, object, user };
}

beforeEach(async () => {
  await prisma.customerApproval.deleteMany({});
  await prisma.paymentSchedule.deleteMany({});
  await prisma.photoReport.deleteMany({});
  await prisma.documentVersion.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.workSection.deleteMany({});
  await prisma.stage.deleteMany({});
  await prisma.object.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Кабинет заказчика (customer-portal)', () => {
  it('returns an aggregated portal overview (gantt/progress, recent photos, documents)', async () => {
    const { company, object, user } = await seedCompanyWithObjectAndUser();

    await request(app)
      .post(`/api/objects/${object.id}/documents`)
      .set('x-company-id', company.id)
      .send({ title: 'Договор подряда №1', docType: 'contract', fileUrl: 'https://example.com/c.pdf', uploadedBy: user.id });

    await request(app)
      .post(`/api/objects/${object.id}/photo-reports`)
      .set('x-company-id', company.id)
      .send({ authorId: user.id, fileUrl: 'https://example.com/photo.jpg', kind: 'progress' });

    const res = await request(app).get(`/api/objects/${object.id}/customer-portal`).set('x-company-id', company.id);
    expect(res.status).toBe(200);
    expect(res.body.objectId).toBe(object.id);
    expect(res.body.gantt).toBeDefined();
    expect(res.body.gantt.stages).toEqual([]);
    expect(res.body.recentPhotoReports.length).toBe(1);
    expect(res.body.documents.length).toBe(1);
    expect(res.body.paymentsSummary).toEqual({ pendingCount: 0, overdueCount: 0, paidCount: 0 });
    expect(res.body.approvalsSummary).toEqual({ pendingCount: 0 });
  });

  it('returns 404 for the portal overview when the object belongs to another company', async () => {
    const { object } = await seedCompanyWithObjectAndUser();
    const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });

    const res = await request(app)
      .get(`/api/objects/${object.id}/customer-portal`)
      .set('x-company-id', otherCompany.id);
    expect(res.status).toBe(404);
  });

  describe('график оплат (payment schedule)', () => {
    it('creates, lists and marks a payment as paid', async () => {
      const { company, object } = await seedCompanyWithObjectAndUser();

      const createRes = await request(app)
        .post(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', company.id)
        .send({ description: 'Аванс на фундаментные работы', amount: 5000000, dueDate: '2026-08-15' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe('pending');

      const listRes = await request(app)
        .get(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', company.id);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].status).toBe('pending');

      const payRes = await request(app)
        .patch(`/api/payment-schedule/${createRes.body.id}/pay`)
        .set('x-company-id', company.id)
        .send({});
      expect(payRes.status).toBe(200);
      expect(payRes.body.status).toBe('paid');
      expect(payRes.body.paidAt).toBeTruthy();

      const listAfterPayRes = await request(app)
        .get(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', company.id);
      expect(listAfterPayRes.body[0].status).toBe('paid');
    });

    it('derives an "overdue" status for unpaid entries past their due date', async () => {
      const { company, object } = await seedCompanyWithObjectAndUser();
      await request(app)
        .post(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', company.id)
        .send({ description: 'Оплата за прошлый этап', amount: 1000000, dueDate: '2020-01-01' });

      const listRes = await request(app)
        .get(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', company.id);
      expect(listRes.status).toBe(200);
      expect(listRes.body[0].status).toBe('overdue');
    });

    it('does not allow creating or listing a payment schedule for another company\'s object', async () => {
      const { object } = await seedCompanyWithObjectAndUser();
      const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });

      const createRes = await request(app)
        .post(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', otherCompany.id)
        .send({ description: 'Чужой платёж', amount: 100, dueDate: '2026-09-01' });
      expect(createRes.status).toBe(404);

      const listRes = await request(app)
        .get(`/api/objects/${object.id}/payment-schedule`)
        .set('x-company-id', otherCompany.id);
      expect(listRes.status).toBe(404);
    });
  });

  describe('согласования и замечания заказчика (customer approvals)', () => {
    it('creates an approval request, lists it, and lets the customer approve it', async () => {
      const { company, object, user } = await seedCompanyWithObjectAndUser();

      const createRes = await request(app)
        .post(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', company.id)
        .send({ title: 'Согласование цвета фасада', comment: 'Выбрать оттенок из палитры', raisedBy: user.id });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe('pending');

      const listRes = await request(app)
        .get(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', company.id);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);

      const respondRes = await request(app)
        .patch(`/api/customer-approvals/${createRes.body.id}/respond`)
        .set('x-company-id', company.id)
        .send({ status: 'approved', respondedBy: user.id });
      expect(respondRes.status).toBe(200);
      expect(respondRes.body.status).toBe('approved');
      expect(respondRes.body.respondedById).toBe(user.id);
      expect(respondRes.body.respondedAt).toBeTruthy();

      const feed = await prisma.feedEvent.findMany({ where: { objectId: object.id } });
      expect(feed.length).toBe(1);
      expect(feed[0].kind).toBe('status_change');
      expect(feed[0].body).toContain('Согласование цвета фасада');
    });

    it('requires a comment when the customer requests changes', async () => {
      const { company, object, user } = await seedCompanyWithObjectAndUser();
      const createRes = await request(app)
        .post(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', company.id)
        .send({ title: 'Согласование сметы', raisedBy: user.id });

      const respondRes = await request(app)
        .patch(`/api/customer-approvals/${createRes.body.id}/respond`)
        .set('x-company-id', company.id)
        .send({ status: 'changes_requested', respondedBy: user.id });
      expect(respondRes.status).toBe(400);

      const respondWithCommentRes = await request(app)
        .patch(`/api/customer-approvals/${createRes.body.id}/respond`)
        .set('x-company-id', company.id)
        .send({ status: 'changes_requested', respondedBy: user.id, responseComment: 'Смету нужно пересчитать' });
      expect(respondWithCommentRes.status).toBe(200);
      expect(respondWithCommentRes.body.status).toBe('changes_requested');
    });

    it('can link an approval request to a specific task', async () => {
      const { company, object, user } = await seedCompanyWithObjectAndUser();
      const stage = await prisma.stage.create({ data: { objectId: object.id, name: 'Фундамент' } });
      const section = await prisma.workSection.create({ data: { stageId: stage.id, name: 'Земляные работы' } });
      const task = await prisma.task.create({ data: { workSectionId: section.id, title: 'Вырыть котлован' } });

      const createRes = await request(app)
        .post(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', company.id)
        .send({ title: 'Приёмка котлована', taskId: task.id, stageId: stage.id, raisedBy: user.id });
      expect(createRes.status).toBe(201);
      expect(createRes.body.taskId).toBe(task.id);
      expect(createRes.body.stageId).toBe(stage.id);
    });

    it('does not leak approvals across companies', async () => {
      const { object, user } = await seedCompanyWithObjectAndUser();
      const otherCompany = await prisma.company.create({ data: { name: 'Other Company' } });

      const createRes = await request(app)
        .post(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', otherCompany.id)
        .send({ title: 'Чужое согласование', raisedBy: user.id });
      expect(createRes.status).toBe(404);

      const listRes = await request(app)
        .get(`/api/objects/${object.id}/customer-approvals`)
        .set('x-company-id', otherCompany.id);
      expect(listRes.status).toBe(404);
    });
  });
});
