import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Campaign, Prisma } from '@prisma/client';
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

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(merchantId: string, tab: ActionsTab, search?: string): Promise<{ total: number; items: ActionListItemDto[] }> {
    const where: Prisma.CampaignWhereInput = {
      merchantId,
      type: 'PRODUCT_BONUS',
      archivedAt: tab === 'PAST' ? { not: null } : null,
      name: search ? { contains: search, mode: 'insensitive' } : undefined,
    };

    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const filtered = campaigns.filter(c => this.classifyTab(c) === tab);

    return {
      total: filtered.length,
      items: filtered.map(c => this.mapCampaign(c)),
    };
  }

  async getById(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.merchantId !== merchantId || campaign.type !== 'PRODUCT_BONUS') {
      throw new NotFoundException('Акция не найдена');
    }
    return this.mapCampaign(campaign);
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

    const created = await this.prisma.campaign.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        type: 'PRODUCT_BONUS',
        status,
        content: {
          kind: 'PRODUCT_BONUS',
          productIds: payload.productIds,
          rule: payload.rule,
          usageLimit,
          audience: {
            id: payload.audienceId ?? null,
            name: payload.audienceName ?? null,
          },
        } satisfies Prisma.JsonObject,
        reward: payload.rule ? (payload.rule as Prisma.JsonObject) : Prisma.JsonNull,
        startDate,
        endDate,
        maxUsagePerCustomer: usageLimit.type === 'UNLIMITED' ? null : usageLimit.value ?? (usageLimit.type === 'ONCE' ? 1 : null),
        targetSegmentId: payload.audienceId ?? null,
        metrics: {
          revenue: 0,
          expenses: 0,
          purchases: 0,
          roi: 0,
        } satisfies Prisma.JsonObject,
        notificationChannels: [],
      },
    });

    return this.mapCampaign(created);
  }

  async updateStatus(merchantId: string, campaignId: string, payload: UpdateActionStatusPayload): Promise<ActionListItemDto> {
    const campaign = await this.getCampaignEntity(merchantId, campaignId);

    let status = campaign.status;
    if (payload.action === 'PAUSE') {
      status = 'PAUSED';
    } else if (payload.action === 'RESUME') {
      const now = new Date();
      if (campaign.startDate && campaign.startDate > now) {
        status = 'SCHEDULED';
      } else {
        status = 'ACTIVE';
      }
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status },
    });

    return this.mapCampaign(updated);
  }

  async archive(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    await this.getCampaignEntity(merchantId, campaignId);
    const archived = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });
    return this.mapCampaign(archived);
  }

  async duplicate(merchantId: string, campaignId: string): Promise<ActionListItemDto> {
    const campaign = await this.getCampaignEntity(merchantId, campaignId);
    const name = campaign.name.endsWith(' (копия)') ? campaign.name : `${campaign.name} (копия)`;

    const duplicated = await this.prisma.campaign.create({
      data: {
        merchantId,
        name,
        type: 'PRODUCT_BONUS',
        status: 'DRAFT',
        content: (campaign.content ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        reward: (campaign.reward ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        notificationChannels: campaign.notificationChannels,
        metrics: campaign.metrics ?? {
          revenue: 0,
          expenses: 0,
          purchases: 0,
          roi: 0,
        },
      },
    });

    return this.mapCampaign(duplicated);
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

  private classifyTab(campaign: Campaign): ActionsTab {
    if (campaign.archivedAt || campaign.status === 'ARCHIVED' || campaign.status === 'COMPLETED') {
      return 'PAST';
    }

    const now = new Date();
    const start = campaign.startDate ?? campaign.startAt ?? null;
    const end = campaign.endDate ?? campaign.endAt ?? null;

    if (end && end < now) {
      return 'PAST';
    }

    if (campaign.status === 'DRAFT' || (start && start > now)) {
      return 'UPCOMING';
    }

    return 'CURRENT';
  }

  private mapCampaign(campaign: Campaign): ActionListItemDto {
    const content = (campaign.content as any) ?? {};
    const metrics = (campaign.metrics as any) ?? {};
    const usageLimit = content.usageLimit ?? { type: 'UNLIMITED', value: null };
    const audience = content.audience ?? { id: campaign.targetSegmentId ?? null, name: null };

    const expenses = Number(metrics.expenses ?? 0) || 0;
    const revenue = Number(metrics.revenue ?? 0) || 0;
    const purchases = Number(metrics.purchases ?? 0) || 0;
    const roi = Number.isFinite(metrics.roi)
      ? Number(metrics.roi)
      : expenses > 0
      ? Math.round(((revenue - expenses) / expenses) * 1000) / 10
      : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      badges: this.buildBadges(content, campaign),
      startDate: (campaign.startDate ?? campaign.startAt)?.toISOString() ?? null,
      endDate: (campaign.endDate ?? campaign.endAt)?.toISOString() ?? null,
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

  private buildBadges(content: any, campaign: Campaign): string[] {
    const badges: string[] = [];
    if (content?.kind === 'PRODUCT_BONUS') {
      badges.push('Акционные баллы на товары');
    }

    if (!campaign.endDate && !campaign.endAt) {
      badges.push('Бессрочная');
    }

    if (campaign.status === 'PAUSED') {
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

  private async getCampaignEntity(merchantId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.merchantId !== merchantId || campaign.type !== 'PRODUCT_BONUS') {
      throw new NotFoundException('Акция не найдена');
    }
    return campaign;
  }
}
