import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TelegramNotifyService } from './telegram-notify.service';
import {
  TelegramStaffActorType,
  type TelegramStaffSubscriber,
} from '@prisma/client';

export type StaffNotifySettings = {
  notifyOrders: boolean;
  notifyReviews: boolean;
  notifyDailyDigest: boolean;
  notifyFraud: boolean;
};

export type StaffNotifyActor =
  | { kind: 'MERCHANT' }
  | { kind: 'STAFF'; staffId: string };

export type StaffNotificationPayload =
  | {
      kind: 'ORDER';
      receiptId: string;
      holdId?: string | null;
      at?: string;
    }
  | {
      kind: 'REVIEW';
      reviewId: string;
      at?: string;
    }
  | {
      kind: 'DIGEST';
      date: string; // ISO date (YYYY-MM-DD or ISO string)
    }
  | {
      kind: 'FRAUD';
      checkId?: string | null;
      reason: string;
      level?: string | null;
      scope?: string | null;
      customerId?: string | null;
      outletId?: string | null;
      staffId?: string | null;
      operation?: string | null;
      amount?: number | null;
      count?: number | null;
      limit?: number | null;
      at?: string;
    };

type PreferencesMap = Record<string, StaffNotifySettings>;

type Recipient = {
  subscriberId: string;
  chatId: string;
  actorKey: string;
};

@Injectable()
export class TelegramStaffNotificationsService {
  private readonly logger = new Logger(TelegramStaffNotificationsService.name);

