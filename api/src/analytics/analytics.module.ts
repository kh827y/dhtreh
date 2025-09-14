import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsAggregatorWorker } from './analytics-aggregator.worker';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsAggregatorWorker],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
