import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface AtolConfig {
  login: string;
  password: string;
  groupCode: string;
  inn: string;
  callbackUrl: string;
}

interface AtolReceipt {
  external_id: string;
  receipt: {
    client: {
      email?: string;
      phone?: string;
    };
    company: {
      inn: string;
      payment_address: string;
    };
    items: Array<{
      name: string;
      price: number;
      quantity: number;
      sum: number;
      vat: {
        type: string;
      };
    }>;
    payments: Array<{
      type: number;
      sum: number;
    }>;
    total: number;
  };
  service?: {
    callback_url: string;
  };
}

@Injectable()
export class AtolService {
  private readonly logger = new Logger(AtolService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private configService: ConfigService) {}

  /**
   * Получение токена доступа АТОЛ
   */
  private async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const config = this.getConfig();
    const response = await fetch('https://online.atol.ru/possystem/v4/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: config.login,
        pass: config.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`АТОЛ auth failed: ${await response.text()}`);
    }

    const data = await response.json();
    this.accessToken = data.token;
    // Токен АТОЛ действует 24 часа, обновляем за час до истечения
    this.tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
    
    return this.accessToken || '';
  }

  /**
   * Интеграция с программой лояльности при фискализации чека
   */
  async processLoyaltyWithReceipt(
    merchantId: string,
    orderId: string,
    receipt: any,
    loyaltyData?: {
      customerId?: string;
      qrToken?: string;
      discountAmount?: number;
      earnedPoints?: number;
    }
  ) {
    try {
      // 1. Если есть данные лояльности, добавляем их в чек
      if (loyaltyData?.discountAmount && loyaltyData.discountAmount > 0) {
        // Добавляем позицию скидки в чек
        receipt.items.push({
          name: 'Скидка по программе лояльности',
          price: -loyaltyData.discountAmount,
          quantity: 1,
          sum: -loyaltyData.discountAmount,
          vat: { type: 'none' },
          payment_method: 'advance',
        });
      }

      // 2. Отправляем чек в АТОЛ
      const fiscalReceipt = await this.sendReceipt(receipt);

      // 3. Формируем callback для нашего API
      if (loyaltyData?.customerId) {
        await this.sendLoyaltyCallback(merchantId, orderId, {
          fiscalId: fiscalReceipt.uuid,
          customerId: loyaltyData.customerId,
          discountApplied: loyaltyData.discountAmount || 0,
          pointsEarned: loyaltyData.earnedPoints || 0,
          receiptUrl: fiscalReceipt.ofd_receipt_url,
        });
      }

      return {
        success: true,
        fiscalId: fiscalReceipt.uuid,
        receiptUrl: fiscalReceipt.ofd_receipt_url,
      };
    } catch (error) {
      this.logger.error('Ошибка обработки лояльности с чеком АТОЛ:', error);
      throw error;
    }
  }

  /**
   * Отправка чека в АТОЛ Онлайн
   */
  private async sendReceipt(receiptData: AtolReceipt) {
    const token = await this.authenticate();
    const config = this.getConfig();

    const response = await fetch(
      `https://online.atol.ru/possystem/v4/${config.groupCode}/sell`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': token,
        },
        body: JSON.stringify(receiptData),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`АТОЛ receipt failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Webhook обработчик от АТОЛ
   */
  async handleAtolWebhook(payload: any) {
    try {
      const { uuid, status, payload: receiptPayload } = payload;

      if (status === 'done') {
        // Чек успешно фискализирован
        const orderId = receiptPayload.external_id;
        
        // Подтверждаем операцию лояльности
        await this.confirmLoyaltyOperation(orderId, {
          fiscalId: uuid,
          fiscalData: receiptPayload,
        });
      } else if (status === 'fail') {
        // Ошибка фискализации - откатываем операцию лояльности
        const orderId = receiptPayload.external_id;
        await this.rollbackLoyaltyOperation(orderId);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Ошибка обработки webhook АТОЛ:', error);
      throw error;
    }
  }

  /**
   * Создание подписи для callback в наш API
   */
  private createCallbackSignature(data: any): string {
    const secret = this.configService.get('LOYALTY_WEBHOOK_SECRET');
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(data);
    
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('base64');

    return `v1,ts=${timestamp},sig=${signature}`;
  }

  /**
   * Отправка callback в наш API о результате фискализации
   */
  private async sendLoyaltyCallback(
    merchantId: string,
    orderId: string,
    data: any
  ) {
    const apiUrl = this.configService.get('API_BASE_URL');
    const signature = this.createCallbackSignature(data);

    const response = await fetch(`${apiUrl}/loyalty/fiscal-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': merchantId,
        'X-Order-Id': orderId,
        'X-Signature': signature,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Loyalty callback failed: ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Подтверждение операции лояльности после успешной фискализации
   */
  private async confirmLoyaltyOperation(orderId: string, fiscalData: any) {
    const apiUrl = this.configService.get('API_BASE_URL');
    
    // Вызываем commit в нашем API
    const response = await fetch(`${apiUrl}/loyalty/fiscal-confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration': 'atol',
      },
      body: JSON.stringify({
        orderId,
        fiscalData,
        confirmedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Loyalty confirmation failed: ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Откат операции лояльности при ошибке фискализации
   */
  private async rollbackLoyaltyOperation(orderId: string) {
    const apiUrl = this.configService.get('API_BASE_URL');
    
    const response = await fetch(`${apiUrl}/loyalty/fiscal-rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration': 'atol',
      },
      body: JSON.stringify({
        orderId,
        reason: 'fiscal_error',
        rolledBackAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      this.logger.error(`Ошибка отката лояльности: ${await response.text()}`);
    }
  }

  /**
   * Получение конфигурации АТОЛ из переменных окружения
   */
  private getConfig(): AtolConfig {
    return {
      login: this.configService.get('ATOL_LOGIN') || '',
      password: this.configService.get('ATOL_PASSWORD') || '',
      groupCode: this.configService.get('ATOL_GROUP_CODE') || '',
      inn: this.configService.get('ATOL_INN') || '',
      callbackUrl: this.configService.get('ATOL_CALLBACK_URL') || '',
    };
  }

  /**
   * Проверка доступности сервиса АТОЛ
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      this.logger.error('АТОЛ health check failed:', error);
      return false;
    }
  }
}
