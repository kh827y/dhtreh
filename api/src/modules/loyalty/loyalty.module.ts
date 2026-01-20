import { Module, forwardRef } from '@nestjs/common';
import { LoyaltyService } from './services/loyalty.service';
import { LoyaltyCashierController } from './controllers/loyalty-cashier.controller';
import { LoyaltyMetaController } from './controllers/loyalty-meta.controller';
import { LoyaltyProfileController } from './controllers/loyalty-profile.controller';
import { LoyaltyPromotionsController } from './controllers/loyalty-promotions.controller';
import { LoyaltyTransactionsController } from './controllers/loyalty-transactions.controller';
import { LoyaltyPublicController } from './controllers/loyalty.public.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';
import { CashierGuard } from '../../core/guards/cashier.guard';
import { TelegramMiniappGuard } from '../../core/guards/telegram-miniapp.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SubscriptionGuard } from '../../core/guards/subscription.guard';
import { AntiFraudGuard } from '../../core/guards/antifraud.guard';
import { AntifraudModule } from '../antifraud/antifraud.module';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { ReviewModule } from '../reviews/review.module';
import { TelegramModule } from '../telegram/telegram.module';
import { StaffMotivationEngine } from '../staff-motivation/staff-motivation.engine';
import { LevelsModule } from '../levels/levels.module';
import { LoyaltyEventsService } from './services/loyalty-events.service';
import { LoyaltyContextService } from './services/loyalty-context.service';
import { LoyaltyTierService } from './services/loyalty-tier.service';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    SubscriptionModule,
    AntifraudModule,
    PromoCodesModule,
    MerchantsModule,
    TelegramModule,
    LevelsModule,
    forwardRef(() => ReviewModule),
  ],
  providers: [
    LoyaltyService,
    CashierGuard,
    TelegramMiniappGuard,
    SubscriptionGuard,
    AntiFraudGuard,
    StaffMotivationEngine,
    LoyaltyEventsService,
    LoyaltyContextService,
    LoyaltyTierService,
  ],
  controllers: [
    LoyaltyCashierController,
    LoyaltyMetaController,
    LoyaltyProfileController,
    LoyaltyPromotionsController,
    LoyaltyTransactionsController,
    LoyaltyPublicController,
  ],
  exports: [LoyaltyService, LoyaltyEventsService],
})
export class LoyaltyModule {}
