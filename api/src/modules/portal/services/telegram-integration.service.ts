import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { TelegramBotService } from '../../telegram/telegram-bot.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  fetchWithTimeout,
  recordExternalRequest,
  readResponseJsonSafe,
  readResponseTextSafe,
  resultFromStatus,
} from '../../../shared/http/external-http.util';

export interface TelegramIntegrationState {
  enabled: boolean;
  botUsername: string | null;
  botLink: string | null;
  miniappUrl: string | null;
  connectionHealthy: boolean;
  lastSyncAt: string | null;
  integrationId: string | null;
  tokenMask: string | null;
}

export interface TelegramIntegrationResponse extends TelegramIntegrationState {
  message?: string;
}

interface IntegrationTouchPayload {
  isActive: boolean;
  username?: string | null;
  tokenMask?: string | null;
  error?: string | null;
  lastSyncAt?: Date;
}

@Injectable()
export class PortalTelegramIntegrationService {
  private readonly provider = 'TELEGRAM_MINI_APP';
  private readonly logger = new Logger(PortalTelegramIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBots: TelegramBotService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async getState(merchantId: string): Promise<TelegramIntegrationState> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true, telegramBot: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    let settings = merchant.settings;
    if (!settings) {
      settings = await this.prisma.merchantSettings.create({
        data: { merchantId },
      });
    }

    const integration = await this.prisma.integration.findFirst({
      where: { merchantId, provider: this.provider },
    });

    const username =
      settings.telegramBotUsername || merchant.telegramBot?.botUsername || null;
    const normalizedUsername = username
      ? username.startsWith('@')
        ? username
        : `@${username}`
      : null;
    const botLink = normalizedUsername
      ? `https://t.me/${normalizedUsername.replace(/^@/, '')}`
      : null;
    const tokenMask = this.extractTokenMask(integration?.credentials);

    // Build Mini App URL to show/copy in portal (ensure ?merchant= present)
    let miniappUrl: string | null = settings.miniappBaseUrl ?? null;
    if (!miniappUrl) {
      const base = this.config.get<string>('MINIAPP_BASE_URL') || '';
      miniappUrl = base ? String(base) : null;
    }
    if (miniappUrl) {
      const trimmed = String(miniappUrl).trim();
      const lowered = trimmed.toLowerCase();
      if (
        !trimmed ||
        lowered === 'undefined' ||
        lowered === 'null' ||
        lowered.startsWith('undefined') ||
        lowered.startsWith('null')
      ) {
        miniappUrl = null;
      } else {
        miniappUrl = trimmed;
      }
    }
    if (miniappUrl && !/[?&]merchant=/.test(miniappUrl)) {
      miniappUrl = `${miniappUrl.replace(/\/$/, '')}/?merchant=${encodeURIComponent(merchantId)}`;
    }
    if (
      miniappUrl &&
      miniappUrl.includes('?merchant=') &&
      !miniappUrl.includes('/?merchant=')
    ) {
      miniappUrl = miniappUrl.replace('?merchant=', '/?merchant=');
    }

    return {
      enabled: Boolean(merchant.telegramBotEnabled),
      botUsername: normalizedUsername,
      botLink,
      miniappUrl,
      connectionHealthy: Boolean(
        merchant.telegramBotEnabled && merchant.telegramBot?.isActive,
      ),
      lastSyncAt: integration?.lastSync
        ? integration.lastSync.toISOString()
        : null,
      integrationId: integration?.id ?? null,
      tokenMask,
    };
  }

