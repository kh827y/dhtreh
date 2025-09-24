import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TelegramCampaign } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type TelegramCampaignScope = 'ACTIVE' | 'ARCHIVED';

export interface CreateTelegramCampaignPayload {
  audienceId?: string;
  audienceName?: string;
  text: string;
  imageUrl?: string;
  scheduledAt: string | Date;
  timezone?: string;
}

@Injectable()
export class TelegramCampaignsService {
  private readonly activeStatuses = ['SCHEDULED', 'RUNNING', 'PAUSED'];
  private readonly archivedStatuses = ['COMPLETED', 'CANCELED', 'ARCHIVED'];
  private readonly allowedImageExtensions = ['.jpg', '.jpeg', '.png'];

  constructor(private readonly prisma: PrismaService) {}

  async list(merchantId: string, scope: TelegramCampaignScope): Promise<TelegramCampaign[]> {
    const where: Prisma.TelegramCampaignWhereInput = { merchantId };

    if (scope === 'ACTIVE') {
      where.archivedAt = null;
      where.status = { in: this.activeStatuses };
    } else {
      where.OR = [
        { archivedAt: { not: null } },
        { status: { in: this.archivedStatuses } },
      ];
    }

    return this.prisma.telegramCampaign.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async create(merchantId: string, payload: CreateTelegramCampaignPayload): Promise<TelegramCampaign> {
    await this.ensureTelegramEnabled(merchantId);

    const text = payload.text?.trim();
    if (!text) {
      throw new BadRequestException('Текст сообщения обязателен');
    }
    if (text.length > 512) {
      throw new BadRequestException('Текст не должен превышать 512 символов');
    }

    const scheduledAt = this.resolveFutureDate(payload.scheduledAt);

    if (payload.imageUrl) {
      this.validateImage(payload.imageUrl);
    }

    const audienceId = payload.audienceId ?? 'ALL';
    const audienceName = payload.audienceName ?? 'Всем клиентам';

    return this.prisma.telegramCampaign.create({
      data: {
        merchantId,
        audienceId,
        audienceName,
        text,
        imageUrl: payload.imageUrl ?? null,
        scheduledAt,
        timezone: payload.timezone ?? null,
        status: 'SCHEDULED',
      },
    });
  }

  async duplicate(merchantId: string, campaignId: string, override?: { scheduledAt?: string | Date }): Promise<TelegramCampaign> {
    const original = await this.findOwnedCampaign(merchantId, campaignId);
    const scheduledAt = this.resolveFutureDate(override?.scheduledAt ?? original.scheduledAt);

    return this.prisma.telegramCampaign.create({
      data: {
        merchantId,
        audienceId: original.audienceId,
        audienceName: original.audienceName,
        text: original.text,
        imageUrl: original.imageUrl,
        scheduledAt,
        timezone: original.timezone,
        status: 'SCHEDULED',
        metadata: (original.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  async markCanceled(merchantId: string, campaignId: string): Promise<TelegramCampaign> {
    await this.findOwnedCampaign(merchantId, campaignId);
    return this.prisma.telegramCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELED',
        archivedAt: new Date(),
      },
    });
  }

  async markArchived(merchantId: string, campaignId: string): Promise<TelegramCampaign> {
    await this.findOwnedCampaign(merchantId, campaignId);
    return this.prisma.telegramCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });
  }

  private async ensureTelegramEnabled(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { telegramBotEnabled: true },
    });

    if (!merchant?.telegramBotEnabled) {
      throw new BadRequestException('Подключите Telegram-бота, чтобы отправлять рассылки');
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

  private validateImage(url: string) {
    const lower = url.toLowerCase();
    if (!this.allowedImageExtensions.some(ext => lower.endsWith(ext))) {
      throw new BadRequestException('Разрешены изображения только в форматах JPG или PNG');
    }
  }

  private async findOwnedCampaign(merchantId: string, campaignId: string): Promise<TelegramCampaign> {
    const campaign = await this.prisma.telegramCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.merchantId !== merchantId) {
      throw new NotFoundException('Кампания не найдена');
    }
    return campaign;
  }
}
