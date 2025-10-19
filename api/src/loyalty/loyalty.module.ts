import { Module, forwardRef } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyPublicController } from './loyalty.public.controller';
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
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    SubscriptionModule,
    AntifraudModule,
    PromosModule,
    PromoCodesModule,
    MerchantsModule,
    TelegramModule,
    forwardRef(() => ReviewModule),
  ],
  providers: [LoyaltyService, CashierGuard, SubscriptionGuard, AntiFraudGuard],
  controllers: [LoyaltyController, LoyaltyPublicController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
