import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramNotifyService } from './telegram-notify.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

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
    if (!expected) return { ok: true };
    if (!secret || secret.trim() !== expected) return { ok: true };
    try {
      await this.notify.processUpdate(update);
    } catch (err) {
      logIgnoredError(
        err,
        'TelegramNotifyController webhook',
        undefined,
        'debug',
      );
    }
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
