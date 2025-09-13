import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { PushProvider, SendPushParams } from './push-provider.interface';
import { FcmProvider } from './providers/fcm.provider';

export interface RegisterDeviceDto {
  merchantId: string;
  customerId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  deviceInfo?: {
    model?: string;
    os?: string;
    appVersion?: string;
  };
}

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

@Injectable()
export class PushService {
  private provider: PushProvider;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Выбираем провайдера (можно расширить для других провайдеров)
    const providerName = this.configService.get('PUSH_PROVIDER') || 'fcm';
    
    switch (providerName) {
      case 'fcm':
        this.provider = new FcmProvider(configService);
        break;
      default:
        this.provider = new FcmProvider(configService);
    }
  }

  /**
   * Регистрация устройства для push-уведомлений
   */
  async registerDevice(dto: RegisterDeviceDto) {
    // Проверяем существование клиента
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new BadRequestException('Клиент не найден');
    }

    // Сохраняем или обновляем токен устройства
    const device = await this.prisma.pushDevice.upsert({
      where: {
        customerId_deviceId: {
          customerId: dto.customerId,
          deviceId: dto.deviceId || dto.token,
        },
      },
      create: {
        customerId: dto.customerId,
        merchantId: dto.merchantId,
        deviceId: dto.deviceId || dto.token,
        token: dto.token,
        platform: dto.platform,
        deviceInfo: dto.deviceInfo || {},
        isActive: true,
      },
      update: {
        token: dto.token,
        platform: dto.platform,
        deviceInfo: dto.deviceInfo || {},
        isActive: true,
        lastActiveAt: new Date(),
      },
    });

    // Подписываем на топики мерчанта
    try {
      await this.subscribeToMerchantTopics(dto.token, dto.merchantId);
    } catch (error) {
      console.error('Failed to subscribe to topics:', error);
    }

    return {
      success: true,
      deviceId: device.id,
    };
  }

  /**
   * Отправка push-уведомления
   */
  async sendPush(dto: SendPushDto) {
    // Проверяем права на отправку маркетинговых уведомлений
    if (dto.type === 'MARKETING') {
      const hasFeature = await this.checkPushFeature(dto.merchantId);
      if (!hasFeature) {
        throw new BadRequestException('Push-уведомления не доступны в вашем тарифном плане');
      }
    }

    // Получаем токены устройств
    const tokens = await this.getDeviceTokens(dto);

    if (tokens.length === 0) {
      return {
        success: false,
        message: 'Нет зарегистрированных устройств',
        sent: 0,
      };
    }

    // Отправляем уведомления
    const results = await Promise.all(
      tokens.map(async ({ token, customerId, deviceId }) => {
        const result = await this.provider.sendPush({
          token,
          title: dto.title,
          body: dto.body,
          data: {
            ...dto.data,
            type: dto.type,
            merchantId: dto.merchantId,
            campaignId: dto.campaignId || '',
          },
          image: dto.image,
          priority: dto.priority || 'normal',
        });

        // Сохраняем в БД
        await this.prisma.pushNotification.create({
          data: {
            merchantId: dto.merchantId,
            customerId,
            deviceId,
            title: dto.title,
            body: dto.body,
            type: dto.type,
            status: result.success ? 'sent' : 'failed',
            messageId: result.messageId,
            campaignId: dto.campaignId,
            error: result.error,
            data: dto.data || {},
          },
        });

        // Обновляем токен если устарел
        if (result.canonicalToken) {
          await this.prisma.pushDevice.update({
            where: { id: deviceId },
            data: { token: result.canonicalToken },
          });
        }

        // Деактивируем устройство если токен недействителен
        if (!result.success && result.error?.includes('expired')) {
          await this.prisma.pushDevice.update({
            where: { id: deviceId },
            data: { isActive: false },
          });
        }

        return result;
      })
    );

    const successCount = results.filter(r => r.success).length;

    // Обновляем статистику
    await this.updateStats(dto.merchantId, successCount, tokens.length - successCount);

    return {
      success: successCount > 0,
      sent: successCount,
      failed: tokens.length - successCount,
      total: tokens.length,
    };
  }

  /**
   * Отправка уведомления о транзакции
   */
  async sendTransactionNotification(
    merchantId: string,
    customerId: string,
    type: 'EARN' | 'REDEEM' | 'REFUND',
    amount: number,
    balance: number
  ) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
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
        amount: amount.toString(),
        balance: balance.toString(),
      },
      priority: 'high',
    });
  }

  /**
   * Отправка уведомления о кампании
   */
  async sendCampaignNotification(
    campaignId: string,
    customerIds: string[],
    title: string,
    body: string,
    image?: string
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new BadRequestException('Кампания не найдена');
    }

    return this.sendPush({
      merchantId: campaign.merchantId,
      customerIds,
      title,
      body,
      image,
      type: 'CAMPAIGN',
      campaignId,
      data: {
        campaignType: campaign.type,
        campaignName: campaign.name,
      },
    });
  }

  /**
   * Отправка по топику
   */
  async sendToTopic(merchantId: string, title: string, body: string, data?: Record<string, string>) {
    const topic = `merchant_${merchantId}`;
    
    const result = await this.provider.sendToTopic!(topic, {
      title,
      body,
      data,
      priority: 'normal',
    });

    // Сохраняем в БД
    await this.prisma.pushNotification.create({
      data: {
        merchantId,
        title,
        body,
        type: 'MARKETING',
        status: result.success ? 'sent' : 'failed',
        messageId: result.messageId,
        error: result.error,
        data: data || {},
      },
    });

    return result;
  }

  /**
   * Получение токенов устройств
   */
  private async getDeviceTokens(dto: SendPushDto) {
    const where: any = {
      merchantId: dto.merchantId,
      isActive: true,
    };

    if (dto.customerId) {
      where.customerId = dto.customerId;
    } else if (dto.customerIds && dto.customerIds.length > 0) {
      where.customerId = { in: dto.customerIds };
    }

    const devices = await this.prisma.pushDevice.findMany({
      where,
      select: {
        id: true,
        token: true,
        customerId: true,
      },
    });

    return devices.map(d => ({
      token: d.token,
      customerId: d.customerId,
      deviceId: d.id,
    }));
  }

  /**
   * Подписка на топики мерчанта
   */
  private async subscribeToMerchantTopics(token: string, merchantId: string) {
    if (!this.provider.subscribeToTopic) {
      return;
    }

    const topics = [
      `merchant_${merchantId}`, // Все уведомления мерчанта
      `merchant_${merchantId}_news`, // Новости
      `merchant_${merchantId}_offers`, // Акции
    ];

    for (const topic of topics) {
      try {
        await this.provider.subscribeToTopic(token, topic);
      } catch (error) {
        console.error(`Failed to subscribe to topic ${topic}:`, error);
      }
    }
  }

  /**
   * Проверка доступности push в тарифе
   */
  private async checkPushFeature(merchantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      return false;
    }

    const plan = subscription.plan as any;
    return plan.features?.pushNotifications === true;
  }

  /**
   * Обновление статистики
   */
  private async updateStats(merchantId: string, sent: number, failed: number) {
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

  /**
   * Получение статистики push-уведомлений
   */
  async getPushStats(merchantId: string, period?: { from: Date; to: Date }) {
    const where: any = { merchantId };
    if (period) {
      where.createdAt = {
        gte: period.from,
        lte: period.to,
      };
    }

    const [total, sent, failed, byType, activeDevices] = await Promise.all([
      this.prisma.pushNotification.count({ where }),
      this.prisma.pushNotification.count({ 
        where: { ...where, status: 'sent' } 
      }),
      this.prisma.pushNotification.count({ 
        where: { ...where, status: 'failed' } 
      }),
      this.prisma.pushNotification.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.prisma.pushDevice.count({
        where: {
          merchantId,
          isActive: true,
        },
      }),
    ]);

    return {
      total,
      sent,
      failed,
      deliveryRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      byType: byType.reduce((acc, item: any) => {
        const key = (item?.type ?? 'UNKNOWN') as string;
        const count = typeof item?._count === 'number' ? item._count : (item?._count?._all ?? 0);
        acc[key] = Number(count) || 0;
        return acc;
      }, {} as Record<string, number>),
      activeDevices,
    };
  }

  /**
   * Шаблоны push-уведомлений
   */
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

  /**
   * Деактивировать устройство
   */
  async deactivateDevice(deviceId: string) {
    await this.prisma.pushDevice.update({
      where: { id: deviceId },
      data: { isActive: false },
    });
  }

  /**
   * Получить клиента с устройством
   */
  async getCustomerWithDevice(customerId: string): Promise<{ customerId: string; merchantId: string } | null> {
    const prismaAny = this.prisma as any;
    const device = await prismaAny.pushDevice.findFirst({
      where: {
        customerId,
        isActive: true,
      },
      include: {
        customer: {
          include: {
            wallets: true,
          },
        },
      },
    });

    if (!device || !device.customer?.wallets?.[0]) {
      return null;
    }

    const derivedMerchantId: string | null = device.merchantId || device.customer.wallets?.[0]?.merchantId || null;
    if (!derivedMerchantId) return null;
    return { customerId, merchantId: derivedMerchantId as string };
  }
}
