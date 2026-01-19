import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TelegramNotifyService } from '../../telegram/telegram-notify.service';
import {
  TelegramStaffNotificationsService,
  type StaffNotifyActor,
  type StaffNotifySettings,
} from '../../telegram/staff-notifications.service';
import { STAFF_DIGEST_LOCAL_HOUR } from '../../telegram/staff-digest.constants';
import {
  TelegramStaffActorType,
  type TelegramStaffInvite,
} from '@prisma/client';

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
    return {
      configured,
      botUsername,
      botLink,
      digestHourLocal: STAFF_DIGEST_LOCAL_HOUR,
    } as const;
  }

  private genToken(): string {
    const raw = randomBytes(24).toString('base64');
    return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
    const now = new Date();
    let invite: TelegramStaffInvite | null = null;
    const staffId = options?.staffId ? String(options.staffId) : null;
    const actorType = staffId
      ? TelegramStaffActorType.STAFF
      : TelegramStaffActorType.MERCHANT;
    if (!options?.forceNew) {
      invite = await this.prisma.telegramStaffInvite
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
      invite = await this.prisma.telegramStaffInvite.create({
        data: {
          merchantId,
          token: this.genToken(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          staffId: staffId ?? null,
          actorType,
        },
      });
      await this.prisma.telegramStaffInvite
        .updateMany({
          where: {
            merchantId,
            staffId: staffId ?? null,
            id: { not: invite.id },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: { expiresAt: now },
        })
        .catch(() => null);
    } else {
      const needsUpdate =
        (invite.staffId ?? null) !== (staffId ?? null) ||
        invite.actorType !== actorType ||
        (invite.expiresAt &&
          invite.expiresAt.getTime() < Date.now() + 5 * 24 * 60 * 60 * 1000);
      if (needsUpdate) {
        invite = await this.prisma.telegramStaffInvite.update({
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
    const ownerStaff = await this.prisma.staff.findFirst({
      where: { merchantId, isOwner: true },
      select: {
        firstName: true,
        lastName: true,
        login: true,
        phone: true,
        email: true,
      },
    });
    const rows = await this.prisma.telegramStaffSubscriber.findMany({
      where: { merchantId, isActive: true },
      orderBy: { addedAt: 'desc' },
      include: {
        staff: {
          select: {
            firstName: true,
            lastName: true,
            login: true,
            phone: true,
            email: true,
          },
        },
      },
    });
    const buildStaffName = (
      staff: {
        firstName?: string | null;
        lastName?: string | null;
        login?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null,
    ) => {
      if (!staff) return null;
      const parts = [staff.firstName, staff.lastName]
        .filter(Boolean)
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      const fullName = parts.join(' ');
      return fullName || staff.login || staff.phone || staff.email || null;
    };
    return rows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      chatType: r.chatType,
      username: r.username ?? null,
      title: r.title ?? null,
      staffId: r.staffId ?? null,
      actorType: r.actorType ?? null,
      staffName: (() => {
        const fromStaff = buildStaffName(r.staff);
        if (fromStaff) return fromStaff;
        if (r.actorType === TelegramStaffActorType.MERCHANT) {
          return buildStaffName(ownerStaff);
        }
        return null;
      })(),
      addedAt: r.addedAt?.toISOString?.() || null,
      lastSeenAt: r.lastSeenAt?.toISOString?.() || null,
    }));
  }

  async deactivateSubscriber(merchantId: string, subscriberId: string) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!subscriberId) throw new BadRequestException('subscriberId required');
    const existing = await this.prisma.telegramStaffSubscriber
      .findUnique({ where: { id: subscriberId } })
      .catch(() => null);
    if (!existing || existing.merchantId !== merchantId)
      throw new NotFoundException('subscriber not found');
    await this.prisma.telegramStaffSubscriber.update({
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
