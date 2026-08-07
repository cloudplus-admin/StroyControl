import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OBJECT_TEMPLATES } from '../src/modules/objects/templates';
import { hashPassword } from '../src/auth/crypto';

const prisma = new PrismaClient();

const ROLES = [
  { code: 'owner', name: 'Руководитель компании' },
  { code: 'pm', name: 'Руководитель проекта' },
  { code: 'foreman', name: 'Прораб' },
  { code: 'inspector', name: 'Технадзор' },
  { code: 'supplier', name: 'Снабженец' },
  { code: 'finance', name: 'Сметчик/финансист' },
  { code: 'customer', name: 'Заказчик' },
  { code: 'subcontractor', name: 'Субподрядчик' },
  { code: 'admin', name: 'Администратор' },
];

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }

  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', name: 'CloudPlus Demo' },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() ?? 'admin@stroycontrol.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminPassword) {
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash: await hashPassword(adminPassword) },
      create: {
        companyId: company.id,
        email: adminEmail,
        fullName: 'Администратор StroyControl',
        passwordHash: await hashPassword(adminPassword),
      },
    });
    const assignment = await prisma.userRole.findFirst({
      where: { userId: admin.id, roleId: adminRole.id, objectId: null },
    });
    if (!assignment) {
      await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    }
  } else {
    console.warn('SEED_ADMIN_PASSWORD is not set; admin user was not created.');
  }

  const existing = await prisma.object.findFirst({ where: { companyId: company.id, name: { contains: 'Тошкент Сити' } } });
  if (existing) {
    console.log('Demo object already exists, skipping.');
    return;
  }

  const template = OBJECT_TEMPLATES.high_rise;
  const object = await prisma.object.create({
    data: {
      companyId: company.id,
      name: 'ЖК «Тошкент Сити», корп. 2',
      address: 'г. Ташкент, Мирабадский р-н',
      templateCode: 'high_rise',
      stages: {
        create: template.map((stage, stageIndex) => ({
          name: stage.name,
          sortOrder: stageIndex,
          sections: { create: stage.sections.map((s, i) => ({ name: s.name, sortOrder: i })) },
        })),
      },
    },
    include: { stages: { include: { sections: true } } },
  });

  const [earthworks, frame] = object.stages;
  const [pit, foundation] = earthworks.sections;
  const [lowerFloors, upperFloors, walls] = frame.sections;

  await prisma.task.create({
    data: { workSectionId: pit.id, title: 'Разработка котлована', status: 'done', plannedStart: daysFromNow(-60), plannedEnd: daysFromNow(-46) },
  });
  const foundationTask = await prisma.task.create({
    data: { workSectionId: foundation.id, title: 'Устройство фундамента', status: 'done', plannedStart: daysFromNow(-45), plannedEnd: daysFromNow(-25) },
  });
  await prisma.task.create({
    data: {
      workSectionId: lowerFloors.id,
      title: 'Монолитные работы, 1-5 этаж',
      status: 'in_progress',
      plannedStart: daysFromNow(-24),
      plannedEnd: daysFromNow(3),
      dependsOn: [foundationTask.id],
    },
  });
  await prisma.task.create({
    data: {
      workSectionId: upperFloors.id,
      title: 'Монолитные работы, 6-10 этаж',
      status: 'open',
      plannedStart: daysFromNow(4),
      plannedEnd: daysFromNow(20),
    },
  });
  await prisma.task.create({
    data: {
      workSectionId: walls.id,
      title: 'Кладка наружных стен, ось А-Д',
      status: 'overdue',
      plannedStart: daysFromNow(-10),
      plannedEnd: daysFromNow(-3),
    },
  });

  console.log(`Seeded object ${object.id} with demo tasks.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
