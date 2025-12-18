import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './guards/custom-throttler.guard';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MerchantsModule } from './merchants/merchants.module';
import { AdminAuditModule } from './admin-audit.module';
import { RequestIdMiddleware } from './request-id.middleware';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { TelegramModule } from './telegram/telegram.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CrmModule } from './crm/crm.module';
import { HoldGcWorker } from './hold-gc.worker';
import { IdempotencyGcWorker } from './idempotency-gc.worker';
import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from './notification-dispatcher.worker';
import { TtlBurnWorker } from './ttl-burn.worker';
import { PointsBurnWorker } from './points-burn.worker';
import { PointsTtlWorker } from './points-ttl.worker';
import { PointsTtlReminderWorker } from './points-ttl-reminder.worker';
import { EarnActivationWorker } from './earn-activation.worker';
import { GiftsModule } from './gifts/gifts.module';
import { ReferralModule } from './referral/referral.module';
import { LevelsModule } from './levels/levels.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PortalAuthModule } from './portal-auth/portal-auth.module';
import { PortalModule } from './portal/portal.module';
import { AdminPanelModule } from './admin-panel/admin-panel.module';
import { MerchantPanelModule } from './merchant-panel/merchant-panel.module';
import { LoyaltyProgramModule } from './loyalty-program/loyalty-program.module';
import { CustomerAudiencesModule } from './customer-audiences/customer-audiences.module';
import { CommunicationsModule } from './communications/communications.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { IntegrationsModule } from './integrations/integrations.module';
import { AutoReturnWorker } from './auto-return.worker';
import { BirthdayWorker } from './birthday.worker';
import { TelegramStaffDigestWorker } from './telegram/staff-digest.worker';
import { OpsAlertMonitor } from './alerts/ops-alert-monitor.service';
import { AdminObservabilityController } from './admin-observability.controller';
// Optional Redis storage for Throttler
let throttlerStorage: any = undefined;
try {
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');

    const {
      ThrottlerStorageRedisService,
    } = require('nestjs-throttler-storage-redis');
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
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // мс
        limit: 200, // базовый мягкий лимит
        ...(throttlerStorage ? { storage: throttlerStorage } : {}),
      },
    ]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'api', 'schema.gql'),
      sortSchema: true,
      context: ({ req }) => ({ req }),
    }),
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
    GiftsModule,
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
    PointsTtlWorker,
    PointsTtlReminderWorker,
    TtlBurnWorker,
    PointsBurnWorker,
    EarnActivationWorker,
    AutoReturnWorker,
    BirthdayWorker,
    TelegramStaffDigestWorker,
    OpsAlertMonitor,
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
