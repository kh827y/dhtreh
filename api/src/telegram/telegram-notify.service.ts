import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { TelegramStaffNotificationsService } from './staff-notifications.service';
import { TelegramStaffActorType } from '@prisma/client';

interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel' | string;
  username?: string;
  title?: string;
}

class TelegramRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterSec: number, message?: string) {
    super(message || 'Telegram rate limit');
    this.retryAfterMs = Math.max(0, Math.round(retryAfterSec * 1000));
  }
}

class TelegramSendError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

type SendQueueItem = {
  chatId: number | string;
  text: string;
  resolve: () => void;
  reject: (error: unknown) => void;
  attempts: number;
};

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);
  private readonly sendQueue: SendQueueItem[] = [];
  private sending = false;
  private lastSentAt = 0;
  private readonly lastChatSentAt = new Map<string, number>();
  private readonly minGlobalIntervalMs = 50;
  private readonly minChatIntervalMs = 1000;
  private readonly maxSendAttempts = 3;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject(forwardRef(() => TelegramStaffNotificationsService))
    private staffNotifications: TelegramStaffNotificationsService,
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

  private async sleep(ms: number) {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async enqueueSend(chatId: number | string, text: string) {
    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ chatId, text, resolve, reject, attempts: 0 });
      this.processQueue().catch((error) => {
        this.logger.warn(`send queue failed: ${error}`);
      });
    });
  }

  private async processQueue() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.sendQueue.length > 0) {
        const item = this.sendQueue.shift();
        if (!item) continue;
        try {
          await this.sendWithRetry(item);
          item.resolve();
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.sending = false;
    }
  }

  private async waitForSlot(chatId: number | string) {
    const now = Date.now();
    const key = String(chatId);
    const nextGlobal = this.lastSentAt + this.minGlobalIntervalMs;
    const nextChat = (this.lastChatSentAt.get(key) || 0) + this.minChatIntervalMs;
    const delay = Math.max(0, nextGlobal - now, nextChat - now);
    if (delay > 0) await this.sleep(delay);
  }

  private markSent(chatId: number | string) {
    const now = Date.now();
    this.lastSentAt = now;
    this.lastChatSentAt.set(String(chatId), now);
  }

  private retryDelayMs(error: unknown, attempt: number): number | null {
    if (error instanceof TelegramRateLimitError) {
      return error.retryAfterMs;
    }
    if (error instanceof TelegramSendError) {
      if (error.status && error.status >= 500) {
        return Math.min(5000, 500 * Math.pow(2, attempt));
      }
      return null;
    }
    return Math.min(5000, 500 * Math.pow(2, attempt));
  }

  private async sendWithRetry(item: SendQueueItem) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.maxSendAttempts; attempt += 1) {
      try {
        await this.waitForSlot(item.chatId);
        await this.sendMessageDirect(item.chatId, item.text);
        this.markSent(item.chatId);
        return;
      } catch (error) {
        lastError = error;
        const delay = this.retryDelayMs(error, attempt);
        if (delay === null) break;
        await this.sleep(delay);
      }
    }
    throw lastError ?? new Error('Failed to send Telegram message');
  }

  private async sendMessageDirect(chatId: number | string, text: string) {
    if (!this.token) throw new Error('Notify bot token not configured');
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    const ok = res.ok && data?.ok;
    if (!ok) {
      const retryAfter = Number(
        data?.parameters?.retry_after ?? data?.retry_after ?? 0,
      );
      const description = String(
        data?.description || raw || 'Telegram API error',
      );
      if (res.status === 429 || data?.error_code === 429) {
        const delaySec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
        throw new TelegramRateLimitError(delaySec, description);
      }
      throw new TelegramSendError(description, res.status);
    }
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

  private async sendMessage(chatId: number | string, text: string) {
    try {
      await this.enqueueSend(chatId, text);
    } catch (e) {
      this.logger.warn(`sendMessage failed: ${e}`);
    }
  }

  async sendStaffMessage(chatId: string, text: string) {
    await this.enqueueSend(chatId, text);
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

    const chatId = String(chat.id);
    const chatType = String(chat.type || 'private');
    const isGroup =
      chatType.includes('group') ||
      chatType === 'channel' ||
      chatType === 'supergroup';
    const inviteActor: TelegramStaffActorType =
      invite.actorType ?? TelegramStaffActorType.STAFF;
    const actorType = isGroup ? TelegramStaffActorType.GROUP : inviteActor;
    const staffId = invite.staffId ?? null;

    const existing = await prismaAny.telegramStaffSubscriber
      .findUnique({
        where: {
          merchantId_chatId: { merchantId: invite.merchantId, chatId },
        },
      })
      .catch(() => null);
    if (existing?.isActive) {
      await this.sendMessage(
        chat.id,
        'Уведомления уже подключены для этого мерчанта.',
      );
      return;
    }

    await this.staffNotifications.ensureInviteMetadata(invite.id, actorType);
    await this.staffNotifications.ensureSubscriber(invite.merchantId, chatId, {
      chatType,
      username: chat.username ?? null,
      title: chat.title ?? null,
      staffId,
      actorType,
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
