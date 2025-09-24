import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { LoyaltyProgramService } from './loyalty-program.service';
import { MechanicsController } from './controllers/mechanics.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { PromoCodesController } from './controllers/promocodes.controller';
import { OperationsLogController } from './controllers/operations-log.controller';

@Module({
  imports: [PrismaModule],
  providers: [LoyaltyProgramService],
  controllers: [MechanicsController, PromotionsController, PromoCodesController, OperationsLogController],
  exports: [LoyaltyProgramService],
})
export class LoyaltyProgramModule {}
