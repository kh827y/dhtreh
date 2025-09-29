import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { LoyaltyProgramService } from './loyalty-program.service';
import { MechanicsController } from './controllers/mechanics.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { PromoCodesController } from './controllers/promocodes.controller';
import { OperationsLogController } from './controllers/operations-log.controller';
import { TiersController } from './controllers/tiers.controller';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [LoyaltyProgramService],
  controllers: [MechanicsController, PromotionsController, PromoCodesController, OperationsLogController, TiersController],
  exports: [LoyaltyProgramService],
})
export class LoyaltyProgramModule {}
