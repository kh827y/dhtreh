import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface BotConfig {
  token: string;
  username: string;
  merchantId: string;
  webhookUrl: string;
}
interface RegisterBotResult {
  success: boolean;
  username: string;
  webhookUrl: string;
  webhookError?: string | null;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections: number;
  ip_address?: string;
}

interface RegisterBotResult {
  success: boolean;
  username: string;
  webhookUrl: string;
  webhookError?: string | null;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections: number;
  ip_address?: string;
}

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private bots: Map<string, BotConfig> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.loadBots();
  }

  async loadBots() {
    // В тестовой среде и при стабе Prisma (без моделей) — пропускаем
    if (process.env.NODE_ENV === 'test') return;
    const prismaAny = this.prisma as any;
    if (!prismaAny?.merchantSettings?.findMany) return;
    try {
      const merchants = await prismaAny.merchantSettings.findMany({
        where: {
          telegramBotToken: { not: null },
          telegramBotUsername: { not: null },
        },
      });

      for (const merchant of merchants) {
        if (merchant.telegramBotToken && merchant.telegramBotUsername) {
          const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchant.merchantId}`;

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
    } catch (error) {
      // В тестах не шумим логами
      if (process.env.NODE_ENV !== 'test') {
        this.logger.error('Ошибка загрузки ботов:', error);
      }
    }
  }

  async registerBot(
    merchantId: string,
    botToken: string,
  ): Promise<RegisterBotResult> {
    try {
      // Получаем информацию о боте
      const botInfo = await this.getBotInfo(botToken);

      // Формируем URL вебхука и секрет
      const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchantId}`;
      const secret = crypto.randomBytes(16).toString('hex');

      // Сохраняем настройки мерчанта (для MiniApp и бэкапа токена)
      await this.prisma.merchantSettings.update({
        where: { merchantId },
        data: {
          telegramBotToken: botToken,
          telegramBotUsername: botInfo.username,
          miniappBaseUrl: `${this.configService.get('MINIAPP_BASE_URL')}/?merchant=${merchantId}`,
        },
      });

      await this.prisma.merchant.update({
        where: { id: merchantId },
        data: {
          telegramBotEnabled: true,
          telegramBotToken: botToken,
        },
      });

      // Создаём/обновляем запись TelegramBot с секретом для верификации хука
      await this.prisma.telegramBot.upsert({
        where: { merchantId },
        update: {
          botToken: botToken,
          botUsername: botInfo.username,
          botId: String(botInfo.id),
          webhookUrl,
          webhookSecret: secret,
          isActive: true,
        },
        create: {
          merchantId,
          botToken: botToken,
          botUsername: botInfo.username,
          botId: String(botInfo.id),
          webhookUrl,
          webhookSecret: secret,
          isActive: true,
        },
      });

      // Настраиваем webhook с секретом
      let webhookError: string | null = null;
      try {
        await this.setWebhook(botToken, webhookUrl, secret);
      } catch (error: any) {
        webhookError = this.extractTelegramError(error);
        this.logger.error(
          `Не удалось установить webhook для ${merchantId}:`,
          error,
        );
      }

      // Устанавливаем команды бота
      await this.setBotCommands(botToken);

      // Добавляем в память
      this.bots.set(merchantId, {
        token: botToken,
        username: botInfo.username,
        merchantId,
        webhookUrl,
      });

      return {
        success: true,
        username: botInfo.username,
        webhookUrl,
        webhookError,
      };
    } catch (error) {
      this.logger.error(`Ошибка регистрации бота для ${merchantId}:`, error);
      throw error;
    }
  }

  private extractTelegramError(error: any): string {
    const rawMessage = error?.message ? String(error.message) : '';
    const trimmed = rawMessage
      .replace(/^Ошибка установки webhook:\s*/i, '')
      .trim();
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart !== -1) {
      const jsonPayload = trimmed.slice(jsonStart);
      try {
        const parsed = JSON.parse(jsonPayload);
        const description = parsed?.description || parsed?.result?.description;
        if (typeof description === 'string') {
          return description;
        }
      } catch {}
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
        .catch(() => null);
      let secret = botRow?.webhookSecret || undefined;
      // Если бот деактивирован — не устанавливаем вебхук
      if (botRow && botRow.isActive === false) {
        try {
          await this.deleteWebhook(bot.token);
        } catch {}
        this.logger.log(
          `Бот ${merchantId} деактивирован — webhook удален/не устанавливается`,
        );
        return;
      }
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
      await this.setWebhook(bot.token, bot.webhookUrl, secret);
      this.logger.log(`Webhook установлен для ${merchantId}`);
    } catch (error) {
      this.logger.error(`Ошибка установки webhook для ${merchantId}:`, error);
    }
  }

  private async setWebhook(token: string, url: string, secretToken?: string) {
    const response = await fetch(
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

    if (!response.ok) {
      throw new Error(`Ошибка установки webhook: ${await response.text()}`);
    }

    return response.json();
  }

  private async getBotInfo(token: string) {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!response.ok) {
      throw new Error(`Неверный токен бота: ${await response.text()}`);
    }

    const data = await response.json();
    return {
      id: data.result.id,
      username: data.result.username,
      firstName: data.result.first_name,
    };
  }

  private async setBotCommands(token: string) {
    const commands = [
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'balance', description: 'Показать баланс баллов' },
      { command: 'miniapp', description: 'Открыть приложение лояльности' },
      { command: 'help', description: 'Помощь' },
    ];

    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
  }

  async fetchBotInfo(token: string) {
    return this.getBotInfo(token);
  }

  async fetchWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
    );
    if (!response.ok) {
      throw new Error(`Ошибка получения webhook: ${await response.text()}`);
    }
    const data = await response.json();
    if (!data?.ok) {
      throw new Error(String(data?.description || 'Telegram API error'));
    }
    return data.result as TelegramWebhookInfo;
  }

  async processWebhook(merchantId: string, update: any) {
    const bot = this.bots.get(merchantId);
    if (!bot) {
      this.logger.warn(`Бот не найден для мерчанта ${merchantId}`);
      return;
    }

    try {
      // Обработка команд
      if (update.message?.text) {
        const text = update.message.text;
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;

        if (text.startsWith('/start')) {
          await this.handleStart(bot, chatId, userId, merchantId);
        } else if (text === '/balance') {
          await this.handleBalance(bot, chatId, userId, merchantId);
        } else if (text === '/miniapp') {
          await this.handleMiniApp(bot, chatId, merchantId);
        } else if (text === '/help') {
          await this.handleHelp(bot, chatId);
        }
      }

      // Обработка callback кнопок
      if (update.callback_query) {
        await this.handleCallbackQuery(bot, update.callback_query, merchantId);
      }
    } catch (error) {
      this.logger.error(`Ошибка обработки webhook для ${merchantId}:`, error);
    }
  }

  private async handleStart(
    bot: BotConfig,
    chatId: number,
    userId: number,
    merchantId: string,
  ) {
    // Пер-мерчантная учётка на основе tgId
    const tgId = String(userId);
    const customerId = await this.resolveCustomerIdForMerchant(
      tgId,
      merchantId,
    );

    // Получаем настройки мерчанта
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const message = settings?.miniappThemePrimary
      ? `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${customerId}\n\nИспользуйте кнопки ниже для работы с программой.`
      : `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${customerId}`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть приложение',
            web_app: { url: `${settings?.miniappBaseUrl}` },
          },
        ],
        [
          { text: '💰 Баланс', callback_data: 'balance' },
          { text: '📊 История', callback_data: 'history' },
        ],
        [{ text: '❓ Помощь', callback_data: 'help' }],
      ],
    };

    await this.sendMessage(bot.token, chatId, message, keyboard);
  }

  private async handleBalance(
    bot: BotConfig,
    chatId: number,
    userId: number,
    merchantId: string,
  ) {
    const tgId = String(userId);
    const customerId = await this.resolveCustomerIdForMerchant(
      tgId,
      merchantId,
    );

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId,
        merchantId,
        type: 'POINTS',
      },
    });

    const balance = wallet?.balance || 0;
    const message = `💰 Ваш баланс: ${balance} баллов`;

    await this.sendMessage(bot.token, chatId, message);
  }

  private async handleMiniApp(
    bot: BotConfig,
    chatId: number,
    merchantId: string,
  ) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть приложение лояльности',
            web_app: { url: settings?.miniappBaseUrl || '' },
          },
        ],
      ],
    };

    await this.sendMessage(
      bot.token,
      chatId,
      '📱 Нажмите кнопку ниже, чтобы открыть приложение:',
      keyboard,
    );
  }

  private async handleHelp(bot: BotConfig, chatId: number) {
    const helpText = `
ℹ️ *Помощь по программе лояльности*

Доступные команды:
/start - Начать работу с ботом
/balance - Показать текущий баланс
/miniapp - Открыть приложение
/help - Показать эту справку

*Как использовать:*
1. Откройте приложение через кнопку
2. Покажите QR-код кассиру при покупке
3. Получайте и тратьте баллы

*Правила начисления:*
• 5% от суммы покупки в баллах
• 1 балл = 1 рубль при списании
• Максимум 50% от чека можно оплатить баллами

По всем вопросам обращайтесь к администратору.
    `;

    await this.sendMessage(bot.token, chatId, helpText, null, 'Markdown');
  }

  private async handleCallbackQuery(
    bot: BotConfig,
    query: any,
    merchantId: string,
  ) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // Отвечаем на callback, чтобы убрать "часики"
    await this.answerCallbackQuery(bot.token, query.id);

    switch (data) {
      case 'balance':
        await this.handleBalance(bot, chatId, userId, merchantId);
        break;
      case 'history':
        await this.handleTransactionHistory(bot, chatId, userId, merchantId);
        break;
      case 'help':
        await this.handleHelp(bot, chatId);
        break;
    }
  }

  private async handleTransactionHistory(
    bot: BotConfig,
    chatId: number,
    userId: number,
    merchantId: string,
  ) {
    const tgId = String(userId);
    const customerId = await this.resolveCustomerIdForMerchant(
      tgId,
      merchantId,
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        customerId,
        merchantId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (transactions.length === 0) {
      await this.sendMessage(bot.token, chatId, '📊 У вас пока нет операций');
      return;
    }

    let message = '📊 *Последние операции:*\n\n';
    for (const tx of transactions) {
      const emoji = tx.type === 'EARN' ? '➕' : '➖';
      const date = new Date(tx.createdAt).toLocaleDateString('ru-RU');
      message += `${emoji} ${Math.abs(tx.amount)} баллов (${date})\n`;
    }

    await this.sendMessage(bot.token, chatId, message, null, 'Markdown');
  }

  private async sendMessage(
    token: string,
    chatId: number,
    text: string,
    keyboard?: any,
    parseMode?: string,
  ) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: keyboard,
        parse_mode: parseMode,
      }),
    });
  }

  private async answerCallbackQuery(token: string, queryId: string) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: queryId,
      }),
    });
  }

  private async deleteWebhook(token: string) {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: true }),
      },
    );
    if (!response.ok) {
      this.logger.warn(`Ошибка удаления webhook: ${await response.text()}`);
    }
  }

  // Отправка уведомлений клиентам
  async sendNotification(
    customerId: string,
    merchantId: string,
    message: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    let tgId = customer?.tgId ?? null;
    if (!tgId) {
      try {
        const mapping = await (
          this.prisma as any
        ).customerTelegram?.findUnique?.({ where: { customerId } });
        tgId = mapping?.tgId ?? null;
      } catch {}
    }
    if (!tgId) return;

    const bot = this.bots.get(merchantId);
    if (!bot) return;

    try {
      await this.sendMessage(bot.token, Number(tgId), message);
      return { success: true };
    } catch (error) {
      this.logger.error(`Ошибка отправки уведомления: ${error}`);
      return { success: false, error };
    }
  }

  // Resolve or create per-merchant mapping from tgId to customerId
  private async resolveCustomerIdForMerchant(
    tgId: string,
    merchantId: string,
  ): Promise<string> {
    const ct = (this.prisma as any).customerTelegram;
    try {
      const bound = await ct?.findUnique?.({
        where: { merchantId_tgId: { merchantId, tgId } },
      });
      if (bound?.customerId) return String(bound.customerId);
    } catch {}

    // Check if this tgId has any binding; if none, reuse or create global customer with tgId
    let hasAnyBinding = false;
    try {
      const anyBind = await ct?.findFirst?.({ where: { tgId } });
      hasAnyBinding = !!anyBind;
    } catch {}

    if (!hasAnyBinding) {
      let customer = await this.prisma.customer
        .findUnique({ where: { tgId } })
        .catch(() => null);
      if (!customer) {
        customer = await this.prisma.customer.create({ data: { tgId } });
      }
      try {
        await ct?.create?.({
          data: { merchantId, tgId, customerId: customer.id },
        });
      } catch {}
      return customer.id;
    }

    // Otherwise create a new merchant-scoped customer without tgId
    const created = await this.prisma.customer.create({ data: {} });
    try {
      await ct?.create?.({
        data: { merchantId, tgId, customerId: created.id },
      });
    } catch {}
    return created.id;
  }

  // Админ: ротация секрета webhook бота
  async rotateWebhookSecret(merchantId: string) {
    try {
      // Генерируем новый секрет
      const secret = crypto.randomBytes(16).toString('hex');

      // Обновим запись бота, если она есть
      const existing = await this.prisma.telegramBot
        .findUnique({ where: { merchantId } })
        .catch(() => null);
      if (existing) {
        await this.prisma.telegramBot.update({
          where: { merchantId },
          data: { webhookSecret: secret, isActive: true },
        });

        // Переустановим webhook с новым секретом
        const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchantId}`;
        await this.setWebhook(existing.botToken, webhookUrl, secret);
      } else {
        // Если записи нет, но бот зарегистрирован через настройки мерчанта — просто установим webhook с секретом
        const settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
        if (settings?.telegramBotToken) {
          const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchantId}`;
          await this.setWebhook(settings.telegramBotToken, webhookUrl, secret);
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

  // Админ: деактивация бота (удаление webhook и отметка в БД)
  async deactivateBot(merchantId: string) {
    try {
      const existing = await this.prisma.telegramBot
        .findUnique({ where: { merchantId } })
        .catch(() => null);
      if (existing) {
        await this.deleteWebhook(existing.botToken);
        await this.prisma.telegramBot.update({
          where: { merchantId },
          data: { isActive: false },
        });
      } else {
        // Попробуем удалить webhook по токену из настроек мерчанта
        const settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
        if (settings?.telegramBotToken) {
          await this.deleteWebhook(settings.telegramBotToken);
        }
      }
      // Локально тоже уберем бота из карты
      this.bots.delete(merchantId);
      await this.prisma.merchant
        .update({
          where: { id: merchantId },
          data: { telegramBotEnabled: false },
        })
        .catch(() => null);
    } catch (error) {
      this.logger.error(`Ошибка деактивации бота для ${merchantId}:`, error);
      throw error;
    }
  }
}
