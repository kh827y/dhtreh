import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PortalGuard } from '../portal-auth/portal.guard';
import {
  CustomerAudiencesService,
  type CustomerFilters,
  type SegmentPayload,
} from './customer-audiences.service';

@Controller('portal')
@UseGuards(PortalGuard)
export class CustomerAudiencesController {
  constructor(private readonly service: CustomerAudiencesService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('customers')
  listCustomers(
    @Req() req: any,
    @Query()
    query: {
      search?: string;
      segmentId?: string;
      tags?: string;
      gender?: string;
      minVisits?: string;
      maxVisits?: string;
      rfmClasses?: string;
      limit?: string;
      offset?: string;
    },
  ) {
    const filters: CustomerFilters = {
      search: query.search,
      segmentId: query.segmentId,
      tags: query.tags ? query.tags.split(',').filter(Boolean) : undefined,
      gender: query.gender
        ? query.gender.split(',').filter(Boolean)
        : undefined,
      minVisits: query.minVisits ? Number(query.minVisits) : undefined,
      maxVisits: query.maxVisits ? Number(query.maxVisits) : undefined,
      rfmClasses: query.rfmClasses
        ? query.rfmClasses.split(',').filter(Boolean)
        : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    };
    return this.service.listCustomers(this.merchantId(req), filters);
  }

  @Get('customers/:id')
  getCustomer(@Req() req: any, @Param('id') id: string) {
    return this.service.getCustomer(this.merchantId(req), id);
  }

  @Get('audiences')
  listAudiences(@Req() req: any) {
    return this.service.listSegments(this.merchantId(req));
  }

  @Post('audiences')
  createAudience(@Req() req: any, @Body() body: SegmentPayload) {
    return this.service.createSegment(this.merchantId(req), body);
  }

  @Put('audiences/:id')
  updateAudience(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SegmentPayload,
  ) {
    return this.service.updateSegment(this.merchantId(req), id, body);
  }

  @Post('audiences/:id/activate')
  activateAudience(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.service.setSegmentActive(
      this.merchantId(req),
      id,
      body.active !== false,
    );
  }

  @Post('audiences/:id/archive')
  archiveAudience(@Req() req: any, @Param('id') id: string) {
    return this.service.archiveSegment(this.merchantId(req), id);
  }

  @Post('audiences/:id/refresh')
  refreshAudience(@Req() req: any, @Param('id') id: string) {
    return this.service.refreshSegmentMetrics(this.merchantId(req), id);
  }
}
