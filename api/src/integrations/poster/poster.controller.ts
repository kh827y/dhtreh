import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PosterService } from './poster.service';
import { MetricsService } from '../../metrics.service';
import { OAuthGuard } from '../../guards/oauth.guard';

@Controller('integrations/poster')
export class PosterController {
  constructor(
    private svc: PosterService,
    private metrics: MetricsService,
  ) {}

  @Post('register')
  @UseGuards(OAuthGuard)
  async register(
    @Body() body: { merchantId: string; appId: string; appSecret: string },
  ) {
    try {
      const res = await this.svc.registerIntegration(body.merchantId, {
        appId: body.appId,
        appSecret: body.appSecret,
      });
      this.metrics.inc('pos_requests_total', {
        provider: 'POSTER',
        endpoint: 'register',
        result: 'ok',
      });
      return res;
    } catch (e) {
      this.metrics.inc('pos_requests_total', {
        provider: 'POSTER',
        endpoint: 'register',
        result: 'error',
      });
      this.metrics.inc('pos_errors_total', {
        provider: 'POSTER',
        endpoint: 'register',
      });
      throw e;
    }
  }

  @Post('quote')
  @UseGuards(OAuthGuard)
  async quote(@Body() body: any) {
    const res = await this.svc.quoteLoyalty(body);
    this.metrics.inc('pos_requests_total', {
      provider: 'POSTER',
      endpoint: 'quote',
      result: 'ok',
    });
    return res;
  }

  @Post('commit')
  @UseGuards(OAuthGuard)
  async commit(@Body() body: any) {
    const res = await this.svc.commitLoyalty(body);
    this.metrics.inc('pos_requests_total', {
      provider: 'POSTER',
      endpoint: 'commit',
      result: 'ok',
    });
    return res;
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.svc.handleWebhook(payload);
  }

  @Get('health')
  async health() {
    return { ok: await this.svc.healthCheck() };
  }
}
