import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../portal-auth/portal.guard';
import { CommunicationsService } from './communications.service';
import type { Response } from 'express';

@Controller('portal/communications')
@UseGuards(PortalGuard)
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('assets/:id')
  async downloadAsset(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const asset = await this.service.getAsset(this.merchantId(req), id);
    res.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Length',
      String(asset.byteSize ?? asset.data?.length ?? 0),
    );
    if (asset.fileName)
      res.setHeader('X-Filename', encodeURIComponent(asset.fileName));
    res.send(asset.data);
  }
}
