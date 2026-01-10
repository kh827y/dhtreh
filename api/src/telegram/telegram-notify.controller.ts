import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
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
    if (!expected || !secret || secret.trim() !== expected) {
      // Silent ack to avoid retries
      return { ok: true };
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
