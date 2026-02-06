import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../core/config/app-config.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { TelegramStaffNotificationsService } from './staff-notifications.service';
import { TelegramStaffActorType } from '@prisma/client';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import {
  fetchWithTimeout,
  recordExternalRequest,
  readResponseJsonSafe,
  readResponseTextSafe,
  resultFromStatus,
} from '../../shared/http/external-http.util';

interface TgChat {
  id: number;
  type: string;
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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    logIgnoredError(err, 'telegram-notify parseJson', undefined, 'debug');
    return null;
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'unknown_error';
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
export class TelegramNotifyService implements OnModuleInit {
  private readonly logger = new Logger(TelegramNotifyService.name);
  private readonly sendQueue: SendQueueItem[] = [];
  private sending = false;
  private lastSentAt = 0;
  private readonly lastChatSentAt = new Map<string, number>();
  private readonly minGlobalIntervalMs = 50;
  private readonly minChatIntervalMs = 1000;
  private readonly maxSendAttempts = 3;
  private botInfoCache: {
    value: { id: number; username: string; firstName?: string } | null;
    expiresAt: number;
  } | null = null;
  private readonly botInfoTtlMs = 5 * 60 * 1000;
  private readonly botInfoErrorTtlMs = 30 * 1000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private appConfig: AppConfigService,
    private metrics: MetricsService,
    @Inject(forwardRef(() => TelegramStaffNotificationsService))
    private staffNotifications: TelegramStaffNotificationsService,
  ) {}

