import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const projects = [
  { key: 'p1', name: 'ЖК Bogishamol Riviera', address: 'Ташкент, Юнусабад', stage: 'Каркас' },
  { key: 'p2', name: 'БЦ Sergeli Business Park', address: 'Ташкент, Сергели', stage: 'Фундамент' },
  { key: 'p3', name: 'Школа №257', address: 'Ташкент, Яшнабад', stage: 'Фасад' },
  { key: 'p4', name: 'Дом Дурмень', address: 'Кибрайский район', stage: 'Общестроительные работы' },
] as const;

const tasks = [
  { key: 't-101', project: 'p1', title: 'Бетонирование колонн 8 этажа', due: '2026-08-01', priority: 'high', status: 'in_progress', checklist: [['Проверить опалубку', true], ['Принять армирование', false], ['Загрузить фото результата', false]] },
  { key: 't-102', project: 'p1', title: 'Ежедневный обход по ТБ', due: '2026-07-31', priority: 'normal', status: 'open', checklist: [['Проверить каски и СИЗ', false], ['Проверить ограждения', false]] },
  { key: 't-103', project: 'p2', title: 'Разметка осей первого этажа', due: '2026-08-04', priority: 'low', status: 'open', checklist: [['Сверить чертеж КЖ', false], ['Зафиксировать оси', false]] },
  { key: 't-104', project: 'p3', title: 'Монтаж окон спортзала', due: '2026-08-02', priority: 'high', status: 'review', checklist: [['Проверить уровень', true], ['Фото узлов примыкания', true]] },
] as const;

function id(kind: string, key: string) {
  const hex = createHash('sha256').update(`stroycontrol-apk-demo:${kind}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function ensureRole(userId: string, roleCode: string, objectId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const existing = await prisma.userRole.findFirst({ where: { userId, roleId: role.id, objectId } });
  if (!existing) await prisma.userRole.create({ data: { userId, roleId: role.id, objectId } });
}

async function main() {
  // Remove records created by the first pre-release importer that used non-UUID IDs.
  await prisma.object.deleteMany({ where: { id: { startsWith: 'apk-demo-object-' } } });
  const company = await prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
  const foreman = await prisma.user.findUniqueOrThrow({ where: { email: '111' } });
  const inspector = await prisma.user.findUniqueOrThrow({ where: { email: '222' } });
  const customer = await prisma.user.findUniqueOrThrow({ where: { email: '333' } });
  if ([foreman, inspector, customer].some((user) => user.companyId !== company.id)) throw new Error('Demo users belong to another company');

  const objectIds = new Map<string, string>();
  const taskIds = new Map<string, string>();
  for (const [index, project] of projects.entries()) {
    const object = await prisma.object.upsert({
      where: { id: id('object', project.key) },
      update: { name: project.name, address: project.address, status: 'active' },
      create: { id: id('object', project.key), companyId: company.id, name: project.name, address: project.address, status: 'active', templateCode: 'apk-demo' },
    });
    objectIds.set(project.key, object.id);
    const stage = await prisma.stage.upsert({
      where: { id: id('stage', project.key) },
      update: { name: project.stage, sortOrder: index },
      create: { id: id('stage', project.key), objectId: object.id, name: project.stage, sortOrder: index },
    });
    await prisma.workSection.upsert({
      where: { id: id('section', project.key) },
      update: { name: 'Работы по плану', sortOrder: 0 },
      create: { id: id('section', project.key), stageId: stage.id, name: 'Работы по плану', sortOrder: 0 },
    });
    await ensureRole(foreman.id, 'foreman', object.id);
    await ensureRole(inspector.id, 'inspector', object.id);
    await ensureRole(customer.id, 'customer', object.id);
  }

  for (const item of tasks) {
    const task = await prisma.task.upsert({
      where: { id: id('task', item.key) },
      update: { title: item.title, plannedEnd: new Date(`${item.due}T12:00:00Z`), priority: item.priority, status: item.status, assigneeId: foreman.id, reviewerId: inspector.id },
      create: { id: id('task', item.key), workSectionId: id('section', item.project), title: item.title, plannedEnd: new Date(`${item.due}T12:00:00Z`), priority: item.priority, status: item.status, assigneeId: foreman.id, reviewerId: inspector.id },
    });
    taskIds.set(item.key, task.id);
    for (const [index, [label, isDone]] of item.checklist.entries()) {
      await prisma.taskChecklistItem.upsert({ where: { id: id('check', `${item.key}-${index}`) }, update: { label, isDone }, create: { id: id('check', `${item.key}-${index}`), taskId: task.id, label, isDone } });
    }
  }

  const p1 = objectIds.get('p1')!;
  const p3 = objectIds.get('p3')!;
  await prisma.defect.upsert({ where: { id: id('defect', 'd-21') }, update: { description: 'Отклонение колонны по оси Д-4', status: 'open' }, create: { id: id('defect', 'd-21'), objectId: p1, taskId: taskIds.get('t-101'), reportedBy: inspector.id, description: 'Отклонение колонны по оси Д-4', status: 'open', createdAt: new Date('2026-07-31T08:00:00Z') } });
  await prisma.photoReport.upsert({ where: { id: id('photo', 'q-2') }, update: { status: 'review' }, create: { id: id('photo', 'q-2'), objectId: p3, taskId: taskIds.get('t-104'), authorId: foreman.id, shootingPoint: 'Спортзал - северный фасад', kind: 'progress', fileUrl: 'https://picsum.photos/800/500', requiredAngles: ['Общий план'], photos: [{ angle: 'Общий план', uri: 'https://picsum.photos/800/500' }], status: 'review', createdAt: new Date('2026-07-30T14:20:00Z') } });
  await prisma.feedEvent.upsert({ where: { id: id('feed', 'm-1') }, update: { body: 'Армирование колонн завершено. @Технадзор, можно принимать.' }, create: { id: id('feed', 'm-1'), objectId: p1, authorId: foreman.id, body: 'Армирование колонн завершено. @Технадзор, можно принимать.', kind: 'message', createdAt: new Date('2026-07-31T11:20:00Z') } });
  await prisma.feedEvent.upsert({ where: { id: id('feed', 'm-2') }, update: { body: 'Принял, буду на площадке в 15:00.' }, create: { id: id('feed', 'm-2'), objectId: p1, authorId: inspector.id, parentEventId: id('feed', 'm-1'), body: 'Принял, буду на площадке в 15:00.', kind: 'message', createdAt: new Date('2026-07-31T11:35:00Z') } });
  for (const [version, createdAt] of [[2, '2026-07-29T10:00:00Z'], [1, '2026-07-20T10:00:00Z']] as const) {
    await prisma.projectDocument.upsert({ where: { id: id('doc', `kj-08-v${version}`) }, update: { title: 'КЖ-08-Колонны.pdf', version }, create: { id: id('doc', `kj-08-v${version}`), companyId: company.id, objectId: p1, createdById: foreman.id, title: 'КЖ-08-Колонны.pdf', kind: 'drawing', version, fileUrl: `local://kj-08-v${version}`, status: 'published', createdAt: new Date(createdAt) } });
  }
  console.log(JSON.stringify({ projects: projects.length, tasks: tasks.length, users: [foreman.email, inspector.email, customer.email] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
