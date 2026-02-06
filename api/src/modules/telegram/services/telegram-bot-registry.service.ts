import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  asString,
  formatErrorMessage,
  parseJson,
  toRecord,
} from '../telegram-bot.utils';
import type {
  BotConfig,
  RegisterBotResult,
  TelegramWebhookInfo,
} from '../telegram-bot.types';
import { TelegramBotApiService } from './telegram-bot-api.service';

@Injectable()
export class TelegramBotRegistryService {
  private readonly logger = new Logger(TelegramBotRegistryService.name);
  private bots: Map<string, BotConfig> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly api: TelegramBotApiService,
  ) {}

  private normalizeBaseUrl(value?: string | null): string | null {
    const trimmed = String(value || '')
      .trim()
      .replace(/\/$/, '');
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }

  private getApiBaseUrl(required: true): string;
  private getApiBaseUrl(required?: false): string | null;
  private getApiBaseUrl(required: boolean = false): string | null {
    const base = this.normalizeBaseUrl(this.configService.get('API_BASE_URL'));
    if (!base && required) {
      throw new Error('API_BASE_URL не настроен');
    }
    return base;
  }

  private getMiniappBaseUrl(): string | null {
    return this.normalizeBaseUrl(this.configService.get('MINIAPP_BASE_URL'));
  }

  async loadBots() {
    // В тестовой среде и при стабе Prisma (без моделей) — пропускаем
    if (this.appConfig.isTest()) return;
    const prisma = this.prisma as Partial<PrismaService>;
    if (!prisma.merchantSettings?.findMany) return;
    try {
      const apiBase = this.getApiBaseUrl();
      if (!apiBase) {
        this.logger.warn(
          'API_BASE_URL не настроен, Telegram боты не загружены',
        );
        return;
      }
      const merchants =
        (await prisma.merchantSettings!.findMany({
          select: {
            merchantId: true,
            telegramBotToken: true,
            telegramBotUsername: true,
          },
          where: {
            telegramBotToken: { not: null },
            telegramBotUsername: { not: null },
          },
        })) ?? [];

      for (const merchant of merchants) {
        if (merchant.telegramBotToken && merchant.telegramBotUsername) {
          const webhookUrl = `${apiBase}/telegram/webhook/${merchant.merchantId}`;

          this.bots.set(merchant.merchantId, {
            token: merchant.telegramBotToken,
            username: merchant.telegramBotUsername,
            merchantId: merchant.merchantId,
            webhookUrl,
          });

          // Устанавливаем webhook для бота
          await this.setupWebhook(merchant.merchantId);
        }
      }

      this.logger.log(`Загружено ${this.bots.size} ботов`);
    } catch (error: unknown) {
      // В тестах не шумим логами
      if (!this.appConfig.isTest()) {
        this.logger.error('Ошибка загрузки ботов:', formatErrorMessage(error));
      }
    }
  }

  getBot(merchantId: string): BotConfig | null {
    return this.bots.get(merchantId) ?? null;
  }

  async ensureBotLoaded(merchantId: string): Promise<BotConfig | null> {
    const cached = this.bots.get(merchantId);
    if (cached) return cached;
    try {
      const apiBase = this.getApiBaseUrl();
      if (!apiBase) return null;
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: {
          telegramBotToken: true,
          telegramBotUsername: true,
        },
      });
      if (settings?.telegramBotToken && settings.telegramBotUsername) {
        const webhookUrl = `${apiBase}/telegram/webhook/${merchantId}`;
        const bot: BotConfig = {
          token: settings.telegramBotToken,
          username: settings.telegramBotUsername,
          merchantId,
          webhookUrl,
        };
        this.bots.set(merchantId, bot);
        return bot;
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Не удалось загрузить данные бота для ${merchantId}: ${formatErrorMessage(
          error,
        )}`,
      );
    }
    return null;
  }

  async registerBot(
    merchantId: string,
    botToken: string,
  ): Promise<RegisterBotResult> {
    try {
      const apiBase = this.getApiBaseUrl();
      if (!apiBase) {
        return {
          success: false,
          username: '',
          webhookUrl: '',
          webhookError: 'API_BASE_URL не настроен',
        };
      }
      // Получаем информацию о боте
      const botInfo = await this.api.getBotInfo(botToken);

      // Формируем URL вебхука и секрет
      const webhookUrl = `${apiBase}/telegram/webhook/${merchantId}`;
      const secret = crypto.randomBytes(16).toString('hex');

      // Создаём/обновляем запись TelegramBot с секретом для верификации хука
      await this.prisma.telegramBot.upsert({
        where: { merchantId },
        update: {
          botToken: botToken,
          botUsername: botInfo.username,
          botId: String(botInfo.id),
          webhookUrl,
          webhookSecret: secret,
          isActive: false,
        },
        create: {
          merchantId,
          botToken: botToken,
          botUsername: botInfo.username,
          botId: String(botInfo.id),
          webhookUrl,
          webhookSecret: secret,
          isActive: false,
        },
      });

      // Настраиваем webhook с секретом
      let webhookError: string | null = null;
      let webhookOk = false;
      try {
        await this.api.setWebhook(botToken, webhookUrl, secret);
        webhookOk = true;
      } catch (error: unknown) {
        webhookError = this.extractTelegramError(error);
        this.logger.error(
          `Не удалось установить webhook для ${merchantId}: ${formatErrorMessage(
            error,
          )}`,
        );
      }
      if (webhookOk) {
        await this.prisma.telegramBot.update({
          where: { merchantId },
          data: { isActive: true },
        });
        const nextSettings: Record<string, unknown> = {
          telegramBotToken: botToken,
          telegramBotUsername: botInfo.username,
        };
        const miniappBase = this.getMiniappBaseUrl();
        if (miniappBase) {
          nextSettings.miniappBaseUrl = `${miniappBase}/?merchant=${merchantId}`;
        }
        await this.prisma.merchantSettings
          .update({
            where: { merchantId },
            data: nextSettings,
          })
          .catch((err) => {
            logIgnoredError(
              err,
              'TelegramBotRegistryService update merchant settings',
              this.logger,
              'debug',
              { merchantId },
            );
            return this.prisma.merchantSettings.create({
              data: { merchantId, ...nextSettings },
            });
          });

        await this.prisma.merchant.update({
          where: { id: merchantId },
          data: {
            telegramBotEnabled: true,
            telegramBotToken: botToken,
          },
        });

        // Устанавливаем команды бота
        await this.api.setBotCommands(botToken);

        // Добавляем в память
        this.bots.set(merchantId, {
          token: botToken,
          username: botInfo.username,
          merchantId,
          webhookUrl,
        });
      }

      return {
        success: webhookOk,
        username: botInfo.username,
        webhookUrl,
        webhookError,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Ошибка регистрации бота для ${merchantId}: ${formatErrorMessage(
          error,
        )}`,
      );
      throw error;
    }
  }

  private extractTelegramError(error: unknown): string {
    const rawMessage = formatErrorMessage(error);
    const trimmed = rawMessage
      .replace(/^Ошибка установки webhook:\s*/i, '')
      .trim();
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart !== -1) {
      const jsonPayload = trimmed.slice(jsonStart);
      try {
        const parsed = parseJson(jsonPayload);
        const payload = toRecord(parsed);
        const description =
          asString(payload?.description) ||
          asString(toRecord(payload?.result)?.description);
        if (description) return description;
      } catch (err) {
        logIgnoredError(
          err,
          'TelegramBotRegistryService parse telegram error',
          this.logger,
          'debug',
        );
      }
    }
    if (trimmed) return trimmed;
    if (rawMessage) return rawMessage;
    return 'Не удалось установить webhook';
  }

  async setupWebhook(merchantId: string) {
    const bot = this.bots.get(merchantId);
    if (!bot) return;

    try {
      // Попробуем достать секрет из таблицы TelegramBot; если нет — создадим/обновим с новым секретом
      let botRow = await this.prisma.telegramBot
        .findUnique({ where: { merchantId } })
        .catch((err) => {
          logIgnoredError(
            err,
            'TelegramBotRegistryService setupWebhook find bot',
            this.logger,
            'debug',
            { merchantId },
          );
          return null;
        });
      let secret = botRow?.webhookSecret || undefined;
      if (!botRow || !secret) {
        secret = crypto.randomBytes(16).toString('hex');
        botRow = await this.prisma.telegramBot.upsert({
          where: { merchantId },
          update: {
            botToken: bot.token,
            botUsername: bot.username,
            webhookUrl: bot.webhookUrl,
            webhookSecret: secret,
            isActive: true,
          },
          create: {
            merchantId,
            botToken: bot.token,
            botUsername: bot.username,
            webhookUrl: bot.webhookUrl,
            webhookSecret: secret,
            isActive: true,
          },
        });
      }
      await this.api.setWebhook(bot.token, bot.webhookUrl, secret);
      if (botRow?.isActive === false) {
        await this.prisma.telegramBot
          .update({
            where: { merchantId },
            data: { isActive: true },
          })
          .catch((err) => {
            logIgnoredError(
              err,
              'TelegramBotRegistryService setupWebhook update bot',
              this.logger,
              'debug',
              { merchantId },
            );
            return null;
          });
      }
      this.logger.log(`Webhook установлен для ${merchantId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Ошибка установки webhook для ${merchantId}: ${formatErrorMessage(
          error,
        )}`,
      );
    }
  }

  async fetchBotInfo(token: string) {
    return this.api.getBotInfo(token);
  }

  async fetchWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    return this.api.fetchWebhookInfo(token);
  }

  async rotateWebhookSecret(merchantId: string) {
    try {
      // Генерируем новый секрет
      const secret = crypto.randomBytes(16).toString('hex');

      // Обновим запись бота, если она есть
      const existing = await this.prisma.telegramBot
        .findUnique({ where: { merchantId } })
        .catch((err) => {
          logIgnoredError(
            err,
            'TelegramBotRegistryService rotateWebhookSecret find bot',
            this.logger,
            'debug',
            { merchantId },
          );
          return null;
        });
      if (existing) {
        await this.prisma.telegramBot.update({
          where: { merchantId },
          data: { webhookSecret: secret, isActive: true },
        });

        // Переустановим webhook с новым секретом
        const apiBase = this.getApiBaseUrl(true);
        const webhookUrl = `${apiBase}/telegram/webhook/${merchantId}`;
        await this.api.setWebhook(existing.botToken, webhookUrl, secret);
      } else {
        // Если записи нет, но бот зарегистрирован через настройки мерчанта — просто установим webhook с секретом
        const settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
        if (settings?.telegramBotToken) {
          const apiBase = this.getApiBaseUrl(true);
          const webhookUrl = `${apiBase}/telegram/webhook/${merchantId}`;
          const username = settings.telegramBotUsername;
          const botInfo = username
            ? { username, id: null }
            : await this.api.getBotInfo(settings.telegramBotToken);
          await this.prisma.telegramBot.upsert({
            where: { merchantId },
            update: {
              botToken: settings.telegramBotToken,
              botUsername: botInfo.username,
              botId: botInfo.id ? String(botInfo.id) : null,
              webhookUrl,
              webhookSecret: secret,
              isActive: true,
            },
            create: {
              merchantId,
              botToken: settings.telegramBotToken,
              botUsername: botInfo.username,
              botId: botInfo.id ? String(botInfo.id) : null,
              webhookUrl,
              webhookSecret: secret,
              isActive: true,
            },
          });
          await this.api.setWebhook(
            settings.telegramBotToken,
            webhookUrl,
            secret,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Ошибка ротации webhook секрета для ${merchantId}:`,
        error,
      );
      throw error;
    }
  }

  async deactivateBot(merchantId: string) {
    try {
      const existing = await this.prisma.telegramBot
        .findUnique({ where: { merchantId } })
        .catch((err) => {
          logIgnoredError(
            err,
            'TelegramBotRegistryService deactivate find bot',
            this.logger,
            'debug',
            { merchantId },
          );
          return null;
        });
      if (existing) {
        await this.api.deleteWebhook(existing.botToken);
        await this.prisma.telegramBot.update({
          where: { merchantId },
          data: { isActive: false },
        });
        await this.prisma.merchantSettings
          .update({
            where: { merchantId },
            data: { telegramBotToken: null },
          })
          .catch((err) => {
            logIgnoredError(
              err,
              'TelegramBotRegistryService deactivate update settings',
              this.logger,
              'debug',
              { merchantId },
            );
            return null;
          });
      } else {
        // Попробуем удалить webhook по токену из настроек мерчанта
        const settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
        if (settings?.telegramBotToken) {
          await this.api.deleteWebhook(settings.telegramBotToken);
        }
        if (settings?.telegramBotToken) {
          await this.prisma.merchantSettings
            .update({
              where: { merchantId },
              data: { telegramBotToken: null },
            })
            .catch((err) => {
              logIgnoredError(
                err,
                'TelegramBotRegistryService deactivate update settings',
                this.logger,
                'debug',
                { merchantId },
              );
              return null;
            });
        }
      }
      // Локально тоже уберем бота из карты
      this.bots.delete(merchantId);
      await this.prisma.merchant
        .update({
          where: { id: merchantId },
          data: { telegramBotEnabled: false },
        })
        .catch((err) => {
          logIgnoredError(
            err,
            'TelegramBotRegistryService deactivate update merchant',
            this.logger,
            'debug',
            { merchantId },
          );
          return null;
        });
    } catch (error) {
      this.logger.error(`Ошибка деактивации бота для ${merchantId}:`, error);
      throw error;
    }
  }
}
