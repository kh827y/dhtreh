import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ModulKassaService } from './modulkassa.service';
import { MetricsService } from '../../metrics.service';
import { OAuthGuard } from '../../guards/oauth.guard';

@Controller('integrations/modulkassa')
export class ModulKassaController {
  constructor(private svc: ModulKassaService, private metrics: MetricsService) {}

  @Post('quote')
  @UseGuards(OAuthGuard)
  async quote(@Body() body: any) {
    const res = await this.svc.quoteLoyalty(body);
    this.metrics.inc('pos_requests_total', { provider: 'MODULKASSA', endpoint: 'quote', result: 'ok' });
    return res;
  }

  @Post('commit')
  @UseGuards(OAuthGuard)
  async commit(@Body() body: any) {
    const res = await this.svc.commitLoyalty(body);
    this.metrics.inc('pos_requests_total', { provider: 'MODULKASSA', endpoint: 'commit', result: 'ok' });
    return res;
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.svc.handleWebhook(payload);
  }

  @Get('health')
  async health() { return { ok: await this.svc.healthCheck() }; }
}
