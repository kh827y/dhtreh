import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';

interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel' | string;
  username?: string;
  title?: string;
}

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private get token(): string | undefined {
    const v = this.config.get<string>('TELEGRAM_NOTIFY_BOT_TOKEN');
    return v && v.trim() ? v.trim() : undefined;
  }

  async getWebhookInfo(): Promise<{
    url?: string | null;
    hasError?: boolean;
    lastErrorDate?: number;
    lastErrorMessage?: string;
  } | null> {
    try {
      if (!this.token) return null;
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/getWebhookInfo`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data?.ok) return null;
      const info = data.result;
      return {
        url: info?.url ?? null,
        hasError: Boolean(info?.last_error_date),
        lastErrorDate: info?.last_error_date,
        lastErrorMessage: info?.last_error_message,
      };
    } catch (e) {
      this.logger.warn(`getWebhookInfo failed: ${e}`);
      return null;
    }
  }
  private get webhookSecret(): string | undefined {
    const v = this.config.get<string>('TELEGRAM_NOTIFY_WEBHOOK_SECRET');
    return v && v.trim() ? v.trim() : undefined;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  private async api(method: string, body: Record<string, any>) {
    if (!this.token) throw new Error('Notify bot token not configured');
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data?.ok)
      throw new Error(String(data?.description || 'Telegram API error'));
    return data.result;
  }

  async getBotInfo(): Promise<{
    id: number;
    username: string;
    firstName?: string;
  } | null> {
    try {
      if (!this.token) return null;
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/getMe`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data?.ok) return null;
      return {
        id: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
      };
    } catch (e) {
      this.logger.warn(`getBotInfo failed: ${e}`);
      return null;
    }
  }

  async setWebhook(apiBaseUrl: string): Promise<{ url: string } | null> {
    try {
      if (!this.token) return null;
      const url = `${apiBaseUrl.replace(/\/$/, '')}/telegram/notify/webhook`;
      await this.api('setWebhook', {
        url,
        secret_token: this.webhookSecret,
        allowed_updates: ['message', 'my_chat_member'],
        drop_pending_updates: true,
      });
      return { url };
    } catch (e) {
      this.logger.error(`setWebhook failed: ${e}`);
      return null;
    }
  }

  async deleteWebhook(): Promise<void> {
    try {
      if (!this.token) return;
      await this.api('deleteWebhook', { drop_pending_updates: true });
    } catch (e) {
      this.logger.warn(`deleteWebhook failed: ${e}`);
    }
  }

  private async sendMessage(chatId: number, text: string) {
    try {
      await this.api('sendMessage', { chat_id: chatId, text });
    } catch (e) {
      this.logger.warn(`sendMessage failed: ${e}`);
    }
  }

  private parseStartToken(text: string, botUsername?: string): string | null {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('/start')) return null;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) return parts[1];
    // handle /start@botname token
    if (parts.length >= 1) {
      const cmd = parts[0];
      if (botUsername && cmd.toLowerCase().startsWith('/start@') && parts[1])
        return parts[1];
    }
    return null;
  }

  private normalizeChat(c: any): TgChat | null {
    if (!c || typeof c !== 'object') return null;
    return {
      id: Number(c.id),
      type: String(c.type || ''),
      username: c.username || undefined,
      title: c.title || undefined,
    };
  }

  async processUpdate(update: any) {
    try {
      const msg = update?.message;
      if (!msg) return;
      const chat = this.normalizeChat(msg.chat);
      if (!chat) return;

      const botInfo = await this.getBotInfo();
      const token =
        typeof msg.text === 'string'
          ? this.parseStartToken(msg.text, botInfo?.username)
          : null;
      if (token) {
        await this.handleStartToken(chat, token);
        return;
      }

      // Optionally handle other updates (ignore for now)
    } catch (e) {
      this.logger.error(`processUpdate error: ${e}`);
    }
  }

  private async handleStartToken(chat: TgChat, token: string) {
    const now = new Date();
    const prismaAny = this.prisma as any;
    // Find invite
    const invite = await prismaAny.telegramStaffInvite
      .findFirst({ where: { token } })
      .catch(() => null);
    if (!invite) {
      await this.sendMessage(
        chat.id,
        'Неверный или просроченный токен. Обновите ссылку в портале.',
      );
      return;
    }
    if (invite.expiresAt && invite.expiresAt < now) {
      await this.sendMessage(
        chat.id,
        'Срок действия ссылки истёк. Сгенерируйте новую в портале.',
      );
      return;
    }

    // Upsert subscriber
    await prismaAny.telegramStaffSubscriber.upsert({
      where: {
        merchantId_chatId: {
          merchantId: invite.merchantId,
          chatId: String(chat.id),
        },
      },
      update: {
        chatType: chat.type,
        username: chat.username || null,
        title: chat.title || null,
        isActive: true,
        lastSeenAt: now,
      },
      create: {
        merchantId: invite.merchantId,
        chatId: String(chat.id),
        chatType: chat.type,
        username: chat.username || null,
        title: chat.title || null,
        addedAt: now,
        lastSeenAt: now,
        isActive: true,
      },
    });

    try {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: invite.merchantId },
      });
      await this.sendMessage(
        chat.id,
        `Подписка на уведомления для мерчанта «${merchant?.name ?? invite.merchantId}» активирована.`,
      );
    } catch {
      await this.sendMessage(chat.id, `Подписка на уведомления активирована.`);
    }
  }
}
