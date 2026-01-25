import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalGuard } from '../portal-auth/portal.guard';
import { CustomerAudiencesService } from './customer-audiences.service';
import { SegmentActiveDto, SegmentPayloadDto } from './dto';

type PortalRequest = Request & {
  portalMerchantId?: string;
};

@Controller('portal')
@UseGuards(PortalGuard)
export class CustomerAudiencesController {
  constructor(private readonly service: CustomerAudiencesService) {}

  private merchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  @Get('audiences')
  listAudiences(
    @Req() req: PortalRequest,
    @Query('includeSystem') includeSystem?: string,
  ) {
    const include = includeSystem === '1' || includeSystem === 'true';
    return this.service.listSegments(this.merchantId(req), {
      includeSystem: include,
    });
  }

  @Post('audiences')
  createAudience(@Req() req: PortalRequest, @Body() body: SegmentPayloadDto) {
    return this.service.createSegment(this.merchantId(req), body);
  }

  @Put('audiences/:id')
  updateAudience(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: SegmentPayloadDto,
  ) {
    return this.service.updateSegment(this.merchantId(req), id, body);
  }

  @Post('audiences/:id/activate')
  activateAudience(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: SegmentActiveDto,
  ) {
    return this.service.setSegmentActive(
      this.merchantId(req),
      id,
      body.active !== false,
    );
  }

  @Post('audiences/:id/refresh')
  refreshAudience(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.service.refreshSegmentMetrics(this.merchantId(req), id);
  }

  @Delete('audiences/:id')
  deleteAudience(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.service.deleteSegment(this.merchantId(req), id);
  }
}
