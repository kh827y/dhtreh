import { Injectable } from '@nestjs/common';
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
 * Mock-провайдер оплат для DEV/пилотов. Не делает внешних запросов.
 * Используется при PAYMENT_PROVIDER=mock
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const id = 'pay_' + Math.random().toString(36).slice(2, 12);
    return {
      id,
      status: 'pending',
      confirmationUrl: `http://localhost:3001/mock-pay?paymentId=${encodeURIComponent(id)}`,
      amount: params.amount,
      currency: params.currency,
      createdAt: new Date(),
      metadata: params.metadata,
    };
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // В DEV считаем, что после создания оплата «успешна»
    return {
      id: paymentId,
      status: 'succeeded',
      paid: true,
      amount: 0,
      currency: 'RUB',
      createdAt: new Date(),
      metadata: { mock: true },
    } as any;
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<RefundResult> {
    return {
      id: 'refund_' + paymentId,
      status: 'succeeded',
      amount: amount ?? 0,
      currency: 'RUB',
      createdAt: new Date(),
    };
  }

  async processWebhook(body: any, headers: any): Promise<WebhookResult> {
    return {
      type: 'payment.succeeded',
      paymentId: body?.object?.id || 'mock',
      status: 'succeeded',
      amount: body?.object?.amount || 0,
      metadata: body?.object?.metadata || {},
    };
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<SubscriptionResult> {
    return {
      id: 'sub_' + Math.random().toString(36).slice(2, 12),
      status: 'active',
      createdAt: new Date(),
    } as any;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    return;
  }
}
