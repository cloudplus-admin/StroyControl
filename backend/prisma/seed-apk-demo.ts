import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const testUsers = [
  { email: '111', roleCode: 'foreman' },
  { email: '222', roleCode: 'inspector' },
  { email: '333', roleCode: 'customer' },
] as const;

async function ensureRole(userId: string, roleId: string, objectId: string) {
  const existing = await prisma.userRole.findFirst({ where: { userId, roleId, objectId } });
  if (!existing) await prisma.userRole.create({ data: { userId, roleId, objectId } });
}

async function main() {
  // The mobile app and the web client already read the same stage API. The old
  // importer duplicated source-code demo cards instead of exposing real API data.
  const removed = await prisma.object.deleteMany({
    where: { companyId: COMPANY_ID, templateCode: 'apk-demo' },
  });

  const objects = await prisma.object.findMany({
    where: { companyId: COMPANY_ID, templateCode: { not: 'apk-demo' } },
    select: { id: true, name: true },
  });

  for (const item of testUsers) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: item.email } });
    if (user.companyId !== COMPANY_ID) throw new Error(`${item.email} belongs to another company`);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: item.roleCode } });
    for (const object of objects) await ensureRole(user.id, role.id, object.id);
  }

  console.log(JSON.stringify({ removedWrongObjects: removed.count, objects: objects.map(({ name }) => name), users: testUsers.map(({ email }) => email) }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
