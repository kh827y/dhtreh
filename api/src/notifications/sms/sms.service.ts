import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { SmsProvider, SendSmsParams } from './sms-provider.interface';
import { SmscProvider } from './providers/smsc.provider';

export interface SendNotificationDto {
  merchantId: string;
  customerId?: string;
  phone?: string;
  message: string;
  type: 'MARKETING' | 'TRANSACTIONAL' | 'OTP' | 'REMINDER';
  campaignId?: string;
  metadata?: any;
}

@Injectable()
export class SmsService {
  private provider: SmsProvider;
  private readonly maxMessageLength = 160; // Для кириллицы - 70 символов

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Выбираем провайдера на основе конфигурации
    const providerName = this.configService.get('SMS_PROVIDER') || 'smsc';
    
    switch (providerName) {
      case 'smsc':
        this.provider = new SmscProvider(configService);
        break;
      // Можно добавить других провайдеров: smsru, twilio, etc.
      default:
        this.provider = new SmscProvider(configService);
    }
  }

  /**
   * Отправить SMS уведомление
   */
  async sendNotification(dto: SendNotificationDto) {
    // Получаем телефон
    let phone = dto.phone;
    if (!phone && dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });
      phone = customer?.phone || undefined;
    }

    if (!phone) {
      throw new BadRequestException('Телефон не указан');
    }

    // Проверяем разрешение на отправку
    const consent = await this.checkConsent(dto.merchantId, dto.customerId || phone, 'SMS');
    if (!consent && dto.type === 'MARKETING') {
      throw new BadRequestException('Клиент не дал согласие на SMS рассылку');
    }

    // Форматируем сообщение
    const message = await this.formatMessage(dto.merchantId, dto.message);

    // Проверяем лимиты
    await this.checkLimits(dto.merchantId);

    // Отправляем SMS
    const result = await this.provider.sendSms({
      phone,
      message,
      translit: false, // Кириллица для русских клиентов
      test: this.configService.get('SMS_TEST_MODE') === 'true',
    });

    // Сохраняем в БД
    await this.prisma.smsNotification.create({
      data: {
        merchantId: dto.merchantId,
        customerId: dto.customerId,
        phone,
        message,
        type: dto.type,
        status: result.status,
        messageId: result.id,
        cost: result.cost || 0,
        parts: result.parts || 1,
        campaignId: dto.campaignId,
        metadata: dto.metadata,
        error: result.error,
      },
    });

    // Обновляем баланс и статистику
    if (result.status === 'sent') {
      await this.updateStats(dto.merchantId, result.cost || 0);
    }

    return result;
  }

  /**
   * Отправить массовую рассылку
   */
  async sendBulkNotification(
    merchantId: string,
    customerIds: string[],
    message: string,
    campaignId?: string
  ) {
    // Получаем клиентов с телефонами
    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        phone: { not: null },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    // Фильтруем по согласиям
    const consents = await this.prisma.customerConsent.findMany({
      where: {
        customerId: { in: customers.map(c => c.id) },
        merchantId,
        channel: 'SMS',
        status: 'GRANTED',
      },
      select: {
        customerId: true,
      },
    });

    const consentedIds = new Set(consents.map(c => c.customerId));
    const validCustomers = customers.filter(c => consentedIds.has(c.id));

    if (validCustomers.length === 0) {
      return {
        total: customerIds.length,
        sent: 0,
        failed: 0,
        message: 'Нет клиентов с согласием на SMS рассылку',
      };
    }

    // Проверяем лимиты
    await this.checkLimits(merchantId);

    // Форматируем сообщение
    const formattedMessage = await this.formatMessage(merchantId, message);

    // Подготавливаем массовую отправку
    const messages = validCustomers.map(customer => ({
      phone: customer.phone!,
      message: formattedMessage,
      clientId: customer.id,
    }));

    // Отправляем
    const result = await this.provider.sendBulkSms!({
      messages,
      translit: false,
    });

    // Сохраняем результаты в БД
    for (const msg of result.messages) {
      const customer = validCustomers.find(c => c.phone === msg.phone);
      await this.prisma.smsNotification.create({
        data: {
          merchantId,
          customerId: customer?.id,
          phone: msg.phone,
          message: formattedMessage,
          type: 'MARKETING',
          status: msg.status === 'sent' ? 'sent' : 'failed',
          messageId: msg.id || '',
          campaignId,
          error: msg.error,
        },
      });
    }

    // Обновляем статистику
    await this.updateStats(merchantId, result.cost);

    return {
      total: messages.length,
      sent: result.sent,
      failed: result.failed,
      cost: result.cost,
    };
  }

  /**
   * Отправить OTP код
   */
  async sendOtp(phone: string, code: string, merchantId?: string) {
    const message = `Ваш код подтверждения: ${code}. Никому не сообщайте этот код.`;
    
    const result = await this.provider.sendSms({
      phone,
      message,
      translit: false,
      test: false, // OTP всегда отправляем по-настоящему
    });

    // Сохраняем OTP
    await this.prisma.otpCode.create({
      data: {
        phone,
        code,
        type: 'SMS',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 минут
        merchantId,
      },
    });

    if (merchantId) {
      await this.prisma.smsNotification.create({
        data: {
          merchantId,
          phone,
          message,
          type: 'OTP',
          status: result.status,
          messageId: result.id,
          cost: result.cost || 0,
        },
      });
    }

    return result;
  }

  /**
   * Проверка согласия на рассылку
   */
  private async checkConsent(
    merchantId: string,
    customerIdOrPhone: string,
    channel: string
  ): Promise<boolean> {
    // Сначала пробуем найти по ID клиента
    let consent = await this.prisma.customerConsent.findFirst({
      where: {
        customerId: customerIdOrPhone,
        merchantId,
        channel,
        status: 'GRANTED',
      },
    });

    // Если не нашли, пробуем по телефону
    if (!consent) {
      const customer = await this.prisma.customer.findFirst({
        where: { phone: customerIdOrPhone },
      });

      if (customer) {
        consent = await this.prisma.customerConsent.findFirst({
          where: {
            customerId: customer.id,
            merchantId,
            channel,
            status: 'GRANTED',
          },
        });
      }
    }

    return !!consent;
  }

  /**
   * Проверка лимитов отправки
   */
  private async checkLimits(merchantId: string) {
    // Проверяем подписку
    const subscription = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      throw new BadRequestException('Требуется активная подписка для отправки SMS');
    }

    const plan = subscription.plan as any;
    
    // Проверяем лимит SMS в месяц
    if (plan.maxSmsPerMonth) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const sentThisMonth = await this.prisma.smsNotification.count({
        where: {
          merchantId,
          createdAt: { gte: startOfMonth },
          status: { in: ['sent', 'delivered'] },
        },
      });

      if (sentThisMonth >= plan.maxSmsPerMonth) {
        throw new BadRequestException(
          `Достигнут лимит SMS для вашего плана (${plan.maxSmsPerMonth} в месяц)`
        );
      }
    }

    // Проверяем баланс SMS
    const balance = await this.provider.checkBalance();
    if (balance.balance < 1) {
      throw new BadRequestException('Недостаточно средств для отправки SMS');
    }
  }

  /**
   * Форматирование сообщения
   */
  private async formatMessage(merchantId: string, message: string): Promise<string> {
    // Получаем информацию о мерчанте
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });

    if (!merchant) {
      return message;
    }

    // Добавляем подпись мерчанта
    const signature = merchant.settings?.smsSignature || merchant.name;
    const formattedMessage = `${signature}: ${message}`;

    // Проверяем длину (70 символов для кириллицы в одной SMS)
    if (formattedMessage.length > 70) {
      // Обрезаем сообщение, оставляя место для "..."
      const maxLength = 67;
      return formattedMessage.substring(0, maxLength) + '...';
    }

    return formattedMessage;
  }

  /**
   * Обновление статистики
   */
  private async updateStats(merchantId: string, cost: number) {
    // Обновляем расходы мерчанта на SMS
    await this.prisma.merchantStats.upsert({
      where: { merchantId },
      create: {
        merchantId,
        smsSent: 1,
        smsCost: cost,
      },
      update: {
        smsSent: { increment: 1 },
        smsCost: { increment: cost },
      },
    });
  }

  /**
   * Получить статистику SMS
   */
  async getSmsStats(merchantId: string, period?: { from: Date; to: Date }) {
    const where: any = { merchantId };
    if (period) {
      where.createdAt = {
        gte: period.from,
        lte: period.to,
      };
    }

    const [
      total,
      sent,
      delivered,
      failed,
      totalCost,
      byType,
    ] = await Promise.all([
      this.prisma.smsNotification.count({ where }),
      this.prisma.smsNotification.count({ 
        where: { ...where, status: 'sent' } 
      }),
      this.prisma.smsNotification.count({ 
        where: { ...where, status: 'delivered' } 
      }),
      this.prisma.smsNotification.count({ 
        where: { ...where, status: 'failed' } 
      }),
      this.prisma.smsNotification.aggregate({
        where,
        _sum: { cost: true },
      }),
      this.prisma.smsNotification.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    const balance = await this.provider.checkBalance();

    return {
      total,
      sent,
      delivered,
      failed,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      totalCost: totalCost._sum.cost || 0,
      avgCost: total > 0 ? (totalCost._sum.cost || 0) / total : 0,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {} as Record<string, number>),
      currentBalance: balance.balance,
      currency: balance.currency,
    };
  }

  /**
   * Шаблоны SMS для малого бизнеса
   */
  getSmsTemplates() {
    return [
      {
        id: 'welcome',
        name: 'Приветствие',
        message: 'Добро пожаловать! Вам начислено {points} баллов. Покажите это SMS на кассе.',
        variables: ['points'],
      },
      {
        id: 'birthday',
        name: 'День рождения',
        message: 'С Днем Рождения! Дарим скидку {discount}% на любую покупку сегодня!',
        variables: ['discount'],
      },
      {
        id: 'points_earned',
        name: 'Начисление баллов',
        message: 'Начислено {points} баллов. Баланс: {balance}. Спасибо за покупку!',
        variables: ['points', 'balance'],
      },
      {
        id: 'points_spent',
        name: 'Списание баллов',
        message: 'Списано {points} баллов. Остаток: {balance}.',
        variables: ['points', 'balance'],
      },
      {
        id: 'promo',
        name: 'Акция',
        message: '{promo_text} Действует до {date}. Подробности в магазине.',
        variables: ['promo_text', 'date'],
      },
      {
        id: 'reminder',
        name: 'Напоминание',
        message: 'У вас {points} баллов! Приходите за покупками до {date}.',
        variables: ['points', 'date'],
      },
      {
        id: 'referral',
        name: 'Реферальная программа',
        message: 'Приведите друга и получите {bonus} баллов! Ваш код: {code}',
        variables: ['bonus', 'code'],
      },
    ];
  }
}
