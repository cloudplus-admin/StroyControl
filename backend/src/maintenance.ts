import { prisma } from './db/prisma';
import { runRecurringSweep, runSlaSweep } from './modules/tasks/service';

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let escalated = 0;
  let created = 0;
  for (const company of companies) {
    const overdueTasks = await runSlaSweep(company.id);
    const recurringTasks = await runRecurringSweep(company.id);
    escalated += overdueTasks.length;
    created += recurringTasks.length;
    console.log(JSON.stringify({ companyId: company.id, companyName: company.name, escalated: overdueTasks.length, created: recurringTasks.length }));
  }
  console.log(JSON.stringify({ status: 'ok', companies: companies.length, escalated, created }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