  async connect(
    merchantId: string,
    botTokenRaw: string,
  ): Promise<TelegramIntegrationResponse> {
    const botToken = String(botTokenRaw || '').trim();
    if (!botToken) {
      throw new BadRequestException('Укажите токен бота из BotFather');
    }

    try {
      const result = await this.telegramBots.registerBot(merchantId, botToken);
      if (!result.success) {
        const description =
          result.webhookError || 'Не удалось установить webhook';
        throw new BadRequestException(description);
      }
      const mask = this.maskToken(botToken);
      await this.touchIntegration(merchantId, {
        isActive: true,
        username: result.username,
        tokenMask: mask,
        error: null,
        lastSyncAt: new Date(),
      });
      const state = await this.getState(merchantId);
      const baseMessage = 'Telegram Mini App подключена';
      let menuMessage = '';
      try {
        await this.setupMenu(merchantId);
        menuMessage = ' Меню‑кнопка установлена автоматически.';
      } catch (error: unknown) {
        logIgnoredError(
          error,
          'PortalTelegramIntegrationService setup menu',
          this.logger,
          'debug',
          { merchantId },
        );
        const message = this.formatErrorMessage(
          error,
          'Не удалось установить меню‑кнопку',
        );
        menuMessage = ` Меню‑кнопка не установлена: ${message}.`;
      }
      const miniappMessage = state?.miniappUrl
        ? ''
        : ' Mini App URL не настроен. Проверьте MINIAPP_BASE_URL.';
      const mainAppMessage =
        ' Для корректной работы ссылок вида t.me/<бот>/?startapp=... необходимо установить Main App у бота в BotFather на тот же URL, что и у Menu Button (это действие недоступно через Bot API).';
      return {
        ...state,
        message: `${baseMessage}${menuMessage}${miniappMessage} ${mainAppMessage}`,
      };
    } catch (error: unknown) {
      const description = this.formatErrorMessage(
        error,
        'Не удалось подключить бота',
      );
      throw new BadRequestException(description);
    }
  }

  async disconnect(merchantId: string): Promise<TelegramIntegrationResponse> {
    await this.telegramBots.deactivateBot(merchantId);
    await this.prisma.merchant
      .update({
        where: { id: merchantId },
        data: { telegramBotEnabled: false, telegramBotToken: null },
      })
      .catch((err) => {
        logIgnoredError(
          err,
          'PortalTelegramIntegrationService disconnect merchant update',
          this.logger,
          'debug',
          { merchantId },
        );
        return null;
      });
    await this.prisma.merchantSettings
      .update({
        where: { merchantId },
        data: {
          telegramBotToken: null,
          telegramBotUsername: null,
          miniappBaseUrl: null,
        },
      })
      .catch((err) => {
        logIgnoredError(
          err,
          'PortalTelegramIntegrationService disconnect settings update',
          this.logger,
          'debug',
          { merchantId },
        );
        return null;
      });
    await this.touchIntegration(merchantId, {
      isActive: false,
      tokenMask: null,
      error: null,
      lastSyncAt: new Date(),
    });
    const state = await this.getState(merchantId);
    return { ...state, message: 'Интеграция отключена' };
  }

  async check(merchantId: string): Promise<TelegramIntegrationResponse> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true, telegramBot: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const settings =
      merchant.settings ??
      (await this.prisma.merchantSettings.create({ data: { merchantId } }));
    const token = settings.telegramBotToken;
    if (!token) {
      throw new BadRequestException(
        'Токен бота не задан. Подключите Telegram Mini App.',
      );
    }

    let username =
      settings.telegramBotUsername || merchant.telegramBot?.botUsername || null;
    let healthy = false;
    let message = 'Подключение к боту не удалось';
    let errorText: string | null = null;

