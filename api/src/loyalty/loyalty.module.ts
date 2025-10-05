import { Module, forwardRef } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { CashierGuard } from '../guards/cashier.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SubscriptionGuard } from '../guards/subscription.guard';
import { AntiFraudGuard } from '../guards/antifraud.guard';
import { AntifraudModule } from '../antifraud/antifraud.module';
import { PromosModule } from '../promos/promos.module';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { ReviewModule } from '../reviews/review.module';
import { LevelsModule } from '../levels/levels.module';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    SubscriptionModule,
    AntifraudModule,
    PromosModule,
    PromoCodesModule,
    MerchantsModule,
    LevelsModule,
    forwardRef(() => ReviewModule),
  ],
  providers: [LoyaltyService, CashierGuard, SubscriptionGuard, AntiFraudGuard],
  controllers: [LoyaltyController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
