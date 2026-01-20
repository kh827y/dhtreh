import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';
import { LoyaltyProgramService } from './loyalty-program.service';
import { PromotionsController } from './controllers/promotions.controller';
import { OperationsLogController } from './controllers/operations-log.controller';
import { TiersController } from './controllers/tiers.controller';
import { RedeemLimitsController } from './controllers/redeem-limits.controller';
import { CommunicationsModule } from '../communications/communications.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { PromotionRulesService } from './services/promotion-rules.service';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    CommunicationsModule,
    SubscriptionModule,
  ],
  providers: [LoyaltyProgramService, PromotionRulesService, PortalGuard],
  controllers: [
    PromotionsController,
    OperationsLogController,
    TiersController,
    RedeemLimitsController,
  ],
  exports: [LoyaltyProgramService],
})
export class LoyaltyProgramModule {}
