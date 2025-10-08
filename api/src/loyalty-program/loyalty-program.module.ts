import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { LoyaltyProgramService } from './loyalty-program.service';
import { MechanicsController } from './controllers/mechanics.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { PromoCodesController } from './controllers/promocodes.controller';
import { OperationsLogController } from './controllers/operations-log.controller';
import { TiersController } from './controllers/tiers.controller';
import { RedeemLimitsController } from './controllers/redeem-limits.controller';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { CommunicationsModule } from '../communications/communications.module';

@Module({
  imports: [
    PrismaModule,
    MetricsModule,
    PromoCodesModule,
    CommunicationsModule,
  ],
  providers: [LoyaltyProgramService],
  controllers: [
    MechanicsController,
    PromotionsController,
    PromoCodesController,
    OperationsLogController,
    TiersController,
    RedeemLimitsController,
  ],
  exports: [LoyaltyProgramService],
})
export class LoyaltyProgramModule {}
