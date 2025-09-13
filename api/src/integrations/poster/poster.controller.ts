import { Body, Controller, Get, Post } from '@nestjs/common';
import { PosterService } from './poster.service';
import { MetricsService } from '../../metrics.service';

@Controller('integrations/poster')
export class PosterController {
  constructor(private svc: PosterService, private metrics: MetricsService) {}

  @Post('quote')
  async quote(@Body() body: any) {
    const res = await this.svc.quoteLoyalty(body);
    this.metrics.inc('pos_requests_total', { provider: 'POSTER', endpoint: 'quote', result: 'ok' });
    return res;
  }

  @Post('commit')
  async commit(@Body() body: any) {
    const res = await this.svc.commitLoyalty(body);
    this.metrics.inc('pos_requests_total', { provider: 'POSTER', endpoint: 'commit', result: 'ok' });
    return res;
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.svc.handleWebhook(payload);
  }

  @Get('health')
  async health() { return { ok: await this.svc.healthCheck() }; }
}
