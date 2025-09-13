import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { PaymentProvider, CreatePaymentParams, WebhookResult } from './payment-provider.interface';
import { YooKassaProvider } from './providers/yookassa.provider';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider';
import { TinkoffProvider } from './providers/tinkoff.provider';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class PaymentService {
  private provider: PaymentProvider;
  private providerName: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => SubscriptionService)) private subscriptionService: SubscriptionService,
  ) {
    // Выбираем провайдера на основе конфигурации
    const providerName = this.configService.get('PAYMENT_PROVIDER') || 'yookassa';
    this.providerName = providerName;
    
    switch (providerName) {
      case 'yookassa':
        this.provider = new YooKassaProvider(configService);
        break;
      case 'cloudpayments':
        this.provider = new CloudPaymentsProvider(configService);
        break;
      case 'tinkoff':
        this.provider = new TinkoffProvider(configService);
        break;
      default:
        this.provider = new YooKassaProvider(configService);
    }
  }

  /**
   * Создать платеж для подписки
   */
  async createSubscriptionPayment(merchantId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new BadRequestException('Подписка не найдена');
    }

    if (subscription.merchantId !== merchantId) {
      throw new BadRequestException('Подписка принадлежит другому мерчанту');
    }

    const plan = subscription.plan as any;
    
    // Создаем платеж через провайдера
    const paymentResult = await this.provider.createPayment({
      amount: plan.price * 100, // конвертируем в копейки
      currency: plan.currency || 'RUB',
      description: `Оплата подписки "${plan.displayName}" для ${merchantId}`,
      orderId: `sub_${subscriptionId}_${Date.now()}`,
      customerId: merchantId,
      metadata: {
        type: 'subscription',
        subscriptionId,
        merchantId,
        planId: plan.id,
      },
      savePaymentMethod: true, // для рекуррентных платежей
    });

    // Сохраняем информацию о платеже
    await this.prisma.payment.create({
      data: {
        id: paymentResult.id,
        merchantId: subscription.merchantId,
        subscriptionId,
        amount: plan.price,
        currency: plan.currency || 'RUB',
        status: 'pending',
        provider: this.providerName,
        paymentMethod: 'card',
        metadata: paymentResult.metadata,
      },
    });

    return {
      id: paymentResult.id,
      paymentId: paymentResult.id,
      status: paymentResult.status ?? 'pending',
      confirmationUrl: paymentResult.confirmationUrl,
      amount: plan.price,
      currency: plan.currency || 'RUB',
    };
  }

  /**
   * Обработать вебхук от платежной системы
   */
  async handleWebhook(body: any, headers: any) {
    const result = await this.provider.processWebhook(body, headers);
    
    switch (result.type) {
      case 'payment.succeeded':
        await this.handlePaymentSuccess(result);
        break;
      case 'payment.failed':
        await this.handlePaymentFailure(result);
        break;
      case 'payment.canceled':
        await this.handlePaymentCancellation(result);
        break;
      case 'refund.succeeded':
        await this.handleRefundSuccess(result);
        break;
    }

    return { ok: true };
  }

  private async handlePaymentSuccess(result: WebhookResult) {
    if (!result.paymentId) return;

    // Обновляем статус платежа
    const payment = await this.prisma.payment.update({
      where: { id: result.paymentId },
      data: {
        status: 'succeeded',
        paidAt: new Date(),
      },
    });

    // Если это платеж за подписку, обновляем подписку
    if (payment.subscriptionId) {
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: payment.subscriptionId },
        include: { plan: true },
      });

      if (subscription) {
        const plan = subscription.plan as any;
        const newPeriodEnd = this.calculateNextPeriod(
          subscription.currentPeriodEnd,
          plan.interval
        );

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'active',
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: newPeriodEnd,
          },
        });

        // Создаем событие в outbox
        await this.prisma.eventOutbox.create({
          data: {
            merchantId: subscription.merchantId,
            eventType: 'payment.succeeded',
            payload: {
              paymentId: payment.id,
              subscriptionId: subscription.id,
              amount: payment.amount,
              nextPeriodEnd: newPeriodEnd,
            },
          },
        });
      }
    }
  }

  private async handlePaymentFailure(result: WebhookResult) {
    if (!result.paymentId) return;

    // Обновляем статус платежа
    const existing = await this.prisma.payment.findUnique({ where: { id: result.paymentId } });
    const payment = await this.prisma.payment.update({
      where: { id: result.paymentId },
      data: {
        status: 'failed',
        metadata: {
          ...((existing?.metadata as any) || {}),
          failureReason: result.metadata?.error || 'Payment failed',
        },
      },
    });

    // Если это платеж за подписку, помечаем подписку как past_due
    if (payment.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'past_due',
        },
      });

      // Создаем событие
      await this.prisma.eventOutbox.create({
        data: {
          merchantId: (payment.metadata as any)?.merchantId,
          eventType: 'payment.failed',
          payload: {
            paymentId: payment.id,
            subscriptionId: payment.subscriptionId,
            reason: result.metadata?.error,
          },
        },
      });
    }
  }

  private async handlePaymentCancellation(result: WebhookResult) {
    if (!result.paymentId) return;

    await this.prisma.payment.update({
      where: { id: result.paymentId },
      data: {
        status: 'canceled',
      },
    });
  }

  private async handleRefundSuccess(result: WebhookResult) {
    if (!result.paymentId) return;

    const payment = await this.prisma.payment.findUnique({
      where: { id: result.paymentId },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'refunded',
          refundedAt: new Date(),
        },
      });

      // Создаем событие
      await this.prisma.eventOutbox.create({
        data: {
          merchantId: (payment.metadata as any)?.merchantId,
          eventType: 'payment.refunded',
          payload: {
            paymentId: payment.id,
            amount: result.amount || payment.amount,
          },
        },
      });
    }
  }

  /**
   * Проверить статус платежа
   */
  async checkPaymentStatus(paymentId: string) {
    const status = await this.provider.checkPaymentStatus(paymentId);
    
    // Обновляем статус в БД
    if (status.paid && status.status === 'succeeded') {
      await this.handlePaymentSuccess({
        type: 'payment.succeeded',
        paymentId,
        status: 'succeeded',
        amount: status.amount,
        metadata: status.metadata,
      });
    }

    return status;
  }

  /**
   * Создать возврат платежа
   */
  async refundPayment(paymentId: string, amount?: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Платеж не найден');
    }

    if (payment.status !== 'succeeded') {
      throw new BadRequestException('Можно вернуть только успешный платеж');
    }

    const refundAmount = amount || payment.amount * 100; // в копейках
    const result = await this.provider.refundPayment(paymentId, refundAmount);

    if (result.status === 'succeeded') {
      await this.handleRefundSuccess({
        type: 'refund.succeeded',
        paymentId,
        amount: result.amount,
      });
    }

    return result;
  }

  private calculateNextPeriod(currentEnd: Date, interval: string): Date {
    const next = new Date(currentEnd);
    
    switch (interval) {
      case 'month':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'year':
        next.setFullYear(next.getFullYear() + 1);
        break;
      case 'week':
        next.setDate(next.getDate() + 7);
        break;
      default:
        next.setMonth(next.getMonth() + 1);
    }
    
    return next;
  }

  /**
   * Получить список доступных платежных методов
   */
  async getAvailablePaymentMethods() {
    return [
      {
        type: 'bank_card',
        title: 'Банковская карта',
        icon: '💳',
      },
      {
        type: 'yoo_money',
        title: 'ЮMoney',
        icon: '💰',
      },
      {
        type: 'sberbank',
        title: 'SberPay',
        icon: '🏦',
      },
      {
        type: 'qiwi',
        title: 'QIWI Кошелек',
        icon: '🦅',
      },
    ];
  }
}
