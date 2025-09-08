import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MerchantsModule } from './merchants/merchants.module';
import { RequestIdMiddleware } from './request-id.middleware';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { HoldGcWorker } from './hold-gc.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LoyaltyModule,
    MetricsModule,
    MerchantsModule, // <— добавили
  ],
  controllers: [HealthController, MetricsController],
  providers: [HoldGcWorker],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
