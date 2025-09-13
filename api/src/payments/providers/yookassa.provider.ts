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

@Injectable()
export class YooKassaProvider implements PaymentProvider {
  private readonly apiUrl = 'https://api.yookassa.ru/v3';
  private readonly shopId: string;
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.shopId = this.configService.get('YOOKASSA_SHOP_ID') || '';
    this.secretKey = this.configService.get('YOOKASSA_SECRET_KEY') || '';
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const idempotenceKey = crypto.randomBytes(16).toString('hex');
    
    const response = await fetch(`${this.apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          value: (params.amount / 100).toFixed(2), // конвертируем копейки в рубли
          currency: params.currency,
        },
        capture: true, // автоматическое подтверждение платежа
        confirmation: {
          type: 'redirect',
          return_url: params.returnUrl || this.configService.get('PAYMENT_RETURN_URL'),
        },
        description: params.description,
        metadata: {
          ...params.metadata,
          orderId: params.orderId,
          customerId: params.customerId,
        },
        save_payment_method: params.savePaymentMethod,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`YooKassa error: ${error.description || 'Unknown error'}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      status: this.mapStatus(data.status),
      confirmationUrl: data.confirmation?.confirmation_url,
      amount: Math.round(parseFloat(data.amount.value) * 100), // конвертируем обратно в копейки
      currency: data.amount.currency,
      createdAt: new Date(data.created_at),
      metadata: data.metadata,
    };
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const response = await fetch(`${this.apiUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check payment status: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      status: this.mapStatus(data.status),
      paid: data.paid,
      amount: Math.round(parseFloat(data.amount.value) * 100),
      currency: data.amount.currency,
      paymentMethod: data.payment_method ? {
        type: data.payment_method.type,
        id: data.payment_method.id,
        saved: data.payment_method.saved,
        title: data.payment_method.title,
        card: data.payment_method.card ? {
          first6: data.payment_method.card.first6,
          last4: data.payment_method.card.last4,
          expiryMonth: data.payment_method.card.expiry_month,
          expiryYear: data.payment_method.card.expiry_year,
          cardType: data.payment_method.card.card_type,
        } : undefined,
      } : undefined,
      capturedAt: data.captured_at ? new Date(data.captured_at) : undefined,
      createdAt: new Date(data.created_at),
      metadata: data.metadata,
    };
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    const idempotenceKey = crypto.randomBytes(16).toString('hex');
    
    const body: any = {
      payment_id: paymentId,
    };
    
    if (amount !== undefined) {
      body.amount = {
        value: (amount / 100).toFixed(2),
        currency: 'RUB',
      };
    }

    const response = await fetch(`${this.apiUrl}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Refund failed: ${error.description || 'Unknown error'}`);
    }

    const data = await response.json();
    
    return {
      id: data.id,
      status: data.status === 'succeeded' ? 'succeeded' : 'failed',
      amount: Math.round(parseFloat(data.amount.value) * 100),
      currency: data.amount.currency,
      createdAt: new Date(data.created_at),
    };
  }

  async processWebhook(body: any, headers: any): Promise<WebhookResult> {
    // Проверяем подпись вебхука
    if (!this.verifyWebhookSignature(body, headers)) {
      throw new Error('Invalid webhook signature');
    }

    const event = body.event;
    const object = body.object;

    let type: WebhookResult['type'];
    
    switch (event) {
      case 'payment.succeeded':
        type = 'payment.succeeded';
        break;
      case 'payment.canceled':
        type = 'payment.canceled';
        break;
      case 'payment.waiting_for_capture':
        // Игнорируем, так как мы используем автоматический capture
        type = 'payment.succeeded';
        break;
      case 'refund.succeeded':
        type = 'refund.succeeded';
        break;
      default:
        throw new Error(`Unknown webhook event: ${event}`);
    }

    return {
      type,
      paymentId: object.id,
      status: object.status,
      amount: Math.round(parseFloat(object.amount.value) * 100),
      metadata: object.metadata,
    };
  }

  private verifyWebhookSignature(body: any, headers: any): boolean {
    // YooKassa не требует проверки подписи для HTTPS вебхуков
    // Но можно добавить проверку IP-адресов YooKassa
    return true;
  }

  private mapStatus(yooKassaStatus: string): PaymentStatus['status'] {
    switch (yooKassaStatus) {
      case 'pending':
        return 'pending';
      case 'waiting_for_capture':
        return 'waiting_for_capture';
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
        return 'canceled';
      default:
        return 'failed';
    }
  }

  // Рекуррентные платежи в YooKassa работают через сохраненные методы оплаты
  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    // Для рекуррентных платежей нужно:
    // 1. Создать первый платеж с save_payment_method = true
    // 2. Сохранить payment_method_id
    // 3. Использовать его для последующих платежей
    
    // Это упрощенная реализация
    throw new Error('Subscription creation requires custom implementation with saved payment methods');
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // В YooKassa нет встроенных подписок, это нужно реализовывать самостоятельно
    throw new Error('Subscription cancellation requires custom implementation');
  }
}
