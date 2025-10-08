import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import * as crypto from 'crypto';
import { validateIntegrationConfig } from '../config.schema';

interface EvotorDevice {
  uuid: string;
  name: string;
  storeUuid: string;
  timezone: string;
}

interface EvotorReceipt {
  uuid: string;
  deviceUuid: string;
  storeUuid: string;
  dateTime: string;
  type: 'SELL' | 'PAYBACK' | 'BUY' | 'BUYBACK';
  shiftNumber: number;
  documentNumber: number;
  documentIndex: number;
  processedAt: string;
  fiscal: boolean;
  fiscalSign: string;
  positions: Array<{
    uuid: string;
    name: string;
    price: number;
    quantity: number;
    sum: number;
    tax: number;
    taxPercent: number;
    discount: number;
  }>;
  payments: Array<{
    type: string;
    sum: number;
  }>;
  clientPhone?: string;
  clientEmail?: string;
  total: number;
}

interface EvotorWebhook {
  id: string;
  timestamp: string;
  type: string;
  data: any;
  signature: string;
}

@Injectable()
export class EvotorService {
  private readonly logger = new Logger(EvotorService.name);
  private readonly API_URL = 'https://api.evotor.ru/api/v1';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private async resolveOutletId(
    merchantId: string,
    receipt: EvotorReceipt,
  ): Promise<string | null> {
    const prismaAny = this.prisma as any;
    if (receipt.storeUuid) {
      try {
        const outlet = await prismaAny.outlet.findFirst({
          where: {
            merchantId,
            OR: [
              { externalId: receipt.storeUuid },
              { integrationLocationCode: receipt.storeUuid },
            ],
          },
          select: { id: true },
        });
        if (outlet?.id) {
          return outlet.id as string;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Регистрация приложения в маркетплейсе Эвотор
   */
  async registerApp(merchantId: string, evotorToken: string) {
    try {
      const config = {
        appId: this.configService.get('EVOTOR_APP_ID'),
        appSecret: this.configService.get('EVOTOR_APP_SECRET'),
        token: evotorToken,
      };

      // Получаем информацию о магазинах и устройствах
      const stores = await this.getStores(config.token);
      const devices = await this.getDevices(config.token);

      // Сохраняем конфигурацию интеграции (с валидацией схемы)
      const prismaAny = this.prisma as any;
      const evotorCfg = {
        stores,
        devices,
        webhookUrl: `${this.configService.get('API_BASE_URL')}/integrations/evotor/webhook`,
      };
      const valid = validateIntegrationConfig('EVOTOR', evotorCfg);
      if (!valid.ok) {
        throw new Error('Evotor config invalid: ' + valid.errors.join('; '));
      }
      const integration = await prismaAny.integration.create({
        data: {
          merchantId,
          type: 'POS',
          provider: 'EVOTOR',
          config: evotorCfg,
          credentials: {
            token: evotorToken,
            appId: config.appId,
          },
          isActive: true,
        },
      });

      // Подписываемся на вебхуки
      await this.subscribeToWebhooks(evotorToken, integration.id);

      return {
        success: true,
        integrationId: integration.id,
        devicesCount: devices.length,
        storesCount: stores.length,
      };
    } catch (error) {
      this.logger.error('Ошибка регистрации приложения Эвотор:', error);
      throw error;
    }
  }

  /**
   * Получение списка магазинов
   */
  private async getStores(token: string) {
    const response = await fetch(`${this.API_URL}/stores`, {
      headers: {
        'X-Authorization': token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Эвотор API error: ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Получение списка устройств
   */
  private async getDevices(token: string) {
    const response = await fetch(`${this.API_URL}/devices`, {
      headers: {
        'X-Authorization': token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Эвотор API error: ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Подписка на вебхуки
   */
  private async subscribeToWebhooks(token: string, integrationId: string) {
    const webhookUrl = `${this.configService.get('API_BASE_URL')}/integrations/evotor/webhook/${integrationId}`;

    const events = [
      'receipt.sell',
      'receipt.payback',
      'receipt.buy',
      'receipt.buyback',
      'shift.opened',
      'shift.closed',
    ];

    for (const event of events) {
      await fetch(`${this.API_URL}/webhooks`, {
        method: 'POST',
        headers: {
          'X-Authorization': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          event,
        }),
      });
    }
  }

  /**
   * Обработка вебхука от Эвотор
   */
  async handleWebhook(integrationId: string, webhook: EvotorWebhook) {
    const prismaAny = this.prisma as any;
    try {
      // Проверяем подпись
      if (!this.verifyWebhookSignature(webhook)) {
        throw new Error('Invalid webhook signature');
      }

      const integration = await prismaAny.integration.findUnique({
        where: { id: integrationId },
      });

      if (!integration || !integration.isActive) {
        throw new Error('Integration not found or inactive');
      }

      const merchantId = integration.merchantId;

      switch (webhook.type) {
        case 'receipt.sell':
          await this.handleSellReceipt(merchantId, webhook.data);
          break;
        case 'receipt.payback':
          await this.handlePaybackReceipt(merchantId, webhook.data);
          break;
        default:
          this.logger.log(`Unhandled webhook type: ${webhook.type}`);
      }

      // Обновляем lastSync
      await prismaAny.integration.update({
        where: { id: integrationId },
        data: { lastSync: new Date() },
      });

      // Журнал синхронизаций: входящий вебхук
      try {
        await prismaAny.syncLog.create({
          data: {
            merchantId,
            integrationId,
            provider: 'EVOTOR',
            direction: 'IN',
            endpoint: 'webhook',
            status: 'ok',
            request: webhook as any,
            response: { ok: true, type: webhook.type } as any,
          },
        });
      } catch {}

      return { success: true };
    } catch (error) {
      this.logger.error('Ошибка обработки вебхука Эвотор:', error);

      // Увеличиваем счетчик ошибок
      await prismaAny.integration.update({
        where: { id: integrationId },
        data: {
          errorCount: { increment: 1 },
          lastError: error.message,
        },
      });

      // Журнал синхронизаций: ошибка входящего вебхука
      try {
        await prismaAny.syncLog.create({
          data: {
            integrationId,
            provider: 'EVOTOR',
            direction: 'IN',
            endpoint: 'webhook',
            status: 'error',
            request: webhook as any,
            error: String(error?.message || error) as any,
          },
        });
      } catch {}

      throw error;
    }
  }

  /**
   * Обработка чека продажи
   */
  private async handleSellReceipt(merchantId: string, receipt: EvotorReceipt) {
    try {
      const outletId = await this.resolveOutletId(merchantId, receipt);
      const orderId = `evotor_${receipt.uuid}`;

      // Извлекаем телефон клиента
      const customerPhone = receipt.clientPhone;
      if (!customerPhone) {
        this.logger.log('Чек без телефона клиента, пропускаем');
        return;
      }

      // Находим или создаем клиента
      let customer = await this.prisma.customer.findUnique({
        where: { phone: customerPhone },
      });

      if (!customer) {
        customer = await this.prisma.customer.create({
          data: { phone: customerPhone },
        });
      }

      // Рассчитываем баллы (если нет программы лояльности в чеке)
      const loyaltyData = await this.calculateLoyaltyForReceipt(
        merchantId,
        customer.id,
        receipt,
      );

      if (loyaltyData.hasLoyalty) {
        // Если в чеке уже была программа лояльности, синхронизируем
        await this.syncLoyaltyTransaction(
          merchantId,
          customer.id,
          orderId,
          loyaltyData,
        );
      } else {
        // Автоматически начисляем баллы
        await this.autoProcessLoyalty(
          merchantId,
          customer.id,
          orderId,
          receipt.total,
          outletId ?? undefined,
        );
      }

      // Отправляем уведомление клиенту
      await this.sendCustomerNotification(
        customer.id,
        merchantId,
        `Спасибо за покупку! Начислено ${loyaltyData.earnedPoints} баллов.`,
      );
    } catch (error) {
      this.logger.error('Ошибка обработки чека продажи:', error);
      throw error;
    }
  }

  /**
   * Обработка чека возврата
   */
  private async handlePaybackReceipt(
    merchantId: string,
    receipt: EvotorReceipt,
  ) {
    try {
      const originalOrderId = this.extractOriginalOrderId(receipt);
      if (!originalOrderId) {
        this.logger.warn(
          'Не удалось определить оригинальный заказ для возврата',
        );
        return;
      }

      // Выполняем возврат в программе лояльности
      const apiUrl = this.configService.get('API_BASE_URL');
      const outletId = await this.resolveOutletId(merchantId, receipt);
      const response = await fetch(`${apiUrl}/loyalty/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration': 'evotor',
        },
        body: JSON.stringify({
          merchantId,
          orderId: originalOrderId,
          refundTotal: Math.abs(receipt.total),
          ...(outletId ? { outletId } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Loyalty refund failed: ${await response.text()}`);
      }

      const result = await response.json();
      this.logger.log(`Возврат обработан: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('Ошибка обработки чека возврата:', error);
      throw error;
    }
  }

  /**
   * Расчет программы лояльности для чека
   */
  private async calculateLoyaltyForReceipt(
    merchantId: string,
    customerId: string,
    receipt: EvotorReceipt,
  ) {
    // Проверяем, есть ли в чеке информация о программе лояльности
    const loyaltyPosition = receipt.positions.find(
      (p) =>
        p.name.includes('Скидка программы лояльности') ||
        p.name.includes('Баллы'),
    );

    if (loyaltyPosition) {
      return {
        hasLoyalty: true,
        discountApplied: Math.abs(loyaltyPosition.sum),
        earnedPoints: 0, // Нужно рассчитать на основе правил
      };
    }

    // Рассчитываем баллы для начисления
    const eligibleTotal = receipt.positions
      .filter((p) => !p.name.includes('Скидка'))
      .reduce((sum, p) => sum + p.sum, 0);

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const earnBps = settings?.earnBps || 500; // 5% по умолчанию
    const earnedPoints = Math.floor((eligibleTotal * earnBps) / 10000);

    return {
      hasLoyalty: false,
      discountApplied: 0,
      earnedPoints,
    };
  }

  /**
   * Автоматическая обработка лояльности
   */
  private async autoProcessLoyalty(
    merchantId: string,
    customerId: string,
    orderId: string,
    total: number,
    outletId?: string,
  ) {
    try {
      const apiUrl = this.configService.get('API_BASE_URL');

      // 1. Генерируем виртуальный QR для клиента
      const qrResponse = await fetch(`${apiUrl}/loyalty/qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration': 'evotor',
        },
        body: JSON.stringify({
          customerId,
          merchantId,
          ttlSec: 300,
        }),
      });

      if (!qrResponse.ok) {
        throw new Error('Failed to generate QR');
      }

      const { token } = await qrResponse.json();

      // 2. Создаем quote для начисления
      const quoteResponse = await fetch(`${apiUrl}/loyalty/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration': 'evotor',
        },
        body: JSON.stringify({
          mode: 'earn',
          merchantId,
          userToken: token,
          orderId,
          total,
          eligibleTotal: total,
          ...(outletId ? { outletId } : {}),
        }),
      });

      if (!quoteResponse.ok) {
        throw new Error('Failed to create quote');
      }

      const quote = await quoteResponse.json();

      // 3. Подтверждаем транзакцию
      const commitResponse = await fetch(`${apiUrl}/loyalty/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration': 'evotor',
        },
        body: JSON.stringify({
          merchantId,
          holdId: quote.holdId,
          orderId,
          receiptNumber: orderId,
        }),
      });

      if (!commitResponse.ok) {
        throw new Error('Failed to commit transaction');
      }

      const result = await commitResponse.json();
      this.logger.log(
        `Автоматически начислено ${result.earnApplied} баллов для заказа ${orderId}`,
      );
    } catch (error) {
      this.logger.error('Ошибка автоматической обработки лояльности:', error);
    }
  }

  /**
   * Синхронизация транзакции лояльности
   */
  private async syncLoyaltyTransaction(
    merchantId: string,
    customerId: string,
    orderId: string,
    loyaltyData: any,
  ) {
    // Проверяем, не была ли транзакция уже синхронизирована
    const existing = await this.prisma.receipt.findUnique({
      where: {
        merchantId_orderId: {
          merchantId,
          orderId,
        },
      },
    });

    if (existing) {
      this.logger.log(`Транзакция ${orderId} уже синхронизирована`);
      return;
    }

    // Создаем запись о транзакции
    await this.prisma.receipt.create({
      data: {
        merchantId,
        customerId,
        orderId,
        total: loyaltyData.total || 0,
        eligibleTotal: loyaltyData.eligibleTotal || 0,
        redeemApplied: loyaltyData.discountApplied || 0,
        earnApplied: loyaltyData.earnedPoints || 0,
      },
    });

    // Обновляем баланс клиента
    if (loyaltyData.earnedPoints > 0) {
      await this.updateCustomerBalance(
        merchantId,
        customerId,
        loyaltyData.earnedPoints,
      );
    }
  }

  /**
   * Обновление баланса клиента
   */
  private async updateCustomerBalance(
    merchantId: string,
    customerId: string,
    points: number,
  ) {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        merchantId,
        customerId,
        type: 'POINTS',
      },
    });

    if (wallet) {
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: points } },
      });
    } else {
      await this.prisma.wallet.create({
        data: {
          merchantId,
          customerId,
          type: 'POINTS',
          balance: points,
        },
      });
    }
  }

  /**
   * Извлечение ID оригинального заказа из чека возврата
   */
  private extractOriginalOrderId(receipt: EvotorReceipt): string | null {
    // Логика извлечения может варьироваться в зависимости от настроек Эвотор
    // Обычно оригинальный чек указывается в метаданных
    return receipt.fiscal ? `evotor_original_${receipt.fiscalSign}` : null;
  }

  /**
   * Проверка подписи вебхука
   */
  private verifyWebhookSignature(webhook: EvotorWebhook): boolean {
    const secret = this.configService.get('EVOTOR_WEBHOOK_SECRET');
    if (!secret) return true; // Если секрет не настроен, пропускаем проверку

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(webhook.data))
      .digest('hex');

    return webhook.signature === expectedSignature;
  }

  /**
   * Отправка уведомления клиенту
   */
  private async sendCustomerNotification(
    customerId: string,
    merchantId: string,
    message: string,
  ) {
    try {
      // Здесь должна быть интеграция с сервисом уведомлений
      // Например, через Telegram Bot Service
      this.logger.log(`Уведомление для ${customerId}: ${message}`);
    } catch (error) {
      this.logger.error('Ошибка отправки уведомления:', error);
    }
  }

  /**
   * Отправка скидки на кассу Эвотор
   */
  async sendDiscountToDevice(
    deviceUuid: string,
    discount: number,
    description: string,
  ) {
    try {
      const prismaAny = this.prisma as any;
      const integration = await prismaAny.integration.findFirst({
        where: {
          provider: 'EVOTOR',
          isActive: true,
        },
      });

      if (!integration) {
        throw new Error('Эвотор интеграция не найдена');
      }

      const token = integration.credentials.token;

      // Отправляем команду на устройство через Эвотор Cloud API
      const response = await fetch(
        `${this.API_URL}/devices/${deviceUuid}/commands`,
        {
          method: 'POST',
          headers: {
            'X-Authorization': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'ADD_DISCOUNT',
            data: {
              value: discount,
              type: 'ABSOLUTE', // или 'PERCENT'
              description,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to send discount: ${await response.text()}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Ошибка отправки скидки на кассу:', error);
      throw error;
    }
  }

  /**
   * Получение статистики по интеграции
   */
  async getIntegrationStats(merchantId: string) {
    const prismaAny = this.prisma as any;
    const integration = await prismaAny.integration.findFirst({
      where: {
        merchantId,
        provider: 'EVOTOR',
      },
    });

    if (!integration) {
      return null;
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const receipts = await this.prisma.receipt.count({
      where: {
        merchantId,
        createdAt: { gte: since },
        orderId: { startsWith: 'evotor_' },
      },
    });

    const outletCount = await this.prisma.outlet.count({
      where: {
        merchantId,
        OR: [
          { integrationProvider: 'EVOTOR' },
          { integrationLocationCode: { startsWith: 'evotor_' } },
        ],
      },
    });

    return {
      provider: 'EVOTOR',
      isActive: integration.isActive,
      lastSync: integration.lastSync,
      errorCount: integration.errorCount,
      lastError: integration.lastError,
      stats: {
        receiptsProcessed: receipts,
        devicesConnected: outletCount,
        period: '30 days',
      },
    };
  }
}
