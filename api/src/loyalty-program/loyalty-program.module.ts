import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { LoyaltyProgramService } from './loyalty-program.service';
import { PromotionsController } from './controllers/promotions.controller';
import { OperationsLogController } from './controllers/operations-log.controller';
import { TiersController } from './controllers/tiers.controller';
import { RedeemLimitsController } from './controllers/redeem-limits.controller';
import { CommunicationsModule } from '../communications/communications.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    CommunicationsModule,
    SubscriptionModule,
  ],
  providers: [LoyaltyProgramService, PortalGuard],
  controllers: [
    PromotionsController,
    OperationsLogController,
    TiersController,
    RedeemLimitsController,
  ],
  exports: [LoyaltyProgramService],
})
export class LoyaltyProgramModule {}
