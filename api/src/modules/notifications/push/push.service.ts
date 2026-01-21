import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TelegramBotService } from '../../telegram/telegram-bot.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

export interface SendPushDto {
  merchantId: string;
  customerId?: string;
  customerIds?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  image?: string;
  type: 'TRANSACTION' | 'MARKETING' | 'CAMPAIGN' | 'SYSTEM';
  campaignId?: string;
  priority?: 'high' | 'normal';
}

type PushRecipient = {
  customerId: string;
  tgId: string;
};

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBots: TelegramBotService,
  ) {}

  async sendPush(dto: SendPushDto) {
    const body = typeof dto.body === 'string' ? dto.body.trim() : '';
    if (!body) {
      throw new BadRequestException('Текст push-уведомления обязателен');
    }
    const title =
      typeof dto.title === 'string' && dto.title.trim() ? dto.title.trim() : '';
    await this.ensureTelegramConnected(dto.merchantId);

    const explicit =
      dto.customerId && !dto.customerIds?.length
        ? [dto.customerId]
        : (dto.customerIds ?? []);
    const recipients = await this.resolveRecipients(
      dto.merchantId,
      explicit.length ? explicit : undefined,
    );

    if (!recipients.length) {
      return {
        success: false,
        message: 'Нет клиентов с подключённой Telegram Mini App',
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    const pushLogs: Prisma.PushNotificationCreateManyInput[] = [];
    let sent = 0;
    let failed = 0;

    const payloadData =
      dto.data && Object.keys(dto.data).length
        ? (dto.data as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    for (const recipient of recipients) {
      try {
        await this.telegramBots.sendPushNotification(
          dto.merchantId,
          recipient.tgId,
          {
            title: title || undefined,
            body,
            data: dto.data ?? undefined,
            deepLink: dto.data?.deeplink ?? undefined,
          },
        );
        sent += 1;
        pushLogs.push({
          merchantId: dto.merchantId,
          customerId: recipient.customerId,
          outletId: null,
          deviceToken: null,
          title,
          body,
          type: dto.type,
          campaignId: dto.campaignId ?? null,
          data: payloadData,
          status: 'sent',
          messageId: null,
          sentAt: new Date(),
          error: null,
        });
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Failed to deliver via Telegram';
        failed += 1;
        pushLogs.push({
          merchantId: dto.merchantId,
          customerId: recipient.customerId,
          outletId: null,
          deviceToken: null,
          title,
          body,
          type: dto.type,
          campaignId: dto.campaignId ?? null,
          data: payloadData,
          status: 'failed',
          messageId: null,
          sentAt: null,
          error: errorMessage,
        });
      }
    }

    if (pushLogs.length) {
      await this.prisma.pushNotification.createMany({ data: pushLogs });
    }
    await this.updateStats(dto.merchantId, sent, failed);

    return {
      success: sent > 0,
      sent,
      failed,
      total: recipients.length,
    };
  }

  async sendTransactionNotification(
    merchantId: string,
    customerId: string,
    type: 'EARN' | 'REDEEM' | 'REFUND',
    amount: number,
    balance: number,
  ) {
    await this.ensureTelegramConnected(merchantId);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true },
    });

    let title = '';
    let body = '';
    switch (type) {
      case 'EARN':
        title = `+${amount} баллов`;
        body = `Начислено ${amount} баллов. Баланс: ${balance}`;
        break;
      case 'REDEEM':
        title = `-${Math.abs(amount)} баллов`;
        body = `Списано ${Math.abs(amount)} баллов. Остаток: ${balance}`;
        break;
      case 'REFUND':
        title = 'Возврат баллов';
        body = `Возвращено ${amount} баллов. Баланс: ${balance}`;
        break;
    }

    if (merchant?.name) {
      title = `${merchant.name}: ${title}`;
    }

    return this.sendPush({
      merchantId,
      customerId,
      title,
      body,
      type: 'TRANSACTION',
      data: {
        transactionType: type,
        amount: String(amount),
        balance: String(balance),
      },
      priority: 'high',
    });
  }

  async sendCampaignNotification(
    campaignId: string,
    customerIds: string[],
    title: string,
    body: string,
    _image?: string,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findUnique({
      where: { id: campaignId },
      select: {
        merchantId: true,
        name: true,
        rewardType: true,
        rewardMetadata: true,
      },
    });

    if (!promotion) {
      throw new BadRequestException('Кампания не найдена');
    }

    const rewardMeta =
      promotion.rewardMetadata && typeof promotion.rewardMetadata === 'object'
        ? (promotion.rewardMetadata as Record<string, any>)
        : {};
    const campaignType = String(rewardMeta.kind || promotion.rewardType || '');

    return this.sendPush({
      merchantId: promotion.merchantId,
      customerIds,
      title,
      body,
      type: 'CAMPAIGN',
      campaignId,
      data: {
        campaignType: campaignType || 'LOYALTY_PROMOTION',
        campaignName: promotion.name ?? title,
      },
    });
  }

  async sendToTopic(
    merchantId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const recipients = await this.resolveRecipients(merchantId);
    if (!recipients.length) {
      return { success: false, message: 'Нет подписчиков Mini App' };
    }

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await this.telegramBots.sendPushNotification(
          merchantId,
          recipient.tgId,
          {
            title,
            body,
            data,
          },
        );
        sent += 1;
      } catch (err) {
        logIgnoredError(err, 'PushService send', undefined, 'debug');
        failed += 1;
      }
    }

    await this.prisma.pushNotification.create({
      data: {
        merchantId,
        customerId: null,
        outletId: null,
        deviceToken: null,
        title,
        body,
        type: 'MARKETING',
        campaignId: null,
        data:
          data && Object.keys(data).length
            ? (data as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        status: failed ? 'failed' : 'sent',
        messageId: null,
        sentAt: failed ? null : new Date(),
        error: failed ? 'Часть push-уведомлений не доставлена' : null,
      },
    });

    return { success: failed === 0, sent, failed };
  }

  async getPushStats(merchantId: string, period?: { from: Date; to: Date }) {
    const where: Prisma.PushNotificationWhereInput = { merchantId };
    if (period) {
      where.createdAt = {
        gte: period.from,
        lte: period.to,
      };
    }

    const [total, sent, failed, byType, activeRecipients] = await Promise.all([
      this.prisma.pushNotification.count({ where }),
      this.prisma.pushNotification.count({
        where: { ...where, status: 'sent' },
      }),
      this.prisma.pushNotification.count({
        where: { ...where, status: 'failed' },
      }),
      this.prisma.pushNotification.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.prisma.customer.count({
        where: { merchantId, tgId: { not: null } },
      }),
    ]);

    return {
      total,
      sent,
      failed,
      deliveryRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      byType: byType.reduce(
        (acc, item) => {
          const key = item?.type ?? 'UNKNOWN';
          const count = Number(item?._count ?? 0);
          acc[key] = Number.isFinite(count) ? count : 0;
          return acc;
        },
        {} as Record<string, number>,
      ),
      activeDevices: activeRecipients,
    };
  }

  getPushTemplates() {
    return [
      {
        id: 'welcome',
        name: 'Приветствие',
        title: 'Добро пожаловать!',
        body: 'Вам начислено {points} приветственных баллов',
        variables: ['points'],
      },
      {
        id: 'transaction',
        name: 'Транзакция',
        title: '{action} {points} баллов',
        body: 'Баланс: {balance} баллов',
        variables: ['action', 'points', 'balance'],
      },
      {
        id: 'campaign',
        name: 'Акция',
        title: '{campaignName}',
        body: '{description}',
        variables: ['campaignName', 'description'],
      },
      {
        id: 'birthday',
        name: 'День рождения',
        title: '🎉 С Днем Рождения!',
        body: 'Дарим {discount}% скидку на любую покупку!',
        variables: ['discount'],
      },
      {
        id: 'reminder',
        name: 'Напоминание',
        title: 'У вас {points} баллов',
        body: 'Используйте их до {date}',
        variables: ['points', 'date'],
      },
      {
        id: 'news',
        name: 'Новости',
        title: '{title}',
        body: '{message}',
        variables: ['title', 'message'],
      },
    ];
  }

  async getCustomerWithDevice(customerId: string) {
    const record = await this.prisma.customer.findFirst({
      where: { id: customerId, tgId: { not: null }, erasedAt: null },
      select: { id: true, merchantId: true },
    });
    if (!record) return null;
    return { customerId: record.id, merchantId: record.merchantId };
  }

  private async ensureTelegramConnected(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { telegramBotEnabled: true },
    });
    if (!merchant?.telegramBotEnabled) {
      throw new BadRequestException(
        'Подключите Telegram Mini App, чтобы отправлять push-уведомления',
      );
    }
  }

  private async resolveRecipients(
    merchantId: string,
    specificCustomers?: string[],
  ): Promise<PushRecipient[]> {
    const where: Prisma.CustomerWhereInput = {
      merchantId,
      erasedAt: null,
      tgId: { not: null },
      consents: { some: { merchantId } },
    };
    if (specificCustomers?.length) {
      where.id = { in: specificCustomers };
    }

    const rows = await this.prisma.customer.findMany({
      where,
      select: { id: true, tgId: true },
    });

    const seen = new Set<string>();
    const recipients: PushRecipient[] = [];
    for (const row of rows) {
      if (!row.tgId) continue;
      const key = row.tgId.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      recipients.push({
        customerId: row.id,
        tgId: key,
      });
    }
    return recipients;
  }

  private async updateStats(merchantId: string, sent: number, failed: number) {
    if (!sent && !failed) return;
    await this.prisma.merchantStats.upsert({
      where: { merchantId },
      create: {
        merchantId,
        pushSent: sent,
        pushFailed: failed,
      },
      update: {
        pushSent: { increment: sent },
        pushFailed: { increment: failed },
      },
    });
  }
}
