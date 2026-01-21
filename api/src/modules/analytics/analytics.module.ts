import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsAggregatorWorker } from './analytics-aggregator.worker';
import { AnalyticsCacheService } from './analytics-cache.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsAggregatorWorker, AnalyticsCacheService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
