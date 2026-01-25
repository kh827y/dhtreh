import { Injectable } from '@nestjs/common';
import {
  AnalyticsService,
  type RecencyGrouping,
} from '../../analytics/analytics.service';
import type { PortalRequest } from '../portal.types';
import { PortalRequestHelper } from '../helpers/portal-request.helper';
import { UpdateRfmSettingsDto } from '../../analytics/dto/update-rfm-settings.dto';
import { DEFAULT_TIMEZONE_CODE } from '../../../shared/timezone/russia-timezones';

@Injectable()
export class PortalAnalyticsUseCase {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly helpers: PortalRequestHelper,
  ) {}

  dashboard(req: PortalRequest, period?: string, from?: string, to?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getDashboard(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  portrait(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    segmentId?: string,
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

  repeat(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getRepeatPurchases(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  birthdays(req: PortalRequest, withinDays?: string, limit?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    const d = this.helpers.parseLimit(withinDays, {
      defaultValue: 30,
      max: 365,
    });
    const l = this.helpers.parseLimit(limit, {
      defaultValue: 100,
      max: 1000,
    });
    return this.analytics.getBirthdays(merchantId, d, l);
  }

  referral(req: PortalRequest, period?: string, from?: string, to?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    return this.analytics.getReferralSummary(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      timezoneCode,
    );
  }

  referralLeaderboard(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    offset?: string,
    limit?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezoneCode = String(req.portalTimezone || DEFAULT_TIMEZONE_CODE);
    const parsedOffset = this.helpers.parseOffset(offset);
    const parsedLimit = this.helpers.parseLimit(limit, {
      defaultValue: 50,
      max: 200,
    });
    return this.analytics.getReferralLeaderboard(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      timezoneCode,
      parsedOffset,
      parsedLimit,
    );
  }

  analyticsOperations(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getOperationalMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  revenue(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    group?: string,
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

  customers(req: PortalRequest, period?: string, from?: string, to?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getCustomerMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
    );
  }

  analyticsAutoReturn(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getAutoReturnMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  analyticsBirthdayMechanic(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    outletId?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getBirthdayMechanicMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      outletId,
    );
  }

  analyticsTimeRecency(req: PortalRequest, group?: string, limit?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    const grouping: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const effectiveLimit = this.helpers.parseOptionalLimit(limit, {
      min: 1,
      max: 1000,
    });
    return this.analytics.getPurchaseRecencyDistribution(
      merchantId,
      grouping,
      effectiveLimit,
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  analyticsTimeActivity(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.analytics.getTimeActivityMetrics(
      merchantId,
      this.helpers.computePeriod(req, period, from, to),
      String(req.portalTimezone || DEFAULT_TIMEZONE_CODE),
    );
  }

  loyalty(
    req: PortalRequest,
    period?: string,
    from?: string,
    to?: string,
    group?: string,
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

  cohorts(req: PortalRequest, by?: 'month' | 'week', limitStr?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    const limit = this.helpers.parseLimit(limitStr, {
      defaultValue: 6,
      max: 24,
    });
    return this.analytics.getRetentionCohorts(
      merchantId,
      by === 'week' ? 'week' : 'month',
      limit,
    );
  }

  rfmAnalytics(req: PortalRequest) {
    return this.analytics.getRfmGroupsAnalytics(
      this.helpers.getMerchantId(req),
    );
  }

  updateRfmAnalyticsSettings(req: PortalRequest, dto: UpdateRfmSettingsDto) {
    return this.analytics.updateRfmSettings(
      this.helpers.getMerchantId(req),
      dto,
    );
  }
}
