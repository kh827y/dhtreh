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
  type SegmentPayload,
} from './customer-audiences.service';

@Controller('portal')
@UseGuards(PortalGuard)
export class CustomerAudiencesController {
  constructor(private readonly service: CustomerAudiencesService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('audiences')
  listAudiences(
    @Req() req: any,
    @Query('includeSystem') includeSystem?: string,
  ) {
    const include = includeSystem === '1' || includeSystem === 'true';
    return this.service.listSegments(this.merchantId(req), {
      includeSystem: include,
    });
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
