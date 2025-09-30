import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoyaltyPromotion, Prisma, PromotionRewardType, PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type ActionsTab = 'UPCOMING' | 'CURRENT' | 'PAST';

export interface ActionListItemDto {
  id: string;
  name: string;
  status: string;
  badges: string[];
  startDate?: string | null;
  endDate?: string | null;
  metrics: {
    roi: number;
    revenue: number;
    expenses: number;
    purchases: number;
  };
  usageLimit: {
    type: string;
    value?: number | null;
  };
  audience?: {
    id?: string | null;
    name?: string | null;
  };
}

export interface CreateProductBonusActionPayload {
  name: string;
  productIds: string[];
  rule: { mode: 'FIXED' | 'PERCENT' | 'MULTIPLIER'; value: number };
  audienceId?: string;
  audienceName?: string;
  usageLimit: 'UNLIMITED' | 'ONCE' | 'N_TIMES';
  usageLimitValue?: number;
  schedule: {
    startEnabled: boolean;
    startDate?: string | Date;
    endEnabled: boolean;
    endDate?: string | Date;
  };
  enabled: boolean;
}

export interface UpdateActionStatusPayload {
  action: 'PAUSE' | 'RESUME';
}

type PromotionEntity = Prisma.LoyaltyPromotionGetPayload<{
  include: { metrics: true; audience: true };
}>;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(merchantId: string, tab: ActionsTab, search?: string): Promise<{ total: number; items: ActionListItemDto[] }> {
    const promotions = await this.prisma.loyaltyPromotion.findMany({
      where: {
        merchantId,
        metadata: { path: ['legacyCampaign', 'kind'], equals: 'PRODUCT_BONUS' },
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: { metrics: true, audience: true },
    });

    const filtered = promotions.filter((promotion) => this.classifyTab(promotion) === tab);

    return {
      total: filtered.length,
      items: filtered.map((promotion) => this.mapPromotion(promotion)),
    };
  }

  async getById(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    const promotion = await this.getPromotionEntity(merchantId, campaignId);
    return this.mapPromotion(promotion);
  }

  async createProductBonus(merchantId: string, payload: CreateProductBonusActionPayload): Promise<ActionListItemDto> {
    this.validateCreatePayload(payload);

    const startDate = payload.schedule.startEnabled ? this.parseDate(payload.schedule.startDate, 'Дата начала акции') : null;
    const endDate = payload.schedule.endEnabled ? this.parseDate(payload.schedule.endDate, 'Дата окончания акции') : null;

    if (startDate && endDate && endDate <= startDate) {
      throw new BadRequestException('Дата окончания должна быть позже даты начала');
    }

    const usageLimit = this.buildUsageLimit(payload);
    const now = new Date();
    let status = 'DRAFT';

    if (payload.enabled) {
      if (startDate && startDate > now) {
        status = 'SCHEDULED';
      } else {
        status = 'ACTIVE';
      }
    }

    const metadata: Prisma.InputJsonValue = {
      legacyCampaign: {
        kind: 'PRODUCT_BONUS',
        rule: payload.rule,
        productIds: payload.productIds,
        usageLimit,
        audience: {
          id: payload.audienceId ?? null,
          name: payload.audienceName ?? null,
        },
        metrics: {
          revenue: 0,
          expenses: 0,
          purchases: 0,
          roi: 0,
        },
      },
    } satisfies Prisma.JsonObject;

    const created = await this.prisma.loyaltyPromotion.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: null,
        status: status as PromotionStatus,
        segmentId: payload.audienceId ?? null,
        rewardType: PromotionRewardType.CUSTOM,
        rewardMetadata: { rule: payload.rule, kind: 'PRODUCT_BONUS' },
        startAt: startDate,
        endAt: endDate,
        archivedAt: null,
        metadata,
      },
    });

    const full = await this.getPromotionEntity(merchantId, created.id);
    return this.mapPromotion(full);
  }

  async updateStatus(merchantId: string, campaignId: string, payload: UpdateActionStatusPayload): Promise<ActionListItemDto> {
    const promotion = await this.getPromotionEntity(merchantId, campaignId);

    let status = promotion.status;
    if (payload.action === 'PAUSE') {
      status = PromotionStatus.PAUSED;
    } else if (payload.action === 'RESUME') {
      const now = new Date();
      if (promotion.startAt && promotion.startAt > now) {
        status = PromotionStatus.SCHEDULED;
      } else {
        status = PromotionStatus.ACTIVE;
      }
    }

    await this.prisma.loyaltyPromotion.update({
      where: { id: promotion.id },
      data: { status },
    });

    const updated = await this.getPromotionEntity(merchantId, campaignId);
    return this.mapPromotion(updated);
  }

  async archive(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    await this.getPromotionEntity(merchantId, campaignId);
    await this.prisma.loyaltyPromotion.update({
      where: { id: campaignId },
      data: {
        status: PromotionStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
    const archived = await this.getPromotionEntity(merchantId, campaignId);
    return this.mapPromotion(archived);
  }

  async duplicate(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    const promotion = await this.getPromotionEntity(merchantId, campaignId);
    const legacy = this.extractLegacyCampaign(promotion);
    const name = promotion.name.endsWith(' (копия)') ? promotion.name : `${promotion.name} (копия)`;
    const duplicated = await this.prisma.loyaltyPromotion.create({
      data: {
        merchantId,
        name,
        description: promotion.description ?? null,
        status: PromotionStatus.DRAFT,
        segmentId: promotion.segmentId,
        rewardType: PromotionRewardType.CUSTOM,
        rewardMetadata:
          promotion.rewardMetadata === null
            ? Prisma.JsonNull
            : (promotion.rewardMetadata as Prisma.InputJsonValue),
        metadata: {
          legacyCampaign: legacy,
        } as Prisma.InputJsonValue,
      },
    });

    const full = await this.getPromotionEntity(merchantId, duplicated.id);
    return this.mapPromotion(full);
  }
  private validateCreatePayload(payload: CreateProductBonusActionPayload) {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('Укажите название акции');
    }

    if (!Array.isArray(payload.productIds) || payload.productIds.length === 0) {
      throw new BadRequestException('Выберите хотя бы один товар для акции');
    }

    const value = Number(payload.rule?.value ?? 0);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Укажите значение правила начисления');
    }

    if (payload.rule.mode === 'PERCENT' && (value <= 0 || value > 100)) {
      throw new BadRequestException('Процент должен быть в диапазоне от 1 до 100');
    }

    if (payload.rule.mode === 'MULTIPLIER' && value < 1) {
      throw new BadRequestException('Множитель не может быть меньше 1');
    }

    if (!['UNLIMITED', 'ONCE', 'N_TIMES'].includes(payload.usageLimit)) {
      throw new BadRequestException('Некорректный вариант ограничения');
    }

    if (payload.usageLimit === 'N_TIMES') {
      const limit = payload.usageLimitValue ?? 0;
      if (!Number.isInteger(limit) || limit <= 1) {
        throw new BadRequestException('Укажите количество использований больше 1');
      }
    }
  }

  private buildUsageLimit(payload: CreateProductBonusActionPayload) {
    if (payload.usageLimit === 'UNLIMITED') {
      return { type: 'UNLIMITED', value: null };
    }
    if (payload.usageLimit === 'ONCE') {
      return { type: 'ONCE', value: 1 };
    }
    return { type: 'N_TIMES', value: payload.usageLimitValue ?? null };
  }

  private classifyTab(promotion: PromotionEntity): ActionsTab {
    if (promotion.archivedAt || promotion.status === PromotionStatus.ARCHIVED || promotion.status === PromotionStatus.COMPLETED) {
      return 'PAST';
    }

    const now = new Date();
    const start = promotion.startAt ?? null;
    const end = promotion.endAt ?? null;

    if (end && end < now) {
      return 'PAST';
    }

    if (promotion.status === PromotionStatus.DRAFT || (start && start > now)) {
      return 'UPCOMING';
    }

    return 'CURRENT';
  }

  private extractLegacyCampaign(promotion: LoyaltyPromotion | PromotionEntity) {
    const metadata = (promotion.metadata as any) ?? {};
    if (metadata && typeof metadata === 'object' && metadata.legacyCampaign) {
      return metadata.legacyCampaign as Record<string, any>;
    }
    return {} as Record<string, any>;
  }

  private mapPromotion(promotion: PromotionEntity): ActionListItemDto {
    const legacy = this.extractLegacyCampaign(promotion);
    const usageLimit = legacy.usageLimit ?? { type: 'UNLIMITED', value: null };
    const audienceMeta = legacy.audience ?? {};
    const audience = {
      id: audienceMeta.id ?? promotion.segmentId ?? null,
      name: audienceMeta.name ?? promotion.audience?.name ?? null,
    };
    const metrics = promotion.metrics ?? null;
    const expenses = Number(metrics?.pointsIssued ?? legacy.metrics?.expenses ?? 0) || 0;
    const revenue = Number(metrics?.revenueGenerated ?? legacy.metrics?.revenue ?? 0) || 0;
    const purchases = Number(legacy.metrics?.purchases ?? metrics?.participantsCount ?? 0) || 0;
    const roi = expenses > 0 ? Math.round(((revenue - expenses) / expenses) * 1000) / 10 : 0;

    return {
      id: promotion.id,
      name: promotion.name,
      status: promotion.status,
      badges: this.buildBadges(legacy, promotion),
      startDate: promotion.startAt?.toISOString() ?? null,
      endDate: promotion.endAt?.toISOString() ?? null,
      metrics: {
        roi,
        revenue,
        expenses,
        purchases,
      },
      usageLimit,
      audience,
    };
  }

  private buildBadges(content: any, promotion: PromotionEntity): string[] {
    const badges: string[] = [];
    if (content?.kind === 'PRODUCT_BONUS') {
      badges.push('Акционные баллы на товары');
    }

    if (!promotion.endAt) {
      badges.push('Бессрочная');
    }

    if (promotion.status === PromotionStatus.PAUSED) {
      badges.push('Пауза');
    }

    return badges;
  }

  private parseDate(value: string | Date | undefined, label: string): Date {
    if (!value) {
      throw new BadRequestException(`${label} не указана`);
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} указана некорректно`);
    }
    return date;
  }

  private async getPromotionEntity(merchantId: string, campaignId: string): Promise<PromotionEntity> {
    const promotion = await this.prisma.loyaltyPromotion.findFirst({
      where: { id: campaignId, merchantId },
      include: { metrics: true, audience: true },
    });
    if (!promotion || this.extractLegacyCampaign(promotion)?.kind !== 'PRODUCT_BONUS') {
      throw new NotFoundException('Акция не найдена');
    }
    return promotion;
  }
}
