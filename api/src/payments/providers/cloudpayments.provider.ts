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
 * CloudPayments - популярный российский платежный провайдер
 * Документация: https://developers.cloudpayments.ru
 */
@Injectable()
export class CloudPaymentsProvider implements PaymentProvider {
  private readonly apiUrl = 'https://api.cloudpayments.ru';
  private readonly publicId: string;
  private readonly apiSecret: string;

  constructor(private configService: ConfigService) {
    this.publicId = this.configService.get('CLOUDPAYMENTS_PUBLIC_ID') || '';
    this.apiSecret = this.configService.get('CLOUDPAYMENTS_API_SECRET') || '';
  }

  private getAuthHeader(): string {
    return (
      'Basic ' +
      Buffer.from(`${this.publicId}:${this.apiSecret}`).toString('base64')
    );
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    // CloudPayments требует создания виджета на frontend и обработки токена
    // Здесь мы создаем invoice для оплаты по ссылке
    const response = await fetch(`${this.apiUrl}/orders/create`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Amount: params.amount / 100, // конвертируем копейки в рубли
        Currency: params.currency || 'RUB',
        Description: params.description,
        Email: params.metadata?.email,
        RequireConfirmation: false,
        SendEmail: false,
        InvoiceId: params.orderId,
        AccountId: params.customerId,
        JsonData: {
          ...params.metadata,
          orderId: params.orderId,
          customerId: params.customerId,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `CloudPayments error: ${error.Message || 'Unknown error'}`,
      );
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `CloudPayments error: ${data.Message || 'Payment creation failed'}`,
      );
    }

    return {
      id: data.Model.Id,
      status: 'pending',
      confirmationUrl: data.Model.Url,
      amount: params.amount,
      currency: params.currency,
      createdAt: new Date(),
      metadata: params.metadata,
    };
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const response = await fetch(`${this.apiUrl}/payments/get`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `TransactionId=${paymentId}`,
    });

    if (!response.ok) {
      throw new Error(`Failed to check payment status: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `CloudPayments error: ${data.Message || 'Status check failed'}`,
      );
    }

    const payment = data.Model;

    return {
      id: payment.TransactionId.toString(),
      status: this.mapStatus(payment.Status),
      paid: payment.Status === 'Completed',
      amount: Math.round(payment.Amount * 100), // конвертируем в копейки
      currency: payment.Currency,
      paymentMethod: payment.CardLastFour
        ? {
            type: 'card',
            card: {
              last4: payment.CardLastFour,
              cardType: payment.CardType,
            },
          }
        : undefined,
      createdAt: new Date(payment.CreatedDate),
      metadata: payment.JsonData,
    };
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<RefundResult> {
    const body: any = {
      TransactionId: paymentId,
    };

    if (amount !== undefined) {
      body.Amount = amount / 100; // конвертируем в рубли
    }

    const response = await fetch(`${this.apiUrl}/payments/refund`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Refund failed: ${error.Message || 'Unknown error'}`);
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(`Refund failed: ${data.Message || 'Refund error'}`);
    }

    return {
      id: data.Model.TransactionId.toString(),
      status: 'succeeded',
      amount: Math.round(data.Model.Amount * 100), // конвертируем в копейки
      currency: 'RUB',
      createdAt: new Date(),
    };
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<SubscriptionResult> {
    // CloudPayments поддерживает рекуррентные платежи
    const response = await fetch(`${this.apiUrl}/subscriptions/create`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Token: params.paymentMethodId, // токен карты от первого платежа
        AccountId: params.customerId,
        Description: `Подписка ${params.planId}`,
        Email: params.metadata?.email,
        Amount: params.metadata?.amount || 0,
        Currency: 'RUB',
        RequireConfirmation: false,
        StartDate: new Date().toISOString(),
        Interval: 'Month',
        Period: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Subscription creation failed: ${error.Message || 'Unknown error'}`,
      );
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Subscription creation failed: ${data.Message || 'Error'}`,
      );
    }

    return {
      id: data.Model.Id,
      status: 'active',
      currentPeriodEnd: new Date(data.Model.NextTransactionDate),
      trialEnd: params.trialDays
        ? new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000)
        : undefined,
      planId: params.planId,
      customerId: params.customerId,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/subscriptions/cancel`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `Id=${subscriptionId}`,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Subscription cancellation failed: ${error.Message || 'Unknown error'}`,
      );
    }

    const data = await response.json();

    if (!data.Success) {
      throw new Error(
        `Subscription cancellation failed: ${data.Message || 'Error'}`,
      );
    }
  }

  async processWebhook(body: any, headers: any): Promise<WebhookResult> {
    // Проверяем подпись
    if (!this.verifyWebhookSignature(body, headers)) {
      throw new Error('Invalid webhook signature');
    }

    let type: WebhookResult['type'];

    switch (body.Type) {
      case 'Pay':
        type = 'payment.succeeded';
        break;
      case 'Fail':
        type = 'payment.failed';
        break;
      case 'Refund':
        type = 'refund.succeeded';
        break;
      case 'Recurrent':
        type = 'payment.succeeded';
        break;
      case 'Cancel':
        type = 'payment.canceled';
        break;
      default:
        throw new Error(`Unknown webhook type: ${body.Type}`);
    }

    return {
      type,
      paymentId: body.TransactionId?.toString(),
      subscriptionId: body.SubscriptionId?.toString(),
      status: body.Status,
      amount: Math.round((body.Amount || 0) * 100), // конвертируем в копейки
      metadata: body.Data || body.JsonData,
    };
  }

  private verifyWebhookSignature(body: any, headers: any): boolean {
    const signature = headers['content-hmac'] || headers['Content-HMAC'];
    if (!signature) return false;

    const message = Buffer.from(JSON.stringify(body)).toString('base64');
    const hmac = crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');

    return hmac === signature;
  }

  private mapStatus(cloudPaymentsStatus: string): PaymentStatus['status'] {
    switch (cloudPaymentsStatus) {
      case 'Authorized':
        return 'waiting_for_capture';
      case 'Completed':
        return 'succeeded';
      case 'Cancelled':
        return 'canceled';
      case 'Declined':
        return 'failed';
      default:
        return 'pending';
    }
  }
}
