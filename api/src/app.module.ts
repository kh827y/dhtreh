import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MerchantsModule } from './merchants/merchants.module';
import { RequestIdMiddleware } from './request-id.middleware';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { HoldGcWorker } from './hold-gc.worker';
import { IdempotencyGcWorker } from './idempotency-gc.worker';
import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // мс
        limit: 200,  // базовый мягкий лимит
      },
    ]),
    PrismaModule,
    LoyaltyModule,
    MetricsModule,
    MerchantsModule, // <— добавили
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    HoldGcWorker,
    IdempotencyGcWorker,
    OutboxDispatcherWorker,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
