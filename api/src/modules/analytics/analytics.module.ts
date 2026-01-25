import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsAggregatorWorker } from './analytics-aggregator.worker';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsTimezoneService } from './analytics-timezone.service';
import { AnalyticsDashboardService } from './services/analytics-dashboard.service';
import { AnalyticsRevenueService } from './services/analytics-revenue.service';
import { AnalyticsCustomersService } from './services/analytics-customers.service';
import { AnalyticsReferralsService } from './services/analytics-referrals.service';
import { AnalyticsCampaignsService } from './services/analytics-campaigns.service';
import { AnalyticsOperationsService } from './services/analytics-operations.service';
import { AnalyticsLoyaltyService } from './services/analytics-loyalty.service';
import { AnalyticsMechanicsService } from './services/analytics-mechanics.service';
import { AnalyticsRfmService } from './services/analytics-rfm.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsAggregatorWorker,
    AnalyticsCacheService,
    AnalyticsTimezoneService,
    AnalyticsDashboardService,
    AnalyticsRevenueService,
    AnalyticsCustomersService,
    AnalyticsReferralsService,
    AnalyticsCampaignsService,
    AnalyticsOperationsService,
    AnalyticsLoyaltyService,
    AnalyticsMechanicsService,
    AnalyticsRfmService,
  ],
  exports: [AnalyticsService, AnalyticsAggregatorWorker],
})
export class AnalyticsModule {}
