import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AtolService } from './atol.service';
import { MetricsService } from '../../metrics.service';
import { OAuthGuard } from '../../guards/oauth.guard';

@Controller('integrations/atol')
export class AtolController {
  constructor(
    private atol: AtolService,
    private metrics: MetricsService,
  ) {}

  @Post('receipt')
  @UseGuards(OAuthGuard)
  async sendReceipt(
    @Body()
    body: {
      merchantId: string;
      orderId: string;
      receipt: any;
      loyaltyData?: any;
    },
  ) {
    try {
      const res = await this.atol.processLoyaltyWithReceipt(
        body.merchantId,
        body.orderId,
        body.receipt,
        body.loyaltyData,
      );
      this.metrics.inc('pos_requests_total', {
        provider: 'ATOL',
        endpoint: 'receipt',
        result: 'ok',
      });
      return res;
    } catch (e) {
      this.metrics.inc('pos_requests_total', {
        provider: 'ATOL',
        endpoint: 'receipt',
        result: 'error',
      });
      this.metrics.inc('pos_errors_total', {
        provider: 'ATOL',
        endpoint: 'receipt',
      });
      throw e;
    }
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    try {
      const res = await this.atol.handleAtolWebhook(payload);
      this.metrics.inc('pos_requests_total', {
        provider: 'ATOL',
        endpoint: 'webhook',
        result: 'ok',
      });
      return res;
    } catch (e) {
      this.metrics.inc('pos_requests_total', {
        provider: 'ATOL',
        endpoint: 'webhook',
        result: 'error',
      });
      this.metrics.inc('pos_errors_total', {
        provider: 'ATOL',
        endpoint: 'webhook',
      });
      throw e;
    }
  }

  @Get('health')
  async health() {
    const ok = await this.atol.healthCheck();
    return { ok };
  }
}
