import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EvotorService } from './evotor.service';
import { MetricsService } from '../../metrics.service';
import { OAuthGuard } from '../../guards/oauth.guard';

@Controller('integrations/evotor')
export class EvotorController {
  constructor(private evotor: EvotorService, private metrics: MetricsService) {}

  @Post('register')
  @UseGuards(OAuthGuard)
  async register(@Body() body: { merchantId: string; token: string }) {
    try {
      const res = await this.evotor.registerApp(body.merchantId, body.token);
      this.metrics.inc('pos_requests_total', { provider: 'EVOTOR', endpoint: 'register', result: 'ok' });
      return res;
    } catch (e) {
      this.metrics.inc('pos_requests_total', { provider: 'EVOTOR', endpoint: 'register', result: 'error' });
      this.metrics.inc('pos_errors_total', { provider: 'EVOTOR', endpoint: 'register' });
      throw e;
    }
  }

  @Post('webhook/:integrationId')
  async webhook(@Param('integrationId') integrationId: string, @Body() webhook: any) {
    try {
      const res = await this.evotor.handleWebhook(integrationId, webhook);
      this.metrics.inc('pos_webhooks_total', { provider: 'EVOTOR' });
      this.metrics.inc('pos_requests_total', { provider: 'EVOTOR', endpoint: 'webhook', result: 'ok' });
      return res;
    } catch (e) {
      this.metrics.inc('pos_webhooks_total', { provider: 'EVOTOR' });
      this.metrics.inc('pos_requests_total', { provider: 'EVOTOR', endpoint: 'webhook', result: 'error' });
      this.metrics.inc('pos_errors_total', { provider: 'EVOTOR', endpoint: 'webhook' });
      throw e;
    }
  }

  @Get(':merchantId/stats')
  async stats(@Param('merchantId') merchantId: string) {
    return await this.evotor.getIntegrationStats(merchantId);
  }
}