    try {
      const botInfo = await this.telegramBots.fetchBotInfo(token);
      username = botInfo.username || username;
      const webhookInfo = await this.telegramBots.fetchWebhookInfo(token);
      const botRow =
        merchant.telegramBot ||
        (await this.prisma.telegramBot
          .findUnique({ where: { merchantId } })
          .catch((err) => {
            logIgnoredError(
              err,
              'PortalTelegramIntegrationService check bot row',
              this.logger,
              'debug',
              { merchantId },
            );
            return null;
          }));
      const expectedUrl =
        botRow?.webhookUrl || this.buildWebhookUrl(merchantId);
      healthy = Boolean(
        webhookInfo?.url &&
          expectedUrl &&
          webhookInfo.url === expectedUrl &&
          !webhookInfo.last_error_date,
      );
      message = healthy
        ? 'Подключение к боту работает'
        : 'Подключение к боту не удалось';
      await this.prisma.merchantSettings
        .update({
          where: { merchantId },
          data: { telegramBotUsername: username ?? null },
        })
        .catch((err) => {
          logIgnoredError(
            err,
            'PortalTelegramIntegrationService check settings update',
            this.logger,
            'debug',
            { merchantId },
          );
          return null;
        });
      if (botRow) {
        await this.prisma.telegramBot
          .update({
            where: { merchantId },
            data: {
              isActive: healthy,
              botUsername: username ?? botRow.botUsername,
              webhookUrl: botRow.webhookUrl ?? expectedUrl ?? undefined,
            },
          })
          .catch((err) => {
            logIgnoredError(
              err,
              'PortalTelegramIntegrationService check bot update',
              this.logger,
              'debug',
              { merchantId },
            );
            return null;
          });
      }
    } catch (error: unknown) {
      logIgnoredError(
        error,
        'PortalTelegramIntegrationService check connection',
        this.logger,
        'debug',
        { merchantId },
      );
      healthy = false;
      errorText = this.formatErrorMessage(error, 'Ошибка проверки подключения');
      message = `Подключение к боту не удалось${errorText ? `: ${errorText}` : ''}`;
    }

    await this.touchIntegration(merchantId, {
      isActive: healthy && Boolean(merchant.telegramBotEnabled),
      username: username ?? null,
      error: healthy ? null : (errorText ?? message),
      lastSyncAt: new Date(),
    });

