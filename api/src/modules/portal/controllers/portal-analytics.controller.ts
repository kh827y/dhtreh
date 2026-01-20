import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AnalyticsService,
  type RecencyGrouping,
} from '../../analytics/analytics.service';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { UpdateRfmSettingsDto } from '../../analytics/dto/update-rfm-settings.dto';
import {
  DEFAULT_TIMEZONE_CODE,
} from '../../../shared/timezone/russia-timezones';
import { TransactionItemDto } from '../../loyalty/dto/dto';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // ===== Analytics wrappers (portal-friendly) =====
  @Get('analytics/dashboard')
  dashboard(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getDashboard(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  @Get('analytics/portrait')
  portrait(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const periodKey =
      typeof period === 'string' ? period.trim().toLowerCase() : '';
    if (
      periodKey === 'all' ||
      periodKey === 'all-time' ||
      periodKey === 'alltime'
    ) {
      return this.analytics.getCustomerPortrait(
        merchantId,
        { from: new Date(0), to: new Date(), type: 'custom' },
        segmentId,
      );
    }
    return this.analytics.getCustomerPortrait(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      segmentId,
    );
  }

  @Get('analytics/repeat')
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'outletId', required: false })
  repeat(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getRepeatPurchases(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  @Get('analytics/birthdays')
  birthdays(
    @Req() req: PortalRequest,
    @Query('withinDays') withinDays?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const d = Math.max(
      1,
      Math.min(parseInt(withinDays || '30', 10) || 30, 365),
    );
    const l = Math.max(1, Math.min(parseInt(limit || '100', 10) || 100, 1000));
    return this.analytics.getBirthdays(merchantId, d, l);
  }

  @Get('analytics/referral')
  referral(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getReferralSummary(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      timezoneCode,
    );
  }

  @Get('analytics/referral/leaderboard')
  referralLeaderboard(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    const parsedOffset = Math.max(0, Number.parseInt(offset || '0', 10) || 0);
    const parsedLimit = Math.max(
      1,
      Math.min(Number.parseInt(limit || '50', 10) || 50, 200),
    );
    return this.analytics.getReferralLeaderboard(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      timezoneCode,
      parsedOffset,
      parsedLimit,
    );
  }

  @Get('analytics/operations')
  analyticsOperations(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getOperationalMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  @Get('analytics/revenue')
  revenue(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getRevenueMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      this.helpers.normalizeGrouping(group),
      timezoneCode,
    );
  }

  @Get('analytics/customers')
  customers(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getCustomerMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
    );
  }

  @Get('analytics/auto-return')
  analyticsAutoReturn(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getAutoReturnMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  @Get('analytics/birthday-mechanic')
  analyticsBirthdayMechanic(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getBirthdayMechanicMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  @Get('analytics/time/recency')
  analyticsTimeRecency(
    @Req() req: PortalRequest,
    @Query('group') group?: string,
    @Query('limit') limit?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const grouping: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const effectiveLimit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.analytics.getPurchaseRecencyDistribution(
      merchantId,
      grouping,
      effectiveLimit,
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  @Get('analytics/time/activity')
  analyticsTimeActivity(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getTimeActivityMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  @Get('analytics/loyalty')
  loyalty(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getLoyaltyMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      this.helpers.normalizeGrouping(group),
      timezoneCode,
    );
  }

  @Get('analytics/cohorts')
  cohorts(
    @Req() req: PortalRequest,
    @Query('by') by?: 'month' | 'week',
    @Query('limit') limitStr?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const limit = Math.min(Math.max(parseInt(limitStr || '6', 10) || 6, 1), 24);
    return this.analytics.getRetentionCohorts(
      merchantId,
      by === 'week' ? 'week' : 'month',
      limit,
    );
  }

  @Get('analytics/rfm')
  rfmAnalytics(@Req() req: PortalRequest) {
    return this.analytics.getRfmGroupsAnalytics(this.helpers.getMerchantId(req));
  }

  @Put('analytics/rfm/settings')
  updateRfmAnalyticsSettings(
    @Req() req: PortalRequest,
    @Body() dto: UpdateRfmSettingsDto,
  ) {
    return this.analytics.updateRfmSettings(this.helpers.getMerchantId(req), dto);
  }
}
