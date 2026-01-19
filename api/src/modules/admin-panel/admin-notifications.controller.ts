import {
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { TelegramNotifyService } from '../telegram/telegram-notify.service';

@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notify: TelegramNotifyService,
    private readonly config: ConfigService,
  ) {}

  @Get('telegram-notify/state')
  async state() {
    const info = await this.notify.getWebhookInfo();
    const bot = await this.notify.getBotInfo();
    const isConfigured = this.notify.isConfigured();
    const botUsername = bot?.username || null;
    const botLink = bot?.username ? `https://t.me/${bot.username}` : null;
    return {
      ok: true,
      configured: isConfigured,
      botUsername,
      botLink,
      webhook: info ?? null,
    } as const;
  }

  @Post('telegram-notify/set-webhook')
  async setWebhook() {
    const base = this.config.get<string>('API_BASE_URL') || '';
    if (!base) {
      return { ok: false, error: 'API_BASE_URL is not configured' };
    }
    const result = await this.notify.setWebhook(base);
    if (!result) return { ok: false, error: 'Webhook setup failed' };
    return { ok: true, ...result };
  }

  @Post('telegram-notify/delete-webhook')
  async deleteWebhook() {
    await this.notify.deleteWebhook();
    return { ok: true } as const;
  }
}