  private readonly defaults: StaffNotifySettings = {
    notifyOrders: true,
    notifyReviews: true,
    notifyDailyDigest: true,
    notifyFraud: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramNotifyService))
    private readonly telegram: TelegramNotifyService,
  ) {}

  private normalizeSettings(
    source?: Partial<StaffNotifySettings> | null,
  ): StaffNotifySettings {
    if (!source || typeof source !== 'object') {
      return { ...this.defaults };
    }
    return {
      notifyOrders: this.toBool(
        source.notifyOrders,
        this.defaults.notifyOrders,
      ),
      notifyReviews: this.toBool(
        source.notifyReviews,
        this.defaults.notifyReviews,
      ),
      notifyDailyDigest: this.toBool(
        source.notifyDailyDigest,
        this.defaults.notifyDailyDigest,
      ),
      notifyFraud: this.toBool(source.notifyFraud, this.defaults.notifyFraud),
    };
  }

  private toBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lowered = value.toLowerCase();
      if (lowered === 'true' || lowered === '1' || lowered === 'yes')
        return true;
      if (lowered === 'false' || lowered === '0' || lowered === 'no')
        return false;
    }
    return fallback;
  }

  private actorKey(actor: StaffNotifyActor): string {
    if (actor.kind === 'STAFF') {
      return `staff:${actor.staffId}`;
    }
    return 'merchant';
  }

  private actorKeyFromSubscriber(sub: {
    staffId: string | null;
    actorType: TelegramStaffActorType;
    chatType: string;
  }): string {
    if (sub.actorType === TelegramStaffActorType.GROUP) return 'group';
    if (sub.actorType === TelegramStaffActorType.MERCHANT) return 'merchant';
    if (sub.staffId) return `staff:${sub.staffId}`;
    if (sub.chatType && sub.chatType.includes('group')) return 'group';
    return 'merchant';
  }

  private async loadPreferencesMap(
    merchantId: string,
  ): Promise<PreferencesMap> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const raw = settings?.rulesJson;
    let rules: Record<string, any> = {};
    if (Array.isArray(raw)) {
      rules = { rules: raw };
    } else if (raw && typeof raw === 'object') {
      rules = { ...(raw as Record<string, any>) };
    }
    const notify = rules.staffNotify;
    const map: PreferencesMap = {};
    if (notify && typeof notify === 'object') {
      for (const key of Object.keys(notify)) {
        map[key] = this.normalizeSettings(notify[key]);
      }
    }
    return map;
  }

  private async savePreferencesMap(
    merchantId: string,
    map: PreferencesMap,
  ): Promise<void> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const raw = settings?.rulesJson;
    let rules: Record<string, any> = {};
    if (Array.isArray(raw)) {
      rules = { rules: raw };
    } else if (raw && typeof raw === 'object') {
      rules = { ...(raw as Record<string, any>) };
    }
    const nextNotify: Record<string, StaffNotifySettings> = {};
    for (const key of Object.keys(map)) {
      nextNotify[key] = map[key];
    }
    rules.staffNotify = nextNotify;
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      create: { merchantId, rulesJson: rules },
      update: { rulesJson: rules },
    });
  }

  async getPreferences(
    merchantId: string,
    actor: StaffNotifyActor,
  ): Promise<StaffNotifySettings> {
    const map = await this.loadPreferencesMap(merchantId);
    const key = this.actorKey(actor);
    return map[key] ?? { ...this.defaults };
  }

  async updatePreferences(
    merchantId: string,
    actor: StaffNotifyActor,
    patch: Partial<StaffNotifySettings>,
  ): Promise<StaffNotifySettings> {
    const map = await this.loadPreferencesMap(merchantId);
    const key = this.actorKey(actor);
    const current = map[key] ?? this.defaults;
    const next: StaffNotifySettings = {
      notifyOrders: this.toBool(
        patch.notifyOrders,
        current.notifyOrders ?? this.defaults.notifyOrders,
      ),
      notifyReviews: this.toBool(
        patch.notifyReviews,
        current.notifyReviews ?? this.defaults.notifyReviews,
      ),
      notifyDailyDigest: this.toBool(
        patch.notifyDailyDigest,
        current.notifyDailyDigest ?? this.defaults.notifyDailyDigest,
      ),
      notifyFraud: this.toBool(
        patch.notifyFraud,
        current.notifyFraud ?? this.defaults.notifyFraud,
      ),
    };
    map[key] = next;
    await this.savePreferencesMap(merchantId, map);
    return next;
  }

  async listSubscribers(merchantId: string) {
    return this.prisma.telegramStaffSubscriber.findMany({
      where: { merchantId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async enqueueEvent(
    merchantId: string,
    payload: StaffNotificationPayload,
  ): Promise<void> {
    try {
      const at =
        'at' in payload && (payload as any).at
          ? (payload as any).at
          : undefined;
      await this.prisma.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'notify.staff.telegram',
          payload: { ...payload, at: at ?? new Date().toISOString() },
        },
      });
    } catch (error) {
      this.logger.error(
        `enqueueEvent failed (${payload.kind}) for merchant=${merchantId}: ${error}`,
      );
    }
  }

  async dispatch(
    merchantId: string,
    payload: StaffNotificationPayload,
  ): Promise<{ delivered: number }> {
    const flag = this.flagForPayload(payload.kind);
    if (!flag) return { delivered: 0 };
    const recipients = await this.resolveRecipients(merchantId, payload.kind);
    if (!recipients.length) return { delivered: 0 };
    const text = await this.buildMessage(merchantId, payload);
    if (!text) return { delivered: 0 };

    let delivered = 0;
    for (const recipient of recipients) {
      try {
        await this.telegram.sendStaffMessage(recipient.chatId, text);
        delivered += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to send ${payload.kind} notification to ${recipient.chatId}: ${error}`,
        );
      }
    }
    if (delivered > 0) {
      try {
        await this.prisma.telegramStaffSubscriber.updateMany({
          where: { id: { in: recipients.map((r) => r.subscriberId) } },
          data: { lastSeenAt: new Date() },
        });
      } catch {}
    }
    return { delivered };
  }

  private flagForPayload(
    kind: StaffNotificationPayload['kind'],
  ): keyof StaffNotifySettings | null {
    switch (kind) {
      case 'ORDER':
        return 'notifyOrders';
      case 'REVIEW':
        return 'notifyReviews';
      case 'DIGEST':
        return 'notifyDailyDigest';
      case 'FRAUD':
        return 'notifyFraud';
      default:
        return null;
    }
  }

  private async resolveRecipients(
    merchantId: string,
    kind: StaffNotificationPayload['kind'],
  ): Promise<Recipient[]> {
    const subscribers = await this.prisma.telegramStaffSubscriber.findMany({
      where: { merchantId, isActive: true },
      select: {
        id: true,
        chatId: true,
        chatType: true,
        staffId: true,
        actorType: true,
      },
    });

    if (!subscribers.length) return [];
    const prefs = await this.loadPreferencesMap(merchantId);
    const flag = this.flagForPayload(kind);
    if (!flag) return [];

    const result: Recipient[] = [];
    for (const sub of subscribers) {
      const actorKey = this.actorKeyFromSubscriber(sub);
      const settings =
        prefs[actorKey] ??
        prefs['merchant'] ??
        (actorKey === 'group' && prefs['merchant']
          ? prefs['merchant']
          : this.defaults);
      if (settings[flag]) {
        result.push({
          subscriberId: sub.id,
          chatId: sub.chatId,
          actorKey,
        });
      }
    }
    return result;
  }

  private async buildMessage(
    merchantId: string,
    payload: StaffNotificationPayload,
  ): Promise<string | null> {
    switch (payload.kind) {
      case 'ORDER':
        return this.buildOrderMessage(merchantId, payload.receiptId);
      case 'REVIEW':
        return this.buildReviewMessage(merchantId, payload.reviewId);
      case 'DIGEST':
        return this.buildDigestMessage(merchantId, payload.date);
      case 'FRAUD':
        return this.buildFraudMessage(merchantId, payload);
      default:
        return null;
    }
  }

  private async buildOrderMessage(
    merchantId: string,
    receiptId: string,
  ): Promise<string | null> {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, merchantId },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        outlet: { select: { name: true } },
        staff: { select: { firstName: true, lastName: true, login: true } },
      },
    });
    if (!receipt) return null;
    const lines: string[] = ['🛍 Новый заказ'];
    const total = this.formatCurrency(receipt.total);
    lines.push(`Сумма: ${total}`);
    if (receipt.earnApplied > 0) {
      lines.push(`Начислено баллов: ${receipt.earnApplied}`);
    }
    if (receipt.redeemApplied > 0) {
      lines.push(`Списано баллов: ${receipt.redeemApplied}`);
    }
    if (receipt.receiptNumber) {
      lines.push(`Чек № ${receipt.receiptNumber}`);
    } else if (receipt.orderId) {
      lines.push(`Заказ ${receipt.orderId}`);
    }
    if (receipt.outlet?.name) {
      lines.push(`Точка: ${receipt.outlet.name}`);
    }
    if (receipt.staff) {
      const nameParts = [
        receipt.staff.firstName,
        receipt.staff.lastName,
      ].filter(Boolean);
      const staffName =
        nameParts.length > 0
          ? nameParts.join(' ')
          : (receipt.staff.login ?? '');
      if (staffName) {
        lines.push(`Оформил: ${staffName}`);
      }
    }
    if (receipt.customer) {
      const customerName =
        receipt.customer.name ||
        receipt.customer.phone ||
        `ID ${receipt.customer.id.slice(0, 8)}`;
      if (customerName) {
        lines.push(`Клиент: ${customerName}`);
      }
    }
    const when = this.formatDateTime(receipt.createdAt);
    lines.push(`Время: ${when}`);
    return lines.join('\n');
  }

  private async buildReviewMessage(
    merchantId: string,
    reviewId: string,
  ): Promise<string | null> {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, merchantId },
      include: {
        customer: { select: { name: true, phone: true, id: true } },
        transaction: {
          select: {
            orderId: true,
            amount: true,
            createdAt: true,
            outlet: { select: { name: true } },
          },
        },
      },
    });
    if (!review) return null;
    const lines: string[] = ['⭐️ Новый отзыв'];
    lines.push(`Оценка: ${review.rating.toFixed(1)}`);
    if (review.transaction?.orderId) {
      lines.push(`Заказ: ${review.transaction.orderId}`);
    }
    if (review.transaction?.outlet?.name) {
      lines.push(`Точка: ${review.transaction.outlet.name}`);
    }
    const customerName =
      review.customer?.name ||
      review.customer?.phone ||
      (review.customer ? `ID ${review.customer.id.slice(0, 8)}` : null);
    if (customerName) {
      lines.push(`Клиент: ${customerName}`);
    }
    if (review.comment) {
      lines.push('');
      lines.push(review.comment.trim());
    }
    const when = this.formatDateTime(review.createdAt);
    lines.push('');
    lines.push(`Время: ${when}`);
    return lines.join('\n');
  }

  private async buildDigestMessage(
    merchantId: string,
    isoDate: string,
  ): Promise<string | null> {
    if (!isoDate) return null;
    const target = this.parseDateOnly(isoDate);
    if (!target) return null;
    const stat = await this.prisma.merchantKpiDaily.findUnique({
      where: {
        merchantId_date: {
          merchantId,
          date: target,
        },
      },
    });
    if (!stat) return null;
    const lines: string[] = [
      `📊 Ежедневная сводка (${this.formatDate(target)})`,
      `Заказы: ${stat.transactionCount} на ${this.formatCurrency(stat.revenue)}`,
      `Новые клиенты: ${stat.newCustomers}`,
      `Начислено баллов: ${stat.pointsIssued}`,
      `Списано баллов: ${stat.pointsRedeemed}`,
    ];
    return lines.join('\n');
  }

  private async buildFraudMessage(
    merchantId: string,
    payload: Extract<StaffNotificationPayload, { kind: 'FRAUD' }>,
  ): Promise<string | null> {
    const lines: string[] = ['⚠️ Подозрительная активность'];
    if (payload.reason) {
      lines.push(`Причина: ${payload.reason}`);
    }
    if (payload.level) {
      lines.push(`Уровень: ${payload.level}`);
    }
    if (payload.scope) {
      lines.push(`Контур: ${payload.scope}`);
    }
    if (payload.operation) {
      lines.push(`Операция: ${payload.operation}`);
    }
    if (payload.amount != null) {
      lines.push(`Сумма: ${this.formatCurrency(payload.amount)}`);
    }
    if (payload.count != null && payload.limit != null) {
      lines.push(`Срабатываний: ${payload.count}/${payload.limit}`);
    }
    if (payload.customerId) {
      lines.push(`Клиент: ${payload.customerId}`);
    }
    if (payload.outletId) {
      try {
        const outlet = await this.prisma.outlet.findFirst({
          where: { id: payload.outletId, merchantId },
          select: { name: true },
        });
        if (outlet?.name) {
          lines.push(`Точка: ${outlet.name}`);
        } else {
          lines.push(`Точка: ${payload.outletId}`);
        }
      } catch {
        lines.push(`Точка: ${payload.outletId}`);
      }
    }
    if (payload.at) {
      const at = this.formatDateTime(payload.at);
      lines.push(`Время: ${at}`);
    } else {
      lines.push(`Время: ${this.formatDateTime(new Date().toISOString())}`);
    }
    if (payload.checkId) {
      lines.push(`Проверка: ${payload.checkId}`);
    }
    return lines.join('\n');
  }

  private formatCurrency(amount: number): string {
    const value = Number(amount) || 0;
    try {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${Math.round(value)} ₽`;
    }
  }

  private formatDateTime(date: Date | string): string {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(date);
    }
  }

  private formatDate(date: Date): string {
    try {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  private parseDateOnly(input: string): Date | null {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const [y, m, d] = input.split('-').map((part) => parseInt(part, 10));
        return new Date(Date.UTC(y, m - 1, d));
      }
      const parsed = new Date(input);
      if (Number.isNaN(parsed.getTime())) return null;
      parsed.setUTCHours(0, 0, 0, 0);
      return parsed;
    } catch {
      return null;
    }
  }

  async ensureInviteMetadata(
    inviteId: string,
    actorType: TelegramStaffActorType,
  ): Promise<void> {
    try {
      await this.prisma.telegramStaffInvite.update({
        where: { id: inviteId },
        data: { actorType },
      });
    } catch (error) {
      this.logger.debug(`ensureInviteMetadata failed: ${error}`);
    }
  }

  async updateSubscriberActor(
    subscriberId: string,
    data: {
      staffId?: string | null;
      actorType?: TelegramStaffActorType;
    },
  ): Promise<void> {
    try {
      await this.prisma.telegramStaffSubscriber.update({
        where: { id: subscriberId },
        data: {
          staffId: data.staffId ?? undefined,
          actorType: data.actorType ?? undefined,
        },
      });
    } catch (error) {
      this.logger.debug(`updateSubscriberActor failed: ${error}`);
    }
  }

  async ensureSubscriber(
    merchantId: string,
    chatId: string,
    actor: {
      staffId?: string | null;
      actorType: TelegramStaffActorType;
      username?: string | null;
      title?: string | null;
      chatType: string;
    },
  ): Promise<TelegramStaffSubscriber> {
    const now = new Date();
    const existing = await this.prisma.telegramStaffSubscriber.findUnique({
      where: { merchantId_chatId: { merchantId, chatId } },
    });
    if (existing) {
      return this.prisma.telegramStaffSubscriber.update({
        where: { id: existing.id },
        data: {
          username: actor.username ?? undefined,
          title: actor.title ?? undefined,
          chatType: actor.chatType,
          staffId: actor.staffId ?? undefined,
          actorType: actor.actorType,
          isActive: true,
          lastSeenAt: now,
        },
      });
    }
    return this.prisma.telegramStaffSubscriber.create({
      data: {
        merchantId,
        chatId,
        chatType: actor.chatType,
        username: actor.username ?? null,
        title: actor.title ?? null,
        staffId: actor.staffId ?? null,
        actorType: actor.actorType,
        addedAt: now,
        lastSeenAt: now,
        isActive: true,
      },
    });
  }
}
