import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TelegramNotifyService } from '../../telegram/telegram-notify.service';
import {
  TelegramStaffNotificationsService,
  type StaffNotifyActor,
  type StaffNotifySettings,
} from '../../telegram/staff-notifications.service';
import { TelegramStaffActorType } from '@prisma/client';

@Injectable()
export class PortalTelegramNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: TelegramNotifyService,
    private readonly staffNotify: TelegramStaffNotificationsService,
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

  async issueInvite(
    merchantId: string,
    options?: { forceNew?: boolean; staffId?: string | null },
  ) {
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
    const staffId = options?.staffId ? String(options.staffId) : null;
    const actorType = staffId
      ? TelegramStaffActorType.STAFF
      : TelegramStaffActorType.MERCHANT;
    if (!options?.forceNew) {
      invite = await prismaAny.telegramStaffInvite
        .findFirst({
          where: {
            merchantId,
            staffId: staffId ?? null,
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
          staffId: staffId ?? null,
          actorType,
        },
      });
    } else {
      const needsUpdate =
        (invite.staffId ?? null) !== (staffId ?? null) ||
        invite.actorType !== actorType ||
        (invite.expiresAt &&
          invite.expiresAt.getTime() < Date.now() + 5 * 24 * 60 * 60 * 1000);
      if (needsUpdate) {
        invite = await prismaAny.telegramStaffInvite.update({
          where: { id: invite.id },
          data: {
            staffId: staffId ?? null,
            actorType,
            expiresAt:
              invite.expiresAt &&
              invite.expiresAt.getTime() < Date.now() + 5 * 24 * 60 * 60 * 1000
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                : invite.expiresAt,
          },
        });
      }
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
      staffId: r.staffId ?? null,
      actorType: r.actorType ?? null,
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

  async getPreferences(
    merchantId: string,
    actor: StaffNotifyActor,
  ): Promise<StaffNotifySettings> {
    if (!merchantId) throw new BadRequestException('merchantId required');
    return this.staffNotify.getPreferences(merchantId, actor);
  }

  async updatePreferences(
    merchantId: string,
    actor: StaffNotifyActor,
    patch: Partial<StaffNotifySettings>,
  ): Promise<StaffNotifySettings> {
    if (!merchantId) throw new BadRequestException('merchantId required');
    return this.staffNotify.updatePreferences(merchantId, actor, patch);
  }
}
