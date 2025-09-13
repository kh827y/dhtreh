import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { CashierGuard } from '../guards/cashier.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SubscriptionGuard } from '../guards/subscription.guard';

@Module({
  imports: [PrismaModule, MetricsModule, SubscriptionModule],
  providers: [LoyaltyService, CashierGuard, SubscriptionGuard],
  controllers: [LoyaltyController],
})
export class LoyaltyModule {}
