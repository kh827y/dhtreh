import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { CashierGuard } from '../guards/cashier.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SubscriptionGuard } from '../guards/subscription.guard';
import { AntiFraudGuard } from '../guards/antifraud.guard';
import { AntifraudModule } from '../antifraud/antifraud.module';

@Module({
  imports: [PrismaModule, MetricsModule, SubscriptionModule, AntifraudModule],
  providers: [LoyaltyService, CashierGuard, SubscriptionGuard, AntiFraudGuard],
  controllers: [LoyaltyController],
})
export class LoyaltyModule {}
