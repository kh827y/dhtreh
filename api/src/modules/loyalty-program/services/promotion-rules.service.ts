import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CommunicationChannel,
  Prisma,
  PromotionRewardType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

type JsonRecord = Record<string, unknown>;
type PromotionRecord = Prisma.LoyaltyPromotionGetPayload<object>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

@Injectable()
export class PromotionRulesService {
  constructor(private readonly prisma: PrismaService) {}

  assertNonNegativeNumber(value: unknown, field: string) {
    if (value === undefined || value === null) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`Некорректное значение ${field}`);
    }
  }

  sanitizePercent(value: number | null | undefined, fallbackBps = 0) {
    if (value == null) return fallbackBps;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallbackBps;
    if (parsed > 100) return 10000;
    return Math.round(parsed * 100);
  }

  normalizePointsTtl(days?: number | null): number | null {
    if (days === undefined || days === null) return null;
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(1, Math.trunc(parsed));
  }

  normalizeIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return Array.from(new Set(normalized));
  }

  normalizePointsRuleType(
    value: unknown,
  ): 'multiplier' | 'percent' | 'fixed' | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (
      normalized === 'multiplier' ||
      normalized === 'percent' ||
      normalized === 'fixed'
    ) {
      return normalized;
    }
    throw new BadRequestException(
      'pointsRuleType должен быть multiplier/percent/fixed',
    );
  }

  normalizePointsValue(
    ruleType: 'multiplier' | 'percent' | 'fixed',
    value: unknown,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Укажите pointsValue для товарной акции');
    }
    const normalized = ruleType === 'fixed' ? Math.floor(parsed) : parsed;
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException('Укажите pointsValue для товарной акции');
    }
    return normalized;
  }

  normalizePromotionDate(value: unknown, label: string): Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(`Некорректная дата ${label}`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Некорректная дата ${label}`);
    }
    return date;
  }

  validatePromotionDates(
    startAt: Date | null,
    endAt: Date | null,
    status: PromotionStatus,
  ) {
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException(
        'Дата окончания не может быть раньше даты начала',
      );
    }
    const now = new Date();
    if (status === PromotionStatus.ACTIVE) {
      if (startAt && startAt.getTime() > now.getTime()) {
        throw new BadRequestException(
          'Акция не может быть активной до даты старта',
        );
      }
      if (endAt && endAt.getTime() < now.getTime()) {
        throw new BadRequestException('Акция уже завершена');
      }
    }
    if (status === PromotionStatus.SCHEDULED) {
      if (!startAt) {
        throw new BadRequestException('Для отложенной акции нужна дата старта');
      }
      if (startAt.getTime() <= now.getTime()) {
        throw new BadRequestException('Дата старта должна быть в будущем');
      }
    }
  }

  normalizeFuture(date: Date | null | undefined): Date | null {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    // Если время уже прошло — отправим немедленно (scheduledAt=null)
    return d.getTime() > Date.now() ? d : null;
  }

  async taskExists(params: {
    merchantId: string;
    promotionId: string;
    channel: CommunicationChannel;
    scheduledAt: Date | null;
  }): Promise<boolean> {
    const { merchantId, promotionId, channel, scheduledAt } = params;
    const where: Prisma.CommunicationTaskWhereInput = {
      merchantId,
      promotionId,
      channel,
      status: { in: ['SCHEDULED', 'RUNNING', 'PAUSED'] },
      ...(scheduledAt !== null ? { scheduledAt } : {}),
    };
    const existing = await this.prisma.communicationTask.findFirst({ where });
    return !!existing;
  }

  resolvePromotionText(
    promotion: PromotionRecord,
    kind: 'start' | 'reminder',
    reminderHours?: number,
  ): string {
    const meta = asRecord(promotion.metadata) ?? {};
    const raw =
      kind === 'start'
        ? readString(meta.pushMessage)
        : readString(meta.pushReminderMessage);
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (kind === 'start') return this.buildStartText(promotion);
    return this.buildReminderText(promotion, reminderHours ?? 48);
  }

  private buildStartText(promotion: PromotionRecord): string {
    const parts: string[] = [];
    parts.push(`Акция стартовала: ${promotion.name || 'Новая акция'}`);
    if (
      promotion.rewardType === PromotionRewardType.POINTS &&
      Number.isFinite(Number(promotion.rewardValue))
    ) {
      parts.push(
        `Бонус: +${Math.max(
          0,
          Math.round(Number(promotion.rewardValue)),
        )} баллов`,
      );
    }
    if (promotion.endAt) {
      try {
        const dd = new Date(promotion.endAt);
        parts.push(`До ${dd.toLocaleDateString('ru-RU')}`);
      } catch (err) {
        logIgnoredError(
          err,
          'PromotionRulesService format endAt',
          undefined,
          'debug',
        );
      }
    }
    return parts.join(' · ');
  }

  private buildReminderText(promotion: PromotionRecord, hours: number): string {
    const parts: string[] = [];
    parts.push(`Скоро завершится акция: ${promotion.name || ''}`.trim());
    if (
      promotion.rewardType === PromotionRewardType.POINTS &&
      Number.isFinite(Number(promotion.rewardValue))
    ) {
      parts.push(
        `Успейте получить +${Math.max(
          0,
          Math.round(Number(promotion.rewardValue)),
        )} баллов`,
      );
    }
    parts.push(`Осталось ~${Math.max(1, Math.round(hours))} ч.`);
    return parts.join(' · ');
  }
}
