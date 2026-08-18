import { beforeEach } from 'vitest';
import { prisma } from '../src/db/prisma';

beforeEach(async () => {
  // Audit is append-only in normal operation. Tests reset their isolated database
  // with TRUNCATE rather than weakening the production mutation trigger.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs" CASCADE');
});