    const state = await this.getState(merchantId);
    return { ...state, message };
  }

  // Generate deep link for Mini App using startapp param (plain string)
  async generateLink(
    merchantId: string,
    _outletId?: string,
  ): Promise<{ deepLink: string; startParam: string }> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const username = settings?.telegramBotUsername;
    if (!username)
      throw new BadRequestException('Бот не подключён для данного мерчанта');

    const startParamRequired = Boolean(settings?.telegramStartParamRequired);
    const startParam = startParamRequired ? merchantId : '';
    const uname = username.startsWith('@') ? username.slice(1) : username;
    const deepLink = startParam
      ? `https://t.me/${uname}?startapp=${encodeURIComponent(startParam)}`
      : `https://t.me/${uname}`;
    return { deepLink, startParam };
  }

  async setupMenu(merchantId: string): Promise<{ ok: true }> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    if (!settings?.telegramBotToken)
      throw new BadRequestException('Токен бота не задан');
    const base =
      settings?.miniappBaseUrl || `${this.config.get('MINIAPP_BASE_URL')}`;
    if (!base) throw new BadRequestException('MINIAPP_BASE_URL не задан');
    let url = String(base);
    const hasMerchantParam = /[?&]merchant=/.test(url);
    if (!hasMerchantParam) {
      url = `${url.replace(/\/$/, '')}/?merchant=${encodeURIComponent(merchantId)}`;
    }
    // normalize to have '/?merchant=' instead of '?merchant='
    if (url.includes('?merchant=') && !url.includes('/?merchant=')) {
      url = url.replace('?merchant=', '/?merchant=');
    }
    const token = settings.telegramBotToken;
    const context = {
      label: 'portal-telegram.setChatMenuButton',
      merchantId,
      provider: 'telegram',
      endpoint: 'setChatMenuButton',
    };
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/setChatMenuButton`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: 'Открыть приложение',
            web_app: { url },
          },
        }),
      },
      {
        timeoutMs: this.appConfig.getTelegramHttpTimeoutMs(),
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
      const txt = await readResponseTextSafe(res, {
        logger: this.logger,
        context,
        fallback: 'Telegram API error',
      });
      throw new BadRequestException(
        `Не удалось установить кнопку меню: ${txt}`,
      );
    }
    const data: unknown = await readResponseJsonSafe(res, {
      logger: this.logger,
      context,
    });
    const ok =
      data && typeof data === 'object' && 'ok' in data
        ? (data as { ok?: unknown }).ok
        : null;
    recordExternalRequest(
      this.metrics,
      context,
      resultFromStatus(res.status, ok === true),
      res.status,
    );
    if (ok !== true)
      throw new BadRequestException('Telegram API: setChatMenuButton failed');
    return { ok: true as const };
  }

  private buildWebhookUrl(merchantId: string): string | null {
    const base = this.config.get<string>('API_BASE_URL');
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/telegram/webhook/${merchantId}`;
  }

  private maskToken(token: string): string {
    const trimmed = token.trim();
    if (trimmed.length <= 8) {
      return `${trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)))}…${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
  }

  private extractTokenMask(credentials: unknown): string | null {
    if (!credentials || typeof credentials !== 'object') return null;
    try {
      const value = credentials as Record<string, unknown>;
      return typeof value?.tokenMask === 'string' ? value.tokenMask : null;
    } catch (err) {
      logIgnoredError(
        err,
        'PortalTelegramIntegrationService extractTokenMask',
        undefined,
        'debug',
      );
      return null;
    }
  }

  private formatErrorMessage(error: unknown, fallback: string): string {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? (error as { message?: unknown }).message
        : null;
    if (typeof message === 'string' && message.trim()) return message;
    return fallback;
  }

  private async touchIntegration(
    merchantId: string,
    payload: IntegrationTouchPayload,
  ): Promise<string> {
    const existing = await this.prisma.integration.findFirst({
      where: { merchantId, provider: this.provider },
    });

    const nextConfig: Record<string, any> = existing?.config
      ? { ...(existing.config as Record<string, any>) }
      : { kind: 'telegram-mini-app' };
    if (payload.username !== undefined) {
      nextConfig.username = payload.username ?? null;
    }

    let nextCredentials: Prisma.InputJsonValue | null | undefined;
    if (payload.tokenMask === undefined) {
      nextCredentials =
        (existing?.credentials as Prisma.InputJsonValue | null | undefined) ??
        undefined;
    } else if (payload.tokenMask === null) {
      nextCredentials = null;
    } else {
      nextCredentials = { tokenMask: payload.tokenMask };
    }

    const baseData = {
      type: 'COMMUNICATION',
      isActive: payload.isActive,
      lastSync: payload.lastSyncAt ?? new Date(),
      errorCount: payload.error ? (existing?.errorCount ?? 0) + 1 : 0,
      lastError: payload.error ?? null,
    };

    const normalizedCredentials =
      nextCredentials === undefined ? undefined : nextCredentials;

    const updateData: Prisma.IntegrationUpdateInput = {
      ...baseData,
      config: nextConfig as Prisma.InputJsonValue,
    };

    if (normalizedCredentials !== undefined) {
      updateData.credentials =
        normalizedCredentials === null
          ? Prisma.JsonNull
          : normalizedCredentials;
    }

    if (existing) {
      await this.prisma.integration.update({
        where: { id: existing.id },
        data: updateData,
      });
      return existing.id;
    }

    const created = await this.prisma.integration.create({
      data: {
        merchantId,
        provider: this.provider,
        type: baseData.type,
        config: nextConfig as Prisma.InputJsonValue,
        credentials:
          normalizedCredentials === undefined
            ? undefined
            : normalizedCredentials === null
              ? Prisma.JsonNull
              : normalizedCredentials,
        isActive: baseData.isActive,
        lastSync: baseData.lastSync,
        errorCount: baseData.errorCount,
        lastError: baseData.lastError,
      },
    });
    return created.id;
  }
}
