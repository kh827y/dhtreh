import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { PortalRequest } from '../portal.types';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { UpdateRfmSettingsDto } from '../../analytics/dto/update-rfm-settings.dto';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalAnalyticsUseCase } from '../use-cases/portal-analytics.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalAnalyticsController {
  constructor(private readonly useCase: PortalAnalyticsUseCase) {}

  // ===== Analytics wrappers (portal-friendly) =====
  @Get('analytics/dashboard')
  dashboard(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.useCase.dashboard(req, period, from, to);
  }

  @Get('analytics/portrait')
  portrait(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('segmentId') segmentId?: string,
  ) {
    return this.useCase.portrait(req, period, from, to, segmentId);
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
    return this.useCase.repeat(req, period, from, to, outletId);
  }

  @Get('analytics/birthdays')
  birthdays(
    @Req() req: PortalRequest,
    @Query('withinDays') withinDays?: string,
    @Query('limit') limit?: string,
  ) {
    return this.useCase.birthdays(req, withinDays, limit);
  }

  @Get('analytics/referral')
  referral(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.useCase.referral(req, period, from, to);
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
    return this.useCase.referralLeaderboard(
      req,
      period,
      from,
      to,
      offset,
      limit,
    );
  }

  @Get('analytics/operations')
  analyticsOperations(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.useCase.analyticsOperations(req, period, from, to);
  }

  @Get('analytics/revenue')
  revenue(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    return this.useCase.revenue(req, period, from, to, group);
  }

  @Get('analytics/customers')
  customers(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.useCase.customers(req, period, from, to);
  }

  @Get('analytics/auto-return')
  analyticsAutoReturn(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    return this.useCase.analyticsAutoReturn(req, period, from, to, outletId);
  }

  @Get('analytics/birthday-mechanic')
  analyticsBirthdayMechanic(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    return this.useCase.analyticsBirthdayMechanic(
      req,
      period,
      from,
      to,
      outletId,
    );
  }

  @Get('analytics/time/recency')
  analyticsTimeRecency(
    @Req() req: PortalRequest,
    @Query('group') group?: string,
    @Query('limit') limit?: string,
  ) {
    return this.useCase.analyticsTimeRecency(req, group, limit);
  }

  @Get('analytics/time/activity')
  analyticsTimeActivity(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.useCase.analyticsTimeActivity(req, period, from, to);
  }

  @Get('analytics/loyalty')
  loyalty(
    @Req() req: PortalRequest,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    return this.useCase.loyalty(req, period, from, to, group);
  }

  @Get('analytics/cohorts')
  cohorts(
    @Req() req: PortalRequest,
    @Query('by') by?: 'month' | 'week',
    @Query('limit') limitStr?: string,
  ) {
    return this.useCase.cohorts(req, by, limitStr);
  }

  @Get('analytics/rfm')
  rfmAnalytics(@Req() req: PortalRequest) {
    return this.useCase.rfmAnalytics(req);
  }

  @Put('analytics/rfm/settings')
  updateRfmAnalyticsSettings(
    @Req() req: PortalRequest,
    @Body() dto: UpdateRfmSettingsDto,
  ) {
    return this.useCase.updateRfmAnalyticsSettings(req, dto);
  }
}
