import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db/prisma';
import { deliverPendingNotifications } from '../src/modules/notifications/delivery';

beforeEach(async () => {
  await prisma.notification.deleteMany({});
});
afterAll(async () => prisma.$disconnect());

describe('external notification delivery', () => {
  it('delivers Telegram and push and marks the outbox item', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const company = await prisma.company.create({ data: { name: 'Delivery' } });
    const user = await prisma.user.create({ data: { companyId: company.id, email: `delivery-${company.id}@example.com`, fullName: 'Delivery', passwordHash: 'x', telegramChatId: '123', pushToken: 'ExponentPushToken[test]' } });
    const item = await prisma.notification.create({ data: { companyId: company.id, userId: user.id, kind: 'test', title: 'Заголовок', body: 'Текст' } });
    const sender = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await deliverPendingNotifications(sender)).toMatchObject({ delivered: 1, failed: 0 });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(await prisma.notification.findUnique({ where: { id: item.id } })).toMatchObject({ deliveryStatus: 'delivered', deliveryAttempts: 1 });
    delete process.env.TELEGRAM_BOT_TOKEN;
  });
});
