import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TelegramNotifyService } from '../../telegram/telegram-notify.service';

@Injectable()
export class PortalTelegramNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: TelegramNotifyService,
  ) {}

  async getState(merchantId: string) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const botInfo = await this.notify.getBotInfo();
    const configured = this.notify.isConfigured() && !!botInfo?.username;
    const botUsername = botInfo?.username
      ? botInfo.username.startsWith('@')
        ? botInfo.username
        : `@${botInfo.username}`
      : null;
    const botLink = botInfo?.username
      ? `https://t.me/${botInfo.username}`
      : null;
    return { configured, botUsername, botLink } as const;
  }

  private genToken(): string {
    const rand =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return rand.slice(0, 32);
  }

  async issueInvite(merchantId: string, forceNew?: boolean) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const botInfo = await this.notify.getBotInfo();
    if (!botInfo?.username)
      throw new BadRequestException(
        'Бот уведомлений не настроен (см. админ-панель)',
      );
    const username = botInfo.username;

    // Try reuse last non-expired invite created within last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const prismaAny = this.prisma as any;
    let invite = null as any;
    if (!forceNew) {
      invite = await prismaAny.telegramStaffInvite
        .findFirst({
          where: {
            merchantId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            createdAt: { gte: sevenDaysAgo },
          },
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => null);
    }

    if (!invite) {
      invite = await prismaAny.telegramStaffInvite.create({
        data: {
          merchantId,
          token: this.genToken(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const startUrl = `https://t.me/${username}?start=${invite.token}`;
    const startGroupUrl = `https://t.me/${username}?startgroup=${invite.token}`;
    return { ok: true, startUrl, startGroupUrl, token: invite.token } as const;
  }

  async listSubscribers(merchantId: string) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const prismaAny = this.prisma as any;
    const rows = await prismaAny.telegramStaffSubscriber.findMany({
      where: { merchantId, isActive: true },
      orderBy: { addedAt: 'desc' },
    });
    return rows.map((r: any) => ({
      id: r.id,
      chatId: r.chatId,
      chatType: r.chatType,
      username: r.username ?? null,
      title: r.title ?? null,
      addedAt: r.addedAt?.toISOString?.() || null,
      lastSeenAt: r.lastSeenAt?.toISOString?.() || null,
    }));
  }

  async deactivateSubscriber(merchantId: string, subscriberId: string) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!subscriberId) throw new BadRequestException('subscriberId required');
    const prismaAny = this.prisma as any;
    const existing = await prismaAny.telegramStaffSubscriber
      .findUnique({ where: { id: subscriberId } })
      .catch(() => null);
    if (!existing || existing.merchantId !== merchantId)
      throw new NotFoundException('subscriber not found');
    await prismaAny.telegramStaffSubscriber.update({
      where: { id: subscriberId },
      data: { isActive: false },
    });
    return { ok: true } as const;
  }
}
