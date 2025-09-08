import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { OutboxWorker } from '../outbox/outbox.worker';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [LoyaltyService, OutboxWorker],
  controllers: [LoyaltyController],
})
export class LoyaltyModule {}
