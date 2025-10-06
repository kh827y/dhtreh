import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from '../admin.guard';
import { AdminIpGuard } from '../admin-ip.guard';
import { TelegramNotifyService } from '../telegram/telegram-notify.service';

@UseGuards(AdminGuard, AdminIpGuard)
@Controller('notifications')
export class AdminNotificationsController {
  constructor(private readonly notify: TelegramNotifyService, private readonly config: ConfigService) {}

  @Get('telegram-notify/state')
  async state() {
    const info = await this.notify.getWebhookInfo();
    const bot = await this.notify.getBotInfo();
    const isConfigured = this.notify.isConfigured();
    const botUsername = bot?.username || null;
    const botLink = bot?.username ? `https://t.me/${bot.username}` : null;
    return { ok: true, configured: isConfigured, botUsername, botLink, webhook: info ?? null } as const;
  }

  @Post('telegram-notify/set-webhook')
  async setWebhook() {
    const base = this.config.get<string>('API_BASE_URL') || '';
    if (!base) return { ok: false, error: 'API_BASE_URL is not configured' } as any;
    const r = await this.notify.setWebhook(base);
    return { ok: true, ...r } as any;
  }

  @Post('telegram-notify/delete-webhook')
  async deleteWebhook() {
    await this.notify.deleteWebhook();
    return { ok: true } as const;
  }
}
