import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { CashierGuard } from '../guards/cashier.guard';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [LoyaltyService, CashierGuard],
  controllers: [LoyaltyController],
})
export class LoyaltyModule {}
