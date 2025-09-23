import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PushCampaign } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type PushCampaignScope = 'ACTIVE' | 'ARCHIVED';

export interface CreatePushCampaignPayload {
  text: string;
  audience: string;
  scheduledAt: string | Date;
  timezone?: string;
}

@Injectable()
export class PushCampaignsService {
  private readonly activeStatuses = ['SCHEDULED', 'RUNNING', 'PAUSED'];
  private readonly archivedStatuses = ['COMPLETED', 'CANCELED', 'ARCHIVED'];

  constructor(private readonly prisma: PrismaService) {}

  async list(merchantId: string, scope: PushCampaignScope): Promise<PushCampaign[]> {
    const where: Prisma.PushCampaignWhereInput = { merchantId };

    if (scope === 'ACTIVE') {
      where.archivedAt = null;
      where.status = { in: this.activeStatuses };
    } else {
      where.OR = [
        { archivedAt: { not: null } },
        { status: { in: this.archivedStatuses } },
      ];
    }

    return this.prisma.pushCampaign.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async create(merchantId: string, payload: CreatePushCampaignPayload): Promise<PushCampaign> {
    await this.ensurePushFeatureEnabled(merchantId);

    const text = payload.text?.trim();
    if (!text) {
      throw new BadRequestException('Текст уведомления обязателен');
    }
    if (text.length > 300) {
      throw new BadRequestException('Длина текста не должна превышать 300 символов');
    }

    const scheduledAt = this.resolveFutureDate(payload.scheduledAt);

    if (!payload.audience) {
      throw new BadRequestException('Не выбрана аудитория рассылки');
    }

    return this.prisma.pushCampaign.create({
      data: {
        merchantId,
        text,
        audience: payload.audience,
        scheduledAt,
        timezone: payload.timezone ?? null,
        status: 'SCHEDULED',
      },
    });
  }

  async duplicate(merchantId: string, campaignId: string, override?: { scheduledAt?: string | Date }): Promise<PushCampaign> {
    const original = await this.findOwnedCampaign(merchantId, campaignId);

    const scheduledAt = this.resolveFutureDate(override?.scheduledAt ?? original.scheduledAt);

    return this.prisma.pushCampaign.create({
      data: {
        merchantId,
        text: original.text,
        audience: original.audience,
        scheduledAt,
        timezone: original.timezone,
        status: 'SCHEDULED',
        metadata: original.metadata,
      },
    });
  }

  async markCanceled(merchantId: string, campaignId: string): Promise<PushCampaign> {
    await this.findOwnedCampaign(merchantId, campaignId);
    return this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELED',
        archivedAt: new Date(),
      },
    });
  }

  async markArchived(merchantId: string, campaignId: string): Promise<PushCampaign> {
    await this.findOwnedCampaign(merchantId, campaignId);
    return this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });
  }

  private async ensurePushFeatureEnabled(merchantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      throw new BadRequestException('Для создания push-рассылок требуется активная подписка');
    }

    const plan = subscription.plan as any;
    if (!plan?.features?.pushNotifications) {
      throw new BadRequestException('Текущий тариф не поддерживает push-рассылки');
    }
  }

  private resolveFutureDate(input: string | Date | undefined | null): Date {
    const value = typeof input === 'string' ? new Date(input) : input instanceof Date ? input : null;
    if (!value || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Некорректная дата запуска рассылки');
    }

    if (value.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new BadRequestException('Дата начала отправки не может быть в прошлом');
    }
    return value;
  }

  private async findOwnedCampaign(merchantId: string, campaignId: string): Promise<PushCampaign> {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.merchantId !== merchantId) {
      throw new NotFoundException('Кампания не найдена');
    }
    return campaign;
  }
}
