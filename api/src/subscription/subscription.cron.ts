import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { PaymentService } from '../payments/payment.service';
import { PushService } from '../notifications/push/push.service';
import { MetricsService } from '../metrics.service';

/**
 * Cron задачи для управления подписками
 * Автоматическое продление, напоминания, отчеты
 */
@Injectable()
export class SubscriptionCronService {
  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
    private pushService: PushService,
    private metrics: MetricsService,
  ) {}

  /**
   * Проверка и продление подписок
   * Запускается каждый день в 3:00 ночи
   */
  @Cron('0 3 * * *')
  async processSubscriptionRenewals() {
    console.log('[CRON] Starting subscription renewal process...');

    const startTime = Date.now();
    let processed = 0;
    let renewed = 0;
    let failed = 0;

    try {
      // Находим подписки, которые истекают сегодня
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiringSubscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: today,
            lt: tomorrow,
          },
          autoRenew: true,
        },
        include: {
          merchant: true,
          plan: true,
        },
      });

      console.log(
        `[CRON] Found ${expiringSubscriptions.length} subscriptions to renew`,
      );

      for (const subscription of expiringSubscriptions) {
        processed++;

        try {
          // Пытаемся создать платеж для продления
          const payment = await this.paymentService.createSubscriptionPayment(
            subscription.merchantId,
            subscription.id,
          );

          if (payment.status === 'succeeded' || payment.status === 'pending') {
            // Обновляем подписку
            const newPeriodEnd = new Date(subscription.currentPeriodEnd);
            newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

            await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                currentPeriodEnd: newPeriodEnd,
                lastPaymentId: payment.id,
                lastPaymentDate: new Date(),
              },
            });

            renewed++;
            console.log(
              `[CRON] Renewed subscription ${subscription.id} for merchant ${subscription.merchantId}`,
            );

            // Отправляем уведомление
            await this.sendRenewalNotification(subscription.merchantId, true);
          } else {
            throw new Error(`Payment failed with status: ${payment.status}`);
          }
        } catch (error) {
          failed++;
          console.error(
            `[CRON] Failed to renew subscription ${subscription.id}:`,
            error,
          );

          // Переводим подписку в статус expired
          await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'expired',
              autoRenew: false,
            },
          });

          // Отправляем уведомление о неудачном продлении
          await this.sendRenewalNotification(subscription.merchantId, false);
        }
      }

      // Обновляем метрики
      this.metrics.increment('subscription_renewals_processed', processed);
      this.metrics.increment('subscription_renewals_success', renewed);
      this.metrics.increment('subscription_renewals_failed', failed);

      const duration = Date.now() - startTime;
      console.log(
        `[CRON] Subscription renewal completed in ${duration}ms. Processed: ${processed}, Renewed: ${renewed}, Failed: ${failed}`,
      );
    } catch (error) {
      console.error('[CRON] Error in subscription renewal process:', error);
      this.metrics.increment('subscription_cron_errors');
    }
  }

  /**
   * Отправка напоминаний об истечении подписки
   * Запускается каждый день в 10:00 утра
   */
  @Cron('0 10 * * *')
  async sendExpirationReminders() {
    console.log('[CRON] Starting expiration reminder process...');

    try {
      // Напоминание за 7 дней до истечения
      const in7Days = new Date();
      in7Days.setDate(in7Days.getDate() + 7);
      in7Days.setHours(0, 0, 0, 0);
      const in7DaysEnd = new Date(in7Days);
      in7DaysEnd.setHours(23, 59, 59, 999);

      const expiringSoon = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: in7Days,
            lte: in7DaysEnd,
          },
          reminderSent7Days: false,
        },
        include: {
          merchant: true,
          plan: true,
        },
      });

      for (const subscription of expiringSoon) {
        await this.sendExpirationReminder(subscription, 7);

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { reminderSent7Days: true },
        });
      }

      // Напоминание за 1 день до истечения
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const expiringTomorrow = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: tomorrow,
            lte: tomorrowEnd,
          },
          reminderSent1Day: false,
        },
        include: {
          merchant: true,
          plan: true,
        },
      });

      for (const subscription of expiringTomorrow) {
        await this.sendExpirationReminder(subscription, 1);

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { reminderSent1Day: true },
        });
      }

      console.log(
        `[CRON] Sent ${expiringSoon.length + expiringTomorrow.length} expiration reminders`,
      );
    } catch (error) {
      console.error('[CRON] Error sending expiration reminders:', error);
      this.metrics.increment('subscription_reminder_errors');
    }
  }

  /**
   * Деактивация истекших подписок
   * Запускается каждый день в 00:05
   */
  @Cron('5 0 * * *')
  async deactivateExpiredSubscriptions() {
    console.log('[CRON] Starting expired subscription deactivation...');

    try {
      const now = new Date();

      // Находим истекшие подписки
      const expired = await this.prisma.subscription.updateMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            lt: now,
          },
          autoRenew: false,
        },
        data: {
          status: 'expired',
        },
      });

      if (expired.count > 0) {
        console.log(
          `[CRON] Deactivated ${expired.count} expired subscriptions`,
        );
        this.metrics.increment('subscriptions_expired', expired.count);
      }

      // Обрабатываем grace period (льготный период) для истекших подписок
      const gracePeriodDays = 3;
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() - gracePeriodDays);

      const canceled = await this.prisma.subscription.updateMany({
        where: {
          status: 'expired',
          currentPeriodEnd: {
            lt: gracePeriodEnd,
          },
        },
        data: {
          status: 'canceled',
        },
      });

      if (canceled.count > 0) {
        console.log(
          `[CRON] Canceled ${canceled.count} subscriptions after grace period`,
        );
        this.metrics.increment(
          'subscriptions_canceled_after_grace',
          canceled.count,
        );
      }
    } catch (error) {
      console.error('[CRON] Error deactivating expired subscriptions:', error);
      this.metrics.increment('subscription_deactivation_errors');
    }
  }

  /**
   * Генерация ежемесячных отчетов
   * Запускается первого числа каждого месяца в 8:00
   */
  @Cron('0 8 1 * *')
  async generateMonthlyReports() {
    console.log('[CRON] Starting monthly report generation...');

    try {
      // Получаем всех активных мерчантов с подписками
      const merchants = await this.prisma.merchant.findMany({
        where: {
          subscription: {
            status: 'active',
          },
          settings: {
            monthlyReports: true,
          },
        },
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      });

      console.log(
        `[CRON] Generating reports for ${merchants.length} merchants`,
      );

      for (const merchant of merchants) {
        try {
          // Генерируем отчет за прошлый месяц
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          lastMonth.setDate(1);
          lastMonth.setHours(0, 0, 0, 0);

          const lastMonthEnd = new Date(lastMonth);
          lastMonthEnd.setMonth(lastMonthEnd.getMonth() + 1);
          lastMonthEnd.setDate(0);
          lastMonthEnd.setHours(23, 59, 59, 999);

          // Здесь можно вызвать сервис генерации отчетов
          // const report = await this.reportService.generateReport({
          //   merchantId: merchant.id,
          //   type: 'full',
          //   format: 'pdf',
          //   period: { from: lastMonth, to: lastMonthEnd },
          // });

          // Отправляем отчет на email
          // await this.emailService.sendMonthlyReport(merchant.email, report);

          console.log(
            `[CRON] Generated monthly report for merchant ${merchant.id}`,
          );
        } catch (error) {
          console.error(
            `[CRON] Failed to generate report for merchant ${merchant.id}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error('[CRON] Error generating monthly reports:', error);
      this.metrics.increment('monthly_report_errors');
    }
  }

  /**
   * Очистка старых данных
   * Запускается каждое воскресенье в 4:00 ночи
   */
  @Cron('0 4 * * 0')
  async cleanupOldData() {
    console.log('[CRON] Starting cleanup process...');

    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Удаляем старые неактивные триал подписки
      const deletedTrials = await this.prisma.subscription.deleteMany({
        where: {
          status: 'trial',
          createdAt: {
            lt: sixMonthsAgo,
          },
        },
      });

      if (deletedTrials.count > 0) {
        console.log(
          `[CRON] Deleted ${deletedTrials.count} old trial subscriptions`,
        );
      }

      // Очищаем старые платежи со статусом failed
      const deletedPayments = await this.prisma.payment.deleteMany({
        where: {
          status: 'failed',
          createdAt: {
            lt: sixMonthsAgo,
          },
        },
      });

      if (deletedPayments.count > 0) {
        console.log(
          `[CRON] Deleted ${deletedPayments.count} old failed payments`,
        );
      }

      // Сброс флагов напоминаний для новых периодов
      await this.prisma.subscription.updateMany({
        where: {
          status: 'active',
          reminderSent7Days: true,
          currentPeriodEnd: {
            gt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        data: {
          reminderSent7Days: false,
          reminderSent1Day: false,
        },
      });
    } catch (error) {
      console.error('[CRON] Error during cleanup:', error);
      this.metrics.increment('cleanup_errors');
    }
  }

  /**
   * Проверка использования лимитов
   * Запускается каждый час
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkUsageLimits() {
    console.log('[CRON] Checking subscription usage limits...');

    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
        },
        include: {
          merchant: true,
          plan: true,
        },
      });

      for (const subscription of subscriptions) {
        const plan = subscription.plan as any;

        // Проверяем лимит транзакций за месяц
        if (plan.maxTransactions) {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const transactionCount = await this.prisma.transaction.count({
            where: {
              merchantId: subscription.merchantId,
              createdAt: {
                gte: startOfMonth,
              },
            },
          });

          // Если достигнут 90% лимита - отправляем предупреждение
          if (transactionCount >= plan.maxTransactions * 0.9) {
            await this.sendLimitWarning(
              subscription.merchantId,
              'transactions',
              transactionCount,
              plan.maxTransactions,
            );
          }
        }

        // Проверяем лимит клиентов
        if (plan.maxCustomers) {
          const customerCount = await this.prisma.wallet.count({
            where: {
              merchantId: subscription.merchantId,
            },
          });

          if (customerCount >= plan.maxCustomers * 0.9) {
            await this.sendLimitWarning(
              subscription.merchantId,
              'customers',
              customerCount,
              plan.maxCustomers,
            );
          }
        }
      }
    } catch (error) {
      console.error('[CRON] Error checking usage limits:', error);
      this.metrics.increment('usage_check_errors');
    }
  }

  // Вспомогательные методы

  private async sendRenewalNotification(merchantId: string, success: boolean) {
    try {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        include: { settings: true },
      });

      if (!merchant) return;

      const title = success
        ? 'Подписка продлена'
        : 'Не удалось продлить подписку';

      const message = success
        ? 'Ваша подписка успешно продлена на следующий месяц'
        : 'Не удалось автоматически продлить подписку. Пожалуйста, обновите платежные данные';

      // Push уведомление
      await this.pushService
        .sendToTopic(merchantId, title, message)
        .catch(console.error);
    } catch (error) {
      console.error('Error sending renewal notification:', error);
    }
  }

  private async sendExpirationReminder(subscription: any, daysLeft: number) {
    try {
      const message =
        daysLeft === 7
          ? `Ваша подписка "${subscription.plan.name}" истекает через 7 дней`
          : `Ваша подписка истекает завтра! Продлите для сохранения доступа`;

      const merchant = subscription.merchant;

      await this.pushService
        .sendToTopic(subscription.merchantId, 'Напоминание о подписке', message)
        .catch(console.error);
    } catch (error) {
      console.error('Error sending expiration reminder:', error);
    }
  }

  private async sendLimitWarning(
    merchantId: string,
    limitType: string,
    current: number,
    max: number,
  ) {
    try {
      const percentage = Math.round((current / max) * 100);
      const message = `Внимание! Вы использовали ${percentage}% от лимита ${
        limitType === 'transactions' ? 'транзакций' : 'клиентов'
      } (${current} из ${max})`;

      await this.pushService
        .sendToTopic(merchantId, 'Предупреждение о лимите', message)
        .catch(console.error);
    } catch (error) {
      console.error('Error sending limit warning:', error);
    }
  }
}
