import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TelegramNotifyService } from './telegram-notify.service';
import {
  Prisma,
  TelegramStaffActorType,
  type TelegramStaffSubscriber,
} from '@prisma/client';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../../shared/timezone/russia-timezones';
import { ensureRulesRoot, getRulesSection } from '../../shared/rules-json.util';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

export type StaffNotifySettings = {
  notifyOrders: boolean;
  notifyReviews: boolean;
  notifyReviewThreshold: number;
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
      deviceId?: string | null;
      operation?: string | null;
      amount?: number | null;
      count?: number | null;
      limit?: number | null;
      at?: string;
    };

type PreferencesMap = Record<string, StaffNotifySettings>;
type NotifyMetaMap = Record<string, { updatedAt?: string | null }>;

type Recipient = {
  subscriberId: string;
  chatId: string;
  actorKey: string;
};

type ReviewNotificationData = {
  rating: number;
  comment?: string | null;
  createdAt: Date;
  customer?: { name?: string | null; phone?: string | null; id: string } | null;
  transaction?: {
    orderId?: string | null;
    amount?: number | null;
    createdAt?: Date | null;
    outlet?: { name?: string | null } | null;
    staffId?: string | null;
    staff?: {
      firstName?: string | null;
      lastName?: string | null;
      login?: string | null;
    } | null;
    deviceId?: string | null;
    device?: { code?: string | null } | null;
  } | null;
};

@Injectable()
export class TelegramStaffNotificationsService {
  private readonly logger = new Logger(TelegramStaffNotificationsService.name);

