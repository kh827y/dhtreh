import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MerchantPanelService } from '../merchant-panel.service';
import { PortalGuard } from '../../portal-auth/portal.guard';
import type { ReviewSettingsInput } from '../../reviews/review.service';

@ApiTags('portal-reviews')
@Controller('portal/reviews')
@UseGuards(PortalGuard)
export class ReviewsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any): string {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('withCommentOnly') withCommentOnly?: string,
    @Query('ratingGte') ratingGte?: string,
    @Query('staffId') staffId?: string,
    @Query('outletId') outletId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      withCommentOnly: withCommentOnly === 'true' || withCommentOnly === '1',
      ratingGte: ratingGte ? parseInt(ratingGte, 10) : undefined,
      staffId: staffId && staffId !== 'all' ? staffId : undefined,
      outletId: outletId && outletId !== 'all' ? outletId : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.service.listReviews(this.getMerchantId(req), filters);
  }

  @Get('settings')
  async getSettings(@Req() req: any) {
    return this.service.getReviewSettings(this.getMerchantId(req));
  }

  @Put('settings')
  async updateSettings(@Req() req: any, @Body() body: ReviewSettingsInput) {
    return this.service.updateReviewSettings(this.getMerchantId(req), body);
  }
}
