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
import { HoldGcWorker } from './hold-gc.worker';
import { IdempotencyGcWorker } from './idempotency-gc.worker';
import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';
import { TtlBurnWorker } from './ttl-burn.worker';
import { PointsBurnWorker } from './points-burn.worker';
import { PointsTtlWorker } from './points-ttl.worker';
// Optional Redis storage for Throttler
let throttlerStorage: any = undefined;
try {
  if (process.env.REDIS_URL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ThrottlerStorageRedisService } = require('nestjs-throttler-storage-redis');
    throttlerStorage = new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL));
  }
} catch {
  // keep in-memory storage if deps not installed
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // мс
        limit: 200,  // базовый мягкий лимит
        ...(throttlerStorage ? { storage: throttlerStorage } : {}),
      },
    ]),
    PrismaModule,
    LoyaltyModule,
    MetricsModule,
    MerchantsModule, // <— добавили
    AdminAuditModule,
    SubscriptionModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    HoldGcWorker,
    OutboxDispatcherWorker,
    IdempotencyGcWorker,
    PointsTtlWorker,
    TtlBurnWorker,
    PointsBurnWorker,
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
