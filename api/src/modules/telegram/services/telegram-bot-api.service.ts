import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import {
  fetchWithTimeout,
  recordExternalRequest,
  resultFromStatus,
} from '../../../shared/http/external-http.util';
import {
  asNumber,
  asString,
  formatErrorMessage,
  parseJson,
  toRecord,
} from '../telegram-bot.utils';
import type { TelegramWebhookInfo } from '../telegram-bot.types';

@Injectable()
export class TelegramBotApiService {
  private readonly logger = new Logger(TelegramBotApiService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly metrics: MetricsService,
  ) {}

  private getTelegramTimeoutMs(): number {
    return this.appConfig.getTelegramHttpTimeoutMs();
  }

  private getTelegramEndpoint(url: string): string {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || 'unknown';
    } catch (err) {
      this.logger.debug(
        `TelegramBotApiService parse endpoint error: ${formatErrorMessage(err)}`,
      );
      return 'unknown';
    }
  }

  private buildTelegramContext(url: string, label: string) {
    return {
      label,
      url,
      provider: 'telegram',
      endpoint: this.getTelegramEndpoint(url),
    };
  }

  private async fetchTelegram(url: string, init?: RequestInit) {
    const timeoutMs = this.getTelegramTimeoutMs();
    const method = init?.method ? String(init.method) : 'GET';
    const context = {
      ...this.buildTelegramContext(url, 'telegram-bot.request'),
      method,
    };
    return fetchWithTimeout(url, init, {
      timeoutMs,
      logger: this.logger,
      context,
      metrics: this.metrics,
    });
  }

  private async assertTelegramResponseOk<T = unknown>(
    res: globalThis.Response,
  ): Promise<T> {
    const raw = await res.text();
    const data = parseJson(raw);
    const payload = toRecord(data);
    const ok = res.ok && (payload?.ok === undefined || payload.ok === true);
    const errorCode = asNumber(payload?.error_code);
    const rateLimited = res.status === 429 || errorCode === 429;
    recordExternalRequest(
      this.metrics,
      this.buildTelegramContext(res.url, 'telegram-bot.response'),
      rateLimited ? 'rate_limited' : resultFromStatus(res.status, ok),
      res.status,
    );
    if (!ok) {
      const description =
        asString(payload?.description) ||
        asString(payload?.error_message) ||
        raw ||
        `Telegram API error (${res.status})`;
      throw new Error(description);
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'result')) {
      return payload.result as T;
    }
    if (data !== null) return data as T;
    return raw ? ({ raw } as T) : (null as T);
  }

  async callTelegram(
    token: string,
    method: string,
    body: Record<string, unknown>,
  ) {
    const res = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return this.assertTelegramResponseOk(res);
  }

  async sendMessage(
    token: string,
    chatId: string | number,
    text: string,
    keyboard?: Record<string, unknown> | null,
    parseMode?: string,
  ) {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (keyboard) payload.reply_markup = keyboard;
    if (parseMode) payload.parse_mode = parseMode;
    return this.callTelegram(token, 'sendMessage', payload);
  }

  async sendPhoto(
    token: string,
    chatId: string,
    payload: {
      buffer: Buffer;
      mimeType?: string;
      fileName?: string;
      caption?: string;
      parseMode?: string;
    },
  ) {
    const FormDataCtor = globalThis.FormData as
      | (new () => FormData)
      | undefined;
    const BlobCtor = globalThis.Blob as
      | (new (parts: BlobPart[], options?: BlobPropertyBag) => Blob)
      | undefined;
    if (!FormDataCtor || !BlobCtor) {
      throw new Error('Формат FormData/Blob недоступен в рантайме Node');
    }
    const form = new FormDataCtor();
    form.append('chat_id', chatId);
    if (payload.caption) form.append('caption', payload.caption);
    if (payload.parseMode) form.append('parse_mode', payload.parseMode);
    const blobPayload = Uint8Array.from(payload.buffer);
    const blob = new BlobCtor([blobPayload], {
      type: payload.mimeType || 'image/jpeg',
    });
    form.append('photo', blob, payload.fileName || 'image.jpg');
    const res = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      {
        method: 'POST',
        body: form,
      },
    );
    await this.assertTelegramResponseOk(res);
  }

  async answerCallbackQuery(token: string, queryId: string) {
    const res = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
        }),
      },
    );
    await this.assertTelegramResponseOk(res);
  }

  async setWebhook(token: string, url: string, secretToken?: string) {
    const response = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: secretToken,
          allowed_updates: ['message', 'callback_query', 'inline_query'],
          drop_pending_updates: true,
        }),
      },
    );

    return this.assertTelegramResponseOk(response);
  }

  async deleteWebhook(token: string) {
    const response = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: true }),
      },
    );
    try {
      await this.assertTelegramResponseOk(response);
    } catch (error: unknown) {
      this.logger.warn(`Ошибка удаления webhook: ${formatErrorMessage(error)}`);
    }
  }

  async getBotInfo(token: string) {
    const response = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/getMe`,
    );
    const data = await this.assertTelegramResponseOk(response);
    const record = toRecord(data);
    const id = asNumber(record?.id);
    const username = asString(record?.username);
    if (!id || !username) {
      throw new Error('Некорректный ответ Telegram');
    }
    return {
      id,
      username,
      firstName: asString(record?.first_name) ?? undefined,
    };
  }

  async setBotCommands(token: string) {
    const commands = [
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'balance', description: 'Показать баланс баллов' },
      { command: 'miniapp', description: 'Открыть приложение лояльности' },
      { command: 'help', description: 'Помощь' },
    ];

    const res = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/setMyCommands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
      },
    );
    try {
      await this.assertTelegramResponseOk(res);
    } catch (error: unknown) {
      this.logger.warn(
        `Не удалось установить команды бота: ${formatErrorMessage(error)}`,
      );
    }
  }

  async fetchWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    const response = await this.fetchTelegram(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    );
    const data = await this.assertTelegramResponseOk(response);
    const record = toRecord(data);
    if (!record) {
      throw new Error('Некорректный ответ Telegram');
    }
    return {
      url: asString(record.url) ?? '',
      has_custom_certificate: Boolean(record.has_custom_certificate),
      pending_update_count: Math.max(
        0,
        Math.floor(asNumber(record.pending_update_count) ?? 0),
      ),
      last_error_date: asNumber(record.last_error_date) ?? undefined,
      last_error_message: asString(record.last_error_message) ?? undefined,
      max_connections: Math.max(
        0,
        Math.floor(asNumber(record.max_connections) ?? 0),
      ),
      ip_address: asString(record.ip_address) ?? undefined,
    };
  }
}
