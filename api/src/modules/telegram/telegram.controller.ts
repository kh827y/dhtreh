import {
  Body,
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { MetricsService } from '../../core/metrics/metrics.service';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';

@Controller()
export class TelegramController {
  constructor(
    private bots: TelegramBotService,
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  // Telegram webhook per merchant: verifies X-Telegram-Bot-Api-Secret-Token
  @Post('telegram/webhook/:merchantId')
  async webhook(
    @Param('merchantId') merchantId: string,
    @Headers('x-telegram-bot-api-secret-token')
    secretHeader: string | undefined,
    @Body() update: unknown,
  ) {
    const bot = await this.prisma.telegramBot
      .findUnique({ where: { merchantId } })
      .catch(() => null);
    if (!bot || !bot.isActive) return { ok: true };
    if (
      !bot.webhookSecret ||
      !secretHeader ||
      secretHeader !== bot.webhookSecret
    ) {
      // Silent acknowledge to avoid retries storm, but do not process
      return { ok: true };
    }
    try {
      await this.bots.processWebhook(merchantId, update);
    } catch {
      // Do not propagate to Telegram to avoid retries storm.
      // We intentionally drop the update on failure (best-effort processing).
      try {
        this.metrics.inc('telegram_updates_failed_total');
      } catch {}
      return { ok: true };
    }
    try {
      this.metrics.inc('telegram_updates_total');
    } catch {}
    return { ok: true };
  }

  // Admin: register a bot for merchant with BotFather token
  @Post('merchants/:id/telegram/register')
  @UseGuards(AdminGuard, AdminIpGuard)
  @UseInterceptors(AdminAuditInterceptor)
  async register(
    @Param('id') merchantId: string,
    @Body() body: { botToken?: string } | null,
  ) {
    const botToken =
      typeof body?.botToken === 'string' ? body.botToken.trim() : '';
    if (!botToken) return { ok: false, error: 'botToken required' };
    const res = await this.bots.registerBot(merchantId, botToken);
    if (!res.success) {
      return {
        ok: false,
        error: res.webhookError || 'Не удалось установить webhook',
        ...res,
      };
    }
    return { ok: true, ...res };
  }

  // Admin: rotate webhook secret and update webhook
  @Post('merchants/:id/telegram/rotate-webhook')
  @UseGuards(AdminGuard, AdminIpGuard)
  @UseInterceptors(AdminAuditInterceptor)
  async rotateWebhook(@Param('id') merchantId: string) {
    await this.bots.rotateWebhookSecret(merchantId);
    return { ok: true };
  }

  // Admin: deactivate bot
  @Delete('merchants/:id/telegram')
  @UseGuards(AdminGuard, AdminIpGuard)
  @UseInterceptors(AdminAuditInterceptor)
  async deactivate(@Param('id') merchantId: string) {
    await this.bots.deactivateBot(merchantId);
    return { ok: true };
  }
}
