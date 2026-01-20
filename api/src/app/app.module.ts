import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';
import { MaintenanceGuard } from '../core/guards/maintenance.guard';
import { ConfigModule } from '@nestjs/config';
import { AppConfigModule } from '../core/config/config.module';
import { PrismaModule } from '../core/prisma/prisma.module';
import { LoyaltyModule } from '../modules/loyalty/loyalty.module';
import { MerchantsModule } from '../modules/merchants/merchants.module';
import { AdminAuditModule } from '../modules/admin/admin-audit.module';
import { RequestIdMiddleware } from '../core/middleware/request-id.middleware';
import { HealthController } from '../core/health/health.controller';
import { MetricsController } from '../core/metrics/metrics.controller';
import { MetricsModule } from '../core/metrics/metrics.module';
import { SubscriptionModule } from '../modules/subscription/subscription.module';
import { TelegramModule } from '../modules/telegram/telegram.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsModule } from '../modules/alerts/alerts.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { CrmModule } from '../modules/crm/crm.module';
import { HoldGcWorker } from '../workers/hold-gc.worker';
import { IdempotencyGcWorker } from '../workers/idempotency-gc.worker';
import { EventOutboxGcWorker } from '../workers/event-outbox-gc.worker';
import { RetentionGcWorker } from '../workers/retention-gc.worker';
import { OutboxDispatcherWorker } from '../workers/outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from '../workers/notification-dispatcher.worker';
import { PointsBurnWorker } from '../workers/points-burn.worker';
import { PointsTtlWorker } from '../workers/points-ttl.worker';
import { PointsTtlReminderWorker } from '../workers/points-ttl-reminder.worker';
import { EarnActivationWorker } from '../workers/earn-activation.worker';
import { ReferralModule } from '../modules/referral/referral.module';
import { LevelsModule } from '../modules/levels/levels.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { PortalAuthModule } from '../modules/portal-auth/portal-auth.module';
import { PortalModule } from '../modules/portal/portal.module';
import { AdminPanelModule } from '../modules/admin-panel/admin-panel.module';
import { MerchantPanelModule } from '../modules/merchant-panel/merchant-panel.module';
import { LoyaltyProgramModule } from '../modules/loyalty-program/loyalty-program.module';
import { CustomerAudiencesModule } from '../modules/customer-audiences/customer-audiences.module';
import { CommunicationsModule } from '../modules/communications/communications.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';
import { AutoReturnWorker } from '../workers/auto-return.worker';
import { BirthdayWorker } from '../workers/birthday.worker';
import { TelegramStaffDigestWorker } from '../modules/telegram/staff-digest.worker';
import { OpsAlertMonitor } from '../modules/alerts/ops-alert-monitor.service';
import { AdminObservabilityController } from '../modules/admin/admin-observability.controller';
import { AdminAuditInterceptor } from '../modules/admin/admin-audit.interceptor';
import { CacheModule } from '../core/cache/cache.module';
// Optional Redis storage for Throttler
let throttlerStorage: object | undefined = undefined;
try {
  if (process.env.REDIS_URL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as { new (url: string): unknown };

    const {
      ThrottlerStorageRedisService,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('nestjs-throttler-storage-redis') as {
      ThrottlerStorageRedisService: new (client: unknown) => object;
    };
    throttlerStorage = new ThrottlerStorageRedisService(
      new Redis(process.env.REDIS_URL),
    );
  }
} catch {
  // keep in-memory storage if deps not installed
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    CacheModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // мс
        limit: 200, // базовый мягкий лимит
        ...(throttlerStorage ? { storage: throttlerStorage } : {}),
      },
    ]),
    PrismaModule,
    LoyaltyModule,
    MetricsModule,
    AnalyticsModule,
    MerchantsModule, // <— добавили
    AdminAuditModule,
    SubscriptionModule,
    TelegramModule,
    AlertsModule,
    CrmModule,
    LevelsModule,
    NotificationsModule,
    ReferralModule,
    PortalAuthModule,
    PortalModule,
    AdminPanelModule,
    MerchantPanelModule,
    IntegrationsModule,
    LoyaltyProgramModule,
    CustomerAudiencesModule,
    CommunicationsModule,
  ],
  controllers: [
    HealthController,
    MetricsController,
    AdminObservabilityController,
  ],
  providers: [
    HoldGcWorker,
    OutboxDispatcherWorker,
    NotificationDispatcherWorker,
    IdempotencyGcWorker,
    EventOutboxGcWorker,
    RetentionGcWorker,
    PointsTtlWorker,
    PointsTtlReminderWorker,
    PointsBurnWorker,
    EarnActivationWorker,
    AutoReturnWorker,
    BirthdayWorker,
    TelegramStaffDigestWorker,
    OpsAlertMonitor,
    AdminAuditInterceptor,
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
