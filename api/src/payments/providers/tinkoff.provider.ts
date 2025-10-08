import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PaymentProvider,
  CreatePaymentParams,
  PaymentResult,
  PaymentStatus,
  RefundResult,
  CreateSubscriptionParams,
  SubscriptionResult,
  WebhookResult,
} from '../payment-provider.interface';

/**
 * Тинькофф Касса - платежный провайдер от Тинькофф Банка
 * Документация: https://www.tinkoff.ru/kassa/develop/api/
 */
@Injectable()
export class TinkoffProvider implements PaymentProvider {
  private readonly apiUrl: string;
  private readonly terminalKey: string;
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.apiUrl =
      this.configService.get('TINKOFF_API_URL') ||
      'https://securepay.tinkoff.ru/v2';
    this.terminalKey = this.configService.get('TINKOFF_TERMINAL_KEY') || '';
    this.secretKey = this.configService.get('TINKOFF_SECRET_KEY') || '';
  }

  /**
   * Генерация токена для подписи запроса
   */
  private generateToken(data: any): string {
    const values: any = {
      ...data,
      Password: this.secretKey,
    };

    // Удаляем Receipt и DATA из подписи
    delete values.Receipt;
    delete values.DATA;
    delete values.Token;

    // Сортируем ключи и конкатенируем значения
    const sortedKeys = Object.keys(values).sort();
    const concatenated = sortedKeys.map((key) => values[key]).join('');

    // Генерируем SHA-256 хеш
    return crypto.createHash('sha256').update(concatenated).digest('hex');
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const orderId = `${params.orderId}_${Date.now()}`;

    const requestData = {
      TerminalKey: this.terminalKey,
      Amount: params.amount, // в копейках
      OrderId: orderId,
      Description: params.description,
      CustomerKey: params.customerId,
      SuccessURL:
        params.returnUrl || this.configService.get('PAYMENT_RETURN_URL'),
      FailURL: params.returnUrl || this.configService.get('PAYMENT_RETURN_URL'),
      NotificationURL: this.configService.get('TINKOFF_NOTIFICATION_URL'),
      DATA: {
        ...params.metadata,
        orderId: params.orderId,
        customerId: params.customerId,
      },
      // Для сохранения карты для рекуррентных платежей
      Recurrent: params.savePaymentMethod ? 'Y' : 'N',
    };

    // Добавляем токен
    const token = this.generateToken(requestData);
    const body = { ...requestData, Token: token };

    const response = await fetch(`${this.apiUrl}/Init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Tinkoff API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Tinkoff error: ${data.ErrorCode} - ${data.Message || 'Payment creation failed'}`,
      );
    }

    return {
      id: data.PaymentId,
      status: 'pending',
      confirmationUrl: data.PaymentURL,
      amount: params.amount,
      currency: params.currency || 'RUB',
      createdAt: new Date(),
      metadata: params.metadata,
    };
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const requestData = {
      TerminalKey: this.terminalKey,
      PaymentId: paymentId,
    };

    const token = this.generateToken(requestData);
    const body = { ...requestData, Token: token };

    const response = await fetch(`${this.apiUrl}/GetState`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to check payment status: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Tinkoff error: ${data.ErrorCode} - ${data.Message || 'Status check failed'}`,
      );
    }

    return {
      id: data.PaymentId,
      status: this.mapStatus(data.Status),
      paid: data.Status === 'CONFIRMED',
      amount: data.Amount,
      currency: 'RUB',
      paymentMethod: data.CardId
        ? {
            type: 'card',
            id: data.CardId,
            card: {
              last4: data.Pan ? data.Pan.slice(-4) : undefined,
            },
          }
        : undefined,
      createdAt: new Date(),
      metadata: data.DATA,
    };
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<RefundResult> {
    const requestData: any = {
      TerminalKey: this.terminalKey,
      PaymentId: paymentId,
    };

    if (amount !== undefined) {
      requestData.Amount = amount; // уже в копейках
    }

    const token = this.generateToken(requestData);
    const body = { ...requestData, Token: token };

    const response = await fetch(`${this.apiUrl}/Cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Refund failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Refund failed: ${data.ErrorCode} - ${data.Message || 'Refund error'}`,
      );
    }

    return {
      id: data.PaymentId,
      status:
        data.Status === 'REFUNDED' || data.Status === 'PARTIAL_REFUNDED'
          ? 'succeeded'
          : 'failed',
      amount: data.Amount || amount || 0,
      currency: 'RUB',
      createdAt: new Date(),
    };
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<SubscriptionResult> {
    // Тинькофф поддерживает рекуррентные платежи через сохраненные карты
    // Сначала нужно провести первый платеж с Recurrent: 'Y', затем использовать RebillId

    if (!params.paymentMethodId) {
      throw new Error(
        'Payment method ID (RebillId) is required for Tinkoff subscriptions',
      );
    }

    // Создаем рекуррентный платеж
    const requestData = {
      TerminalKey: this.terminalKey,
      Amount: params.metadata?.amount || 0,
      OrderId: `sub_${params.customerId}_${Date.now()}`,
      Description: `Подписка ${params.planId}`,
      CustomerKey: params.customerId,
      RebillId: params.paymentMethodId, // ID сохраненной карты
      DATA: {
        ...params.metadata,
        planId: params.planId,
        customerId: params.customerId,
      },
    };

    const token = this.generateToken(requestData);
    const body = { ...requestData, Token: token };

    const response = await fetch(`${this.apiUrl}/Init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Subscription creation failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Subscription creation failed: ${data.ErrorCode} - ${data.Message}`,
      );
    }

    // Автоматически подтверждаем платеж
    await this.chargeSubscription(data.PaymentId);

    return {
      id: data.PaymentId,
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 дней
      trialEnd: params.trialDays
        ? new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000)
        : undefined,
      planId: params.planId,
      customerId: params.customerId,
    };
  }

  private async chargeSubscription(paymentId: string): Promise<void> {
    const requestData = {
      TerminalKey: this.terminalKey,
      PaymentId: paymentId,
    };

    const token = this.generateToken(requestData);
    const body = { ...requestData, Token: token };

    const response = await fetch(`${this.apiUrl}/Charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Charge failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(`Charge failed: ${data.ErrorCode} - ${data.Message}`);
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // В Тинькофф нет встроенных подписок
    // Просто отменяем последний платеж
    await this.refundPayment(subscriptionId);
  }

  async processWebhook(body: any, headers: any): Promise<WebhookResult> {
    // Проверяем токен
    const providedToken = body.Token;
    delete body.Token;

    const expectedToken = this.generateToken(body);
    if (providedToken !== expectedToken) {
      throw new Error('Invalid webhook signature');
    }

    let type: WebhookResult['type'];

    switch (body.Status) {
      case 'CONFIRMED':
        type = 'payment.succeeded';
        break;
      case 'REJECTED':
      case 'DEADLINE_EXPIRED':
        type = 'payment.failed';
        break;
      case 'CANCELED':
      case 'REFUNDED':
      case 'PARTIAL_REFUNDED':
        type = body.Status.includes('REFUND')
          ? 'refund.succeeded'
          : 'payment.canceled';
        break;
      default:
        // Игнорируем промежуточные статусы
        type = 'payment.succeeded';
    }

    return {
      type,
      paymentId: body.PaymentId,
      status: body.Status,
      amount: body.Amount,
      metadata: body.DATA,
    };
  }

  private mapStatus(tinkoffStatus: string): PaymentStatus['status'] {
    switch (tinkoffStatus) {
      case 'NEW':
      case 'FORM_SHOWED':
        return 'pending';
      case 'AUTHORIZING':
      case 'AUTHORIZED':
      case 'CONFIRMING':
        return 'waiting_for_capture';
      case 'CONFIRMED':
        return 'succeeded';
      case 'CANCELED':
      case 'REVERSED':
      case 'REFUNDED':
      case 'PARTIAL_REFUNDED':
        return 'canceled';
      case 'REJECTED':
      case 'DEADLINE_EXPIRED':
        return 'failed';
      default:
        return 'pending';
    }
  }
}