  private readonly defaults: StaffNotifySettings = {
    notifyOrders: true,
    notifyReviews: true,
    notifyReviewThreshold: 3,
    notifyDailyDigest: true,
    notifyFraud: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TelegramNotifyService))
    private readonly telegram: TelegramNotifyService,
  ) {}

  private normalizeSettings(source?: unknown): StaffNotifySettings {
    if (!source || typeof source !== 'object') {
      return { ...this.defaults };
    }
    const settings = source as Partial<StaffNotifySettings>;
    const clampThreshold = (v: unknown, fallback: number) => {
      const num = Number(v);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(5, Math.max(1, Math.round(num)));
    };

    return {
      notifyOrders: this.toBool(
        settings.notifyOrders,
        this.defaults.notifyOrders,
      ),
      notifyReviews: this.toBool(
        settings.notifyReviews,
        this.defaults.notifyReviews,
      ),
      notifyReviewThreshold: clampThreshold(
        settings.notifyReviewThreshold,
        this.defaults.notifyReviewThreshold,
      ),
      notifyDailyDigest: this.toBool(
        settings.notifyDailyDigest,
        this.defaults.notifyDailyDigest,
      ),
      notifyFraud: this.toBool(settings.notifyFraud, this.defaults.notifyFraud),
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

  private toNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(5, Math.max(1, Math.round(num)));
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
    if (sub.staffId) return `staff:${sub.staffId}`;
    if (sub.actorType === TelegramStaffActorType.GROUP) return 'group';
    if (sub.actorType === TelegramStaffActorType.MERCHANT) return 'merchant';
    if (sub.chatType && sub.chatType.includes('group')) return 'group';
    return 'merchant';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private async loadNotifyData(
    merchantId: string,
  ): Promise<{ prefs: PreferencesMap; meta: NotifyMetaMap }> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules = ensureRulesRoot(settings?.rulesJson);
    const notify = getRulesSection(rules, 'staffNotify');
    const prefs: PreferencesMap = {};
    if (notify) {
      for (const [key, value] of Object.entries(notify)) {
        prefs[key] = this.normalizeSettings(value);
      }
    }
    const metaRaw = getRulesSection(rules, 'staffNotifyMeta');
    const meta: NotifyMetaMap = {};
    if (metaRaw) {
      for (const [key, value] of Object.entries(metaRaw)) {
        if (!key) continue;
        const metaEntry = this.asRecord(value);
        const updatedAt = metaEntry?.updatedAt;
        meta[key] = typeof updatedAt === 'string' ? { updatedAt } : {};
      }
    }
    return { prefs, meta };
  }

  private async saveNotifyData(
    merchantId: string,
    prefs: PreferencesMap,
    meta: NotifyMetaMap,
  ): Promise<void> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules = ensureRulesRoot(settings?.rulesJson);
    const nextNotify: Record<string, StaffNotifySettings> = {};
    for (const key of Object.keys(prefs)) {
      nextNotify[key] = prefs[key];
    }
    rules.staffNotify = nextNotify;
    rules.staffNotifyMeta = meta;
    const rulesJson = rules as Prisma.InputJsonValue;
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      create: { merchantId, rulesJson },
      update: { rulesJson },
    });
  }

  async getPreferences(
    merchantId: string,
    actor: StaffNotifyActor,
  ): Promise<StaffNotifySettings> {
    const { prefs } = await this.loadNotifyData(merchantId);
    const key = this.actorKey(actor);
    return prefs[key] ?? { ...this.defaults };
  }

  async updatePreferences(
    merchantId: string,
    actor: StaffNotifyActor,
    patch: Partial<StaffNotifySettings>,
  ): Promise<StaffNotifySettings> {
    const { prefs, meta } = await this.loadNotifyData(merchantId);
    const key = this.actorKey(actor);
    const current = prefs[key] ?? this.defaults;
    const next: StaffNotifySettings = {
      notifyOrders: this.toBool(
        patch.notifyOrders,
        current.notifyOrders ?? this.defaults.notifyOrders,
      ),
      notifyReviews: this.toBool(
        patch.notifyReviews,
        current.notifyReviews ?? this.defaults.notifyReviews,
      ),
      notifyReviewThreshold: this.toNumber(
        patch.notifyReviewThreshold,
        current.notifyReviewThreshold ?? this.defaults.notifyReviewThreshold,
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
    prefs[key] = next;
    meta[key] = { ...(meta[key] ?? {}), updatedAt: new Date().toISOString() };
    await this.saveNotifyData(merchantId, prefs, meta);
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
      const at = this.getPayloadAt(payload);
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
    const payloadAt = this.parsePayloadAt(payload);
    let reviewData: ReviewNotificationData | null = null;
    if (payload.kind === 'REVIEW') {
      reviewData = await this.loadReviewNotification(
        merchantId,
        payload.reviewId,
      );
      if (!reviewData) return { delivered: 0 };
    }
    const recipients = await this.resolveRecipients(merchantId, payload.kind, {
      payloadAt,
      reviewRating: reviewData?.rating ?? null,
    });
    if (!recipients.length) return { delivered: 0 };
    const text =
      payload.kind === 'REVIEW'
        ? this.formatReviewMessage(reviewData as ReviewNotificationData)
        : await this.buildMessage(merchantId, payload);
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
      } catch (err) {
        logIgnoredError(
          err,
          'StaffNotificationsService update last seen',
          this.logger,
          'debug',
        );
      }
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

  private parsePayloadAt(payload: StaffNotificationPayload): Date {
    const value = this.getPayloadAt(payload);
    if (!value) return new Date(0);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return new Date(0);
    return parsed;
  }

  private getPayloadAt(payload: StaffNotificationPayload): string | undefined {
    if ('at' in payload && typeof payload.at === 'string') {
      const trimmed = payload.at.trim();
      return trimmed ? trimmed : undefined;
    }
    return undefined;
  }

  private async resolveRecipients(
    merchantId: string,
    kind: StaffNotificationPayload['kind'],
    options?: { payloadAt?: Date; reviewRating?: number | null },
  ): Promise<Recipient[]> {
    const subscribers = await this.prisma.telegramStaffSubscriber.findMany({
      where: { merchantId, isActive: true },
      select: {
        id: true,
        chatId: true,
        chatType: true,
        staffId: true,
        actorType: true,
        addedAt: true,
      },
    });

    if (!subscribers.length) return [];
    const { prefs, meta } = await this.loadNotifyData(merchantId);
    const flag = this.flagForPayload(kind);
    if (!flag) return [];

    const result: Recipient[] = [];
    const payloadAt = options?.payloadAt ?? null;
    const reviewRating = options?.reviewRating ?? null;
    for (const sub of subscribers) {
      const actorKey = this.actorKeyFromSubscriber(sub);
      const hasActorPrefs = !!prefs[actorKey];
      const settings = hasActorPrefs
        ? prefs[actorKey]
        : (prefs['merchant'] ?? this.defaults);
      if (settings[flag]) {
        if (kind === 'REVIEW' && reviewRating != null) {
          const threshold =
            settings.notifyReviewThreshold ??
            this.defaults.notifyReviewThreshold;
          if (reviewRating > threshold) continue;
        }
        if (payloadAt) {
          if (sub.addedAt && payloadAt < sub.addedAt) continue;
          const effectiveKey = hasActorPrefs
            ? actorKey
            : prefs['merchant']
              ? 'merchant'
              : actorKey;
          const updatedAtRaw = meta[effectiveKey]?.updatedAt;
          if (typeof updatedAtRaw === 'string') {
            const updatedAt = new Date(updatedAtRaw);
            if (!Number.isNaN(updatedAt.getTime()) && payloadAt < updatedAt) {
              continue;
            }
          }
        }
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
        device: { select: { code: true } },
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
        lines.push(`Сотрудник: ${staffName}`);
      }
    }
    if (!receipt.staff) {
      const deviceLabel = receipt.device?.code || receipt.deviceId;
      if (deviceLabel) {
        lines.push(`Устройство: ${deviceLabel}`);
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
    const review = await this.loadReviewNotification(merchantId, reviewId);
    if (!review) return null;
    return this.formatReviewMessage(review);
  }

  private async loadReviewNotification(
    merchantId: string,
    reviewId: string,
  ): Promise<ReviewNotificationData | null> {
    return this.prisma.review.findFirst({
      where: { id: reviewId, merchantId },
      include: {
        customer: { select: { name: true, phone: true, id: true } },
        transaction: {
          select: {
            orderId: true,
            amount: true,
            createdAt: true,
            outlet: { select: { name: true } },
            staffId: true,
            staff: { select: { firstName: true, lastName: true, login: true } },
            deviceId: true,
            device: { select: { code: true } },
          },
        },
      },
    });
  }

  private formatReviewMessage(review: ReviewNotificationData): string {
    const lines: string[] = ['⭐️ Новый отзыв'];
    lines.push(`Оценка: ${review.rating.toFixed(1)}`);
    if (review.transaction?.orderId) {
      lines.push(`Заказ: ${review.transaction.orderId}`);
    }
    if (review.transaction?.outlet?.name) {
      lines.push(`Точка: ${review.transaction.outlet.name}`);
    }
    if (review.transaction) {
      const staffParts = [
        review.transaction.staff?.firstName,
        review.transaction.staff?.lastName,
      ].filter(Boolean);
      const staffName =
        staffParts.length > 0
          ? staffParts.join(' ')
          : (review.transaction.staff?.login ?? '');
      if (staffName) {
        lines.push(`Сотрудник: ${staffName}`);
      } else {
        const deviceLabel =
          review.transaction.device?.code || review.transaction.deviceId;
        if (deviceLabel) {
          lines.push(`Устройство: ${deviceLabel}`);
        }
      }
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
    const tz = await this.resolveTimezone(merchantId);
    let year = 0;
    let month = 0;
    let day = 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const [y, m, d] = isoDate.split('-').map((part) => parseInt(part, 10));
      year = y;
      month = m;
      day = d;
    } else {
      const parsed = new Date(isoDate);
      if (Number.isNaN(parsed.getTime())) return null;
      year = parsed.getUTCFullYear();
      month = parsed.getUTCMonth() + 1;
      day = parsed.getUTCDate();
    }
    if (!year || !month || !day) return null;
    const localDate = new Date(Date.UTC(year, month - 1, day));
    const from = new Date(
      localDate.getTime() - tz.utcOffsetMinutes * 60 * 1000,
    );
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
    const stat = await this.computeDailyStats(merchantId, from, to);
    const lines: string[] = [
      `📊 Ежедневный отчет за ${this.formatDate(localDate, tz.iana)}`,
      `Заказы: ${stat.transactionCount}`,
      `Выручка: ${this.formatCurrency(stat.revenue)}`,
      `Средний чек: ${this.formatCurrency(stat.averageCheck)}`,
      `Новые клиенты: ${stat.newCustomers}`,
      `Активные клиенты: ${stat.activeCustomers}`,
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
    const reason = String(payload.reason || '').toLowerCase();
    const operationLabel = this.mapOperationLabel(payload.operation);

    const describeVelocityScope = (scopeRaw?: string | null) => {
      const scope = String(scopeRaw || '').toLowerCase();
      const period = scope.includes('daily')
        ? 'за сутки'
        : scope.includes('weekly')
          ? 'за неделю'
          : 'за короткий период';
      const base = scope.replace(/_(daily|weekly)$/g, '');
      const targetMap: Record<string, string> = {
        merchant: 'по компании',
        outlet: 'по торговой точке',
        device: 'по устройству',
        staff: 'по сотруднику',
        customer: 'по клиенту',
      };
      const target = targetMap[base] ?? '';
      return `${period}${target ? ` ${target}` : ''}`.trim();
    };

    const factor = String(payload.scope || '').toLowerCase();
    if (reason === 'velocity') {
      const scopeLabel = describeVelocityScope(payload.scope);
      lines.push(
        `Превышен лимит операций${operationLabel ? ` (${operationLabel})` : ''}${scopeLabel ? ` ${scopeLabel}` : ''}`,
      );
      if (payload.count != null && payload.limit != null) {
        lines.push(
          `Текущая активность: ${payload.count} при лимите ${payload.limit}`,
        );
      }
    } else if (reason === 'factor') {
      if (factor === 'points_cap') {
        lines.push('Превышен лимит начисления баллов');
        if (payload.amount != null && payload.limit != null) {
          lines.push(
            `Запрошено: ${Math.abs(Number(payload.amount))} баллов при лимите ${payload.limit}`,
          );
        } else if (payload.amount != null) {
          lines.push(`Запрошено: ${Math.abs(Number(payload.amount))} баллов`);
        }
      } else if (factor === 'no_outlet_id') {
        lines.push('Операция без торговой точки');
      } else if (factor === 'no_device_id') {
        lines.push('Операция без устройства');
      } else {
        lines.push('Сработало правило безопасности');
      }
    } else if (reason === 'risk') {
      lines.push('Высокий риск операции');
      const riskLevel = this.mapRiskLevel(payload.level);
      if (riskLevel) {
        lines.push(`Уровень риска: ${riskLevel}`);
      }
    } else {
      lines.push('Сработало правило безопасности');
    }

    if (operationLabel && reason !== 'velocity') {
      lines.push(`Тип операции: ${operationLabel}`);
    }
    if (
      payload.amount != null &&
      !(reason === 'factor' && factor === 'points_cap')
    ) {
      lines.push(`Сумма операции: ${this.formatCurrency(payload.amount)}`);
    }

    if (payload.customerId) {
      try {
        const customer = await this.prisma.customer.findFirst({
          where: { id: payload.customerId, merchantId },
          select: { name: true, phone: true, id: true },
        });
        const label =
          (customer?.name && customer.name.trim()) ||
          (customer?.phone && customer.phone.trim()) ||
          (customer?.id ? `ID ${customer.id.slice(0, 8)}` : null);
      if (label) lines.push(`Клиент: ${label}`);
      } catch (err) {
        logIgnoredError(
          err,
          'StaffNotificationsService customer lookup',
          this.logger,
          'debug',
        );
        lines.push(`Клиент: ID ${payload.customerId.slice(0, 8)}`);
      }
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
      } catch (err) {
        logIgnoredError(
          err,
          'StaffNotificationsService outlet lookup',
          this.logger,
          'debug',
        );
        lines.push(`Точка: ${payload.outletId}`);
      }
    }
    if (payload.staffId) {
      try {
        const staff = await this.prisma.staff.findFirst({
          where: { id: payload.staffId, merchantId },
          select: { firstName: true, lastName: true, login: true },
        });
        const staffParts = [staff?.firstName, staff?.lastName]
          .filter(Boolean)
          .map((part) => (part ?? '').trim())
          .filter(Boolean);
        const staffName =
          staffParts.length > 0 ? staffParts.join(' ') : (staff?.login ?? '');
        if (staffName) {
          lines.push(`Сотрудник: ${staffName}`);
        }
      } catch (err) {
        logIgnoredError(
          err,
          'StaffNotificationsService staff lookup',
          this.logger,
          'debug',
        );
      }
    }
    if (payload.deviceId) {
      try {
        const device = await this.prisma.device.findFirst({
          where: { id: payload.deviceId, merchantId },
          select: { code: true },
        });
        const label = device?.code || payload.deviceId;
        if (label) lines.push(`Устройство: ${label}`);
      } catch (err) {
        logIgnoredError(
          err,
          'StaffNotificationsService device lookup',
          this.logger,
          'debug',
        );
        lines.push(`Устройство: ${payload.deviceId}`);
      }
    }
    if (payload.at) {
      const at = this.formatDateTime(payload.at);
      lines.push(`Время: ${at}`);
    } else {
      lines.push(`Время: ${this.formatDateTime(new Date().toISOString())}`);
    }
    return lines.join('\n');
  }

  private async resolveTimezone(merchantId: string) {
    const row = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { timezone: true },
    });
    return findTimezone(row?.timezone ?? DEFAULT_TIMEZONE_CODE);
  }

  private async computeDailyStats(merchantId: string, from: Date, to: Date) {
    const receiptWhere = {
      merchantId,
      createdAt: { gte: from, lte: to },
      canceledAt: null,
    };
    const [receiptAgg, activeCustomers, newCustomerRows] = await Promise.all([
      this.prisma.receipt.aggregate({
        where: receiptWhere,
        _sum: { total: true, earnApplied: true, redeemApplied: true },
        _count: { _all: true },
      }),
      this.prisma.receipt
        .groupBy({
          by: ['customerId'],
          where: receiptWhere,
        })
        .then((rows) => rows.length),
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT "customerId", MIN("createdAt") AS first_purchase
          FROM "Receipt"
          WHERE "merchantId" = ${merchantId} AND "canceledAt" IS NULL
          GROUP BY "customerId"
        ) t
        WHERE t.first_purchase >= ${from} AND t.first_purchase <= ${to};
      `,
    ]);

    const revenue = Number(receiptAgg._sum.total || 0);
    const transactionCount = Number(receiptAgg._count._all || 0);
    const averageCheck = transactionCount > 0 ? revenue / transactionCount : 0;
    const pointsIssued = Number(receiptAgg._sum.earnApplied || 0);
    const pointsRedeemed = Number(receiptAgg._sum.redeemApplied || 0);
    const newCustomers = Number(newCustomerRows?.[0]?.count || 0);

    return {
      revenue,
      transactionCount,
      averageCheck,
      newCustomers,
      activeCustomers,
      pointsIssued,
      pointsRedeemed,
    };
  }

  private mapOperationLabel(operation?: string | null) {
    const normalized = String(operation || '').toLowerCase();
    if (!normalized) return null;
    if (normalized === 'commit') return 'начисление';
    if (normalized === 'refund') return 'списание';
    return normalized;
  }

  private mapRiskLevel(level?: string | null) {
    const normalized = String(level || '').toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('critical')) return 'критический';
    if (normalized.includes('high')) return 'высокий';
    if (normalized.includes('medium')) return 'средний';
    if (normalized.includes('low')) return 'низкий';
    return normalized;
  }

  private formatCurrency(amount: number): string {
    const value = Number(amount) || 0;
    try {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
      }).format(value);
    } catch (err) {
      logIgnoredError(
        err,
        'StaffNotificationsService formatCurrency',
        this.logger,
        'debug',
      );
      return `${Math.round(value)} ₽`;
    }
  }

  private formatDateTime(date: Date | string, timeZone?: string): string {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      });
    } catch (err) {
      logIgnoredError(
        err,
        'StaffNotificationsService formatDateTime',
        this.logger,
        'debug',
      );
      return String(date);
    }
  }

  private formatDate(date: Date, timeZone?: string): string {
    try {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone,
      });
    } catch (err) {
      logIgnoredError(
        err,
        'StaffNotificationsService formatDate',
        this.logger,
        'debug',
      );
      return date.toISOString().slice(0, 10);
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
      const resetAddedAt = existing.isActive === false;
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
          addedAt: resetAddedAt ? now : undefined,
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
