import { Body, Controller, Get, Headers, Post, UseGuards, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramNotifyService } from './telegram-notify.service';
import { AdminGuard } from '../admin.guard';
import { AdminIpGuard } from '../admin-ip.guard';

@Controller()
export class TelegramNotifyController {
  constructor(
    private readonly notify: TelegramNotifyService,
    private readonly config: ConfigService,
  ) {}

  // Unified staff notifications bot webhook
  @Post('telegram/notify/webhook')
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: any,
  ) {
    const expected = (
      this.config.get<string>('TELEGRAM_NOTIFY_WEBHOOK_SECRET') || ''
    ).trim();
    if (!expected) {
      throw new ServiceUnavailableException('Webhook secret is not configured');
    }
    if (!secret || secret.trim() !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    await this.notify.processUpdate(update);
    return { ok: true };
  }

  // Health: webhook info (admin/diagnostics)
  @Get('telegram/notify/webhook-info')
  @UseGuards(AdminGuard, AdminIpGuard)
  async webhookInfo() {
    const info = await this.notify.getWebhookInfo();
    return { ok: true, info } as const;
  }
}
