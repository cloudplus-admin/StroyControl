import { prisma } from '../../db/prisma';

type Sender = (url: string, init: RequestInit) => Promise<Response>;

export async function deliverPendingNotifications(sender: Sender = fetch, limit = 100) {
  const items = await prisma.notification.findMany({
    where: { deliveryStatus: { in: ['pending', 'failed'] }, deliveryAttempts: { lt: 5 } },
    include: { user: { select: { telegramChatId: true, pushToken: true } } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    const channels: Array<{ url: string; body: unknown }> = [];
    if (item.user.telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
      channels.push({
        url: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        body: { chat_id: item.user.telegramChatId, text: `${item.title}\n${item.body}` },
      });
    }
    if (item.user.pushToken) {
      channels.push({
        url: process.env.PUSH_API_URL ?? 'https://exp.host/--/api/v2/push/send',
        body: { to: item.user.pushToken, title: item.title, body: item.body, data: { kind: item.kind, entityType: item.entityType, entityId: item.entityId } },
      });
    }
    if (!channels.length) {
      await prisma.notification.update({ where: { id: item.id }, data: { deliveryStatus: 'skipped', deliveryError: 'No configured external channel' } });
      skipped += 1;
      continue;
    }
    try {
      for (const channel of channels) {
        const response = await sender(channel.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(channel.body) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
      await prisma.notification.update({ where: { id: item.id }, data: { deliveryStatus: 'delivered', deliveryAttempts: { increment: 1 }, deliveredAt: new Date(), deliveryError: null } });
      delivered += 1;
    } catch (error) {
      await prisma.notification.update({ where: { id: item.id }, data: { deliveryStatus: 'failed', deliveryAttempts: { increment: 1 }, deliveryError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown delivery error' } });
      failed += 1;
    }
  }
  return { processed: items.length, delivered, failed, skipped };
}