  async onModuleInit() {
    const apiBase = (this.config.get<string>('API_BASE_URL') || '').trim();
    if (!apiBase || !this.token) return;
    if (!this.webhookSecret) {
      this.logger.warn(
        'TELEGRAM_NOTIFY_WEBHOOK_SECRET is not set, skip webhook setup',
      );
      return;
    }
    const result = await this.setWebhook(apiBase);
    if (!result) {
      this.logger.warn('Auto webhook setup failed');
    } else {
      this.logger.log(`Webhook configured: ${result.url}`);
    }
  }

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
      const context = {
        label: 'telegram-notify.getWebhookInfo',
        provider: 'telegram',
        endpoint: 'getWebhookInfo',
      };
      const res = await fetchWithTimeout(
        `https://api.telegram.org/bot${this.token}/getWebhookInfo`,
        undefined,
        {
          timeoutMs: this.getTelegramTimeoutMs(),
          logger: this.logger,
          context,
          metrics: this.metrics,
        },
      );
      if (!res.ok) {
        recordExternalRequest(
          this.metrics,
          context,
          resultFromStatus(res.status, false),
          res.status,
        );
        throw new Error(
          await readResponseTextSafe(res, {
            logger: this.logger,
            context,
          }),
        );
      }
      const data = (await readResponseJsonSafe(res, {
        logger: this.logger,
        context,
      })) as unknown;
      const payload = toRecord(data);
      const ok = res.ok && payload?.ok === true;
      recordExternalRequest(
        this.metrics,
        context,
        resultFromStatus(res.status, ok),
        res.status,
      );
      if (!ok) return null;
      const info = toRecord(payload.result);
      return {
        url: asString(info?.url),
        hasError: Boolean(asNumber(info?.last_error_date)),
        lastErrorDate: asNumber(info?.last_error_date) ?? undefined,
        lastErrorMessage: asString(info?.last_error_message) ?? undefined,
      };
    } catch (e) {
      this.logger.warn(`getWebhookInfo failed: ${formatErrorMessage(e)}`);
      return null;
    }
  }
  private get webhookSecret(): string | undefined {
    const v = this.config.get<string>('TELEGRAM_NOTIFY_WEBHOOK_SECRET');
    return v && v.trim() ? v.trim() : undefined;
  }

  private getTelegramTimeoutMs(): number {
    return this.appConfig.getTelegramHttpTimeoutMs();
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
        this.logger.warn(`send queue failed: ${formatErrorMessage(error)}`);
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
          logIgnoredError(
            error,
            'TelegramNotifyService send failed',
            this.logger,
            'debug',
            { chatId: item.chatId },
          );
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
    const nextChat =
      (this.lastChatSentAt.get(key) || 0) + this.minChatIntervalMs;
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
    const context = {
      label: 'telegram-notify.sendMessage',
      chatId,
      provider: 'telegram',
      endpoint: 'sendMessage',
    };
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
      {
        timeoutMs: this.getTelegramTimeoutMs(),
        logger: this.logger,
        context,
        metrics: this.metrics,
      },
    );
    const raw = await readResponseTextSafe(res, {
      logger: this.logger,
      context,
      fallback: 'Telegram API error',
    });
    const data = parseJson(raw);
    const payload = toRecord(data);
    const ok = res.ok && payload?.ok === true;
    const errorCode = asNumber(payload?.error_code);
    const rateLimited = res.status === 429 || errorCode === 429;
    recordExternalRequest(
      this.metrics,
      context,
      rateLimited ? 'rate_limited' : resultFromStatus(res.status, ok),
      res.status,
    );
    if (!ok) {
      const params = toRecord(payload?.parameters);
      const retryAfter = Number(
        params?.retry_after ?? payload?.retry_after ?? 0,
      );
      const description =
        asString(payload?.description) || raw || 'Telegram API error';
      if (res.status === 429 || errorCode === 429) {
        const delaySec =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
        throw new TelegramRateLimitError(delaySec, description);
      }
      throw new TelegramSendError(description, res.status);
    }
  }

  private async api<T>(method: string, body: Record<string, unknown>) {
    if (!this.token) throw new Error('Notify bot token not configured');
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const context = {
      label: `telegram-notify.${method}`,
      provider: 'telegram',
      endpoint: method,
    };
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: this.getTelegramTimeoutMs(),
        logger: this.logger,
        context,
        metrics: this.metrics,
      },
    );
    if (!res.ok) {
      recordExternalRequest(
        this.metrics,
        context,
        resultFromStatus(res.status, false),
        res.status,
      );
      throw new Error(
        await readResponseTextSafe(res, {
          logger: this.logger,
          context,
        }),
      );
    }
    const data = (await readResponseJsonSafe(res, {
      logger: this.logger,
      context,
    })) as unknown;
    const payload = toRecord(data);
    if (!payload || payload.ok !== true) {
      const description = asString(payload?.description);
      const errorCode = asNumber(payload?.error_code);
      const rateLimited = res.status === 429 || errorCode === 429;
      recordExternalRequest(
        this.metrics,
        context,
        rateLimited ? 'rate_limited' : resultFromStatus(res.status, false),
        res.status,
      );
      throw new Error(description || 'Telegram API error');
    }
    recordExternalRequest(
      this.metrics,
      context,
      resultFromStatus(res.status, true),
      res.status,
    );
    return payload.result as T;
  }

  async getBotInfo(): Promise<{
    id: number;
    username: string;
    firstName?: string;
  } | null> {
    const now = Date.now();
    if (this.botInfoCache && this.botInfoCache.expiresAt > now) {
      return this.botInfoCache.value;
    }
    try {
      if (!this.token) return null;
      const context = {
        label: 'telegram-notify.getMe',
        provider: 'telegram',
        endpoint: 'getMe',
      };
      const res = await fetchWithTimeout(
        `https://api.telegram.org/bot${this.token}/getMe`,
        undefined,
        {
          timeoutMs: this.getTelegramTimeoutMs(),
          logger: this.logger,
          context,
          metrics: this.metrics,
        },
      );
      if (!res.ok) {
        recordExternalRequest(
          this.metrics,
          context,
          resultFromStatus(res.status, false),
          res.status,
        );
        throw new Error(
          await readResponseTextSafe(res, {
            logger: this.logger,
            context,
          }),
        );
      }
      const data = (await readResponseJsonSafe(res, {
        logger: this.logger,
        context,
      })) as unknown;
      const payload = toRecord(data);
      const ok = res.ok && payload?.ok === true;
      recordExternalRequest(
        this.metrics,
        context,
        resultFromStatus(res.status, ok),
        res.status,
      );
      if (!ok) return null;
      const result = toRecord(payload.result);
      const id = asNumber(result?.id);
      const username = asString(result?.username);
      if (!id || !username) return null;
      const value = {
        id,
        username,
        firstName: asString(result?.first_name) ?? undefined,
      };
      this.botInfoCache = { value, expiresAt: now + this.botInfoTtlMs };
      return value;
    } catch (e) {
      this.logger.warn(`getBotInfo failed: ${formatErrorMessage(e)}`);
      this.botInfoCache = {
        value: null,
        expiresAt: now + this.botInfoErrorTtlMs,
      };
      return null;
    }
  }

  async setWebhook(apiBaseUrl: string): Promise<{ url: string } | null> {
    try {
      if (!this.token) return null;
      const base = apiBaseUrl.trim();
      if (!base) return null;
      if (!this.webhookSecret) {
        this.logger.warn('Webhook secret missing, skip setWebhook');
        return null;
      }
      const url = `${base.replace(/\/$/, '')}/telegram/notify/webhook`;
      await this.api('setWebhook', {
        url,
        secret_token: this.webhookSecret,
        allowed_updates: ['message', 'my_chat_member'],
        drop_pending_updates: true,
      });
      return { url };
    } catch (e) {
      this.logger.error(`setWebhook failed: ${formatErrorMessage(e)}`);
      return null;
    }
  }

  async deleteWebhook(): Promise<void> {
    try {
      if (!this.token) return;
      await this.api('deleteWebhook', { drop_pending_updates: true });
    } catch (e) {
      this.logger.warn(`deleteWebhook failed: ${formatErrorMessage(e)}`);
    }
  }

  private async sendMessage(chatId: number | string, text: string) {
    try {
      await this.enqueueSend(chatId, text);
    } catch (e) {
      this.logger.warn(`sendMessage failed: ${formatErrorMessage(e)}`);
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

  private normalizeChat(value: unknown): TgChat | null {
    const c = toRecord(value);
    if (!c) return null;
    const id = asNumber(c.id);
    const type = asString(c.type);
    if (!id || !type) return null;
    return {
      id,
      type,
      username: asString(c.username) ?? undefined,
      title: asString(c.title) ?? undefined,
    };
  }

  async processUpdate(update: unknown) {
    try {
      const updateRecord = toRecord(update);
      const msg = toRecord(updateRecord?.message);
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
      this.logger.error(`processUpdate error: ${formatErrorMessage(e)}`);
    }
  }

  private async handleStartToken(chat: TgChat, token: string) {
    const now = new Date();
    // Find invite
    const invite = await this.prisma.telegramStaffInvite
      .findFirst({ where: { token } })
      .catch((err) => {
        logIgnoredError(
          err,
          'TelegramNotifyService find invite',
          this.logger,
          'debug',
          { token },
        );
        return null;
      });
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
    const claimed = await this.prisma.telegramStaffInvite
      .updateMany({
        where: {
          id: invite.id,
          token: invite.token,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { expiresAt: now },
      })
      .catch((err) => {
        logIgnoredError(
          err,
          'TelegramNotifyService claim invite',
          this.logger,
          'debug',
          { inviteId: invite.id, merchantId: invite.merchantId },
        );
        return { count: 0 };
      });
    if (!claimed?.count) {
      await this.sendMessage(
        chat.id,
        'Ссылка уже использована. Сгенерируйте новую в портале.',
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

    const existing = await this.prisma.telegramStaffSubscriber
      .findUnique({
        where: {
          merchantId_chatId: { merchantId: invite.merchantId, chatId },
        },
      })
      .catch((err) => {
        logIgnoredError(
          err,
          'TelegramNotifyService find subscriber',
          this.logger,
          'debug',
          { merchantId: invite.merchantId, chatId },
        );
        return null;
      });
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
    } catch (err) {
      logIgnoredError(
        err,
        'telegram-notify merchant lookup',
        this.logger,
        'debug',
      );
      await this.sendMessage(chat.id, `Подписка на уведомления активирована.`);
    }
  }
}
