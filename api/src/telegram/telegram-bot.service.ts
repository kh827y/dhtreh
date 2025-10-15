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

  private async ensureBotLoaded(merchantId: string): Promise<BotConfig | null> {
    const cached = this.bots.get(merchantId);
    if (cached) return cached;
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: {
          telegramBotToken: true,
          telegramBotUsername: true,
        },
      });
      if (settings?.telegramBotToken && settings.telegramBotUsername) {
        const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchantId}`;
        const bot: BotConfig = {
          token: settings.telegramBotToken,
          username: settings.telegramBotUsername,
          merchantId,
          webhookUrl,
        };
        this.bots.set(merchantId, bot);
        return bot;
      }
    } catch (error) {
      this.logger.warn(`Не удалось загрузить данные бота для ${merchantId}: ${error}`);
    }
    return null;
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
      } else if (update.message?.contact) {
        // Пользователь поделился контактом (номер телефона)
        const contact = update.message.contact;
        const userId = contact.user_id || update.message.from?.id || update.message.chat?.id;
        const phoneRaw: string | undefined = contact.phone_number || contact.phoneNumber;
        if (userId && phoneRaw) {
          const tgId = String(userId);
          const phone = this.normalizePhoneStrict(phoneRaw);
          let profile: Awaited<ReturnType<typeof this.resolveMerchantCustomer>> | null = null;
          try {
            profile = await this.resolveMerchantCustomer(merchantId, { tgId });
            await this.updateMerchantCustomer(merchantId, profile.merchantCustomerId, { phone });
            try {
              await this.prisma.customer.update({
                where: { id: profile.customerId },
                data: { phone },
              });
            } catch {}
            this.logger.log(
              `Сохранён телефон для merchantCustomer=${profile.merchantCustomerId} (merchant=${merchantId})`,
            );
          } catch (err) {
            const code = (err as any)?.code || '';
            const msg = (err as any)?.message || String(err);
            if (code === 'P2002' || /Unique constraint/i.test(msg)) {
              try {
                const existing = await this.findMerchantCustomerByPhone(merchantId, phone);
                if (!existing) throw err;
                await this.linkTelegramToMerchantCustomer(
                  tgId,
                  merchantId,
                  existing.id,
                  profile,
                );
                this.logger.log(
                  `Телефон уже использовался. Подвязали Telegram пользователя ${tgId} к merchantCustomer=${existing.id} (merchant=${merchantId})`,
                );
              } catch (linkError) {
                const linkMsg = (linkError as any)?.message || String(linkError);
                this.logger.warn(
                  `Не удалось привязать существующего клиента по номеру: ${linkMsg}`,
                );
              }
            } else {
              this.logger.warn(`Не удалось сохранить телефон из контакта: ${msg}`);
            }
          }
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
    const profile = await this.resolveMerchantCustomer(merchantId, { tgId });
    const customerId = profile.customerId;

    // Получаем настройки мерчанта
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const message = settings?.miniappThemePrimary
      ? `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${profile.merchantCustomerId}\n\nИспользуйте кнопки ниже для работы с программой.`
      : `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${profile.merchantCustomerId}`;

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
    const profile = await this.resolveMerchantCustomer(merchantId, { tgId });
    const customerId = profile.customerId;

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
    const profile = await this.resolveMerchantCustomer(merchantId, { tgId });
    const customerId = profile.merchantCustomerId;

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

  private async callTelegram(
    token: string,
    method: string,
    body: Record<string, any>,
  ) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.assertTelegramResponseOk(res);
  }

  private async sendMessage(
    token: string,
    chatId: string | number,
    text: string,
    keyboard?: any,
    parseMode?: string,
  ) {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
    };
    if (keyboard) payload.reply_markup = keyboard;
    if (parseMode) payload.parse_mode = parseMode;
    return this.callTelegram(token, 'sendMessage', payload);
  }

  private async sendPhoto(
    token: string,
    chatId: string,
    payload: { buffer: Buffer; mimeType?: string; fileName?: string; caption?: string },
  ) {
    const FormDataCtor = (globalThis as any).FormData;
    const BlobCtor = (globalThis as any).Blob;
    if (!FormDataCtor || !BlobCtor) {
      throw new Error('Формат FormData/Blob недоступен в рантайме Node');
    }
    const form = new FormDataCtor();
    form.append('chat_id', chatId);
    if (payload.caption) form.append('caption', payload.caption);
    const blob = new BlobCtor([payload.buffer], {
      type: payload.mimeType || 'image/jpeg',
    });
    form.append('photo', blob, payload.fileName || 'image.jpg');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    await this.assertTelegramResponseOk(res);
  }

  async sendCampaignMessage(
    merchantId: string,
    tgId: string,
    options: { text: string; asset?: { buffer: Buffer; mimeType?: string; fileName?: string } },
  ): Promise<void> {
    const bot = (await this.ensureBotLoaded(merchantId)) || this.bots.get(merchantId);
    if (!bot) throw new Error('Telegram-бот не подключён');
    const chatId = tgId;
    const text = options.text?.trim() ?? '';
    if (!text) throw new Error('Пустое сообщение');

    if (options.asset) {
      if (text.length > 1024) {
        await this.sendMessage(bot.token, chatId, text);
        await this.sendPhoto(bot.token, chatId, {
          buffer: options.asset.buffer,
          mimeType: options.asset.mimeType,
          fileName: options.asset.fileName,
        });
      } else {
        await this.sendPhoto(bot.token, chatId, {
          buffer: options.asset.buffer,
          mimeType: options.asset.mimeType,
          fileName: options.asset.fileName,
          caption: text,
        });
      }
    } else {
      await this.sendMessage(bot.token, chatId, text);
    }
  }

  async sendPushNotification(
    merchantId: string,
    tgId: string,
    payload: { title?: string; body: string; data?: Record<string, string>; deepLink?: string },
  ): Promise<void> {
    const bot =
      (await this.ensureBotLoaded(merchantId)) || this.bots.get(merchantId);
    if (!bot) throw new Error('Telegram-бот не подключён');
    if (!tgId) throw new Error('Неизвестный Telegram ID клиента');
    const userId = Number(tgId);
    if (!Number.isFinite(userId)) {
      throw new Error('Некорректный Telegram ID клиента');
    }

    const body: Record<string, any> = {
      user_id: userId,
      text: payload.body,
    };
    if (payload.title) body.title = payload.title;
    if (payload.data && Object.keys(payload.data).length) {
      body.additional_data = payload.data;
    }
    if (payload.deepLink) {
      body.redirect_url = payload.deepLink;
    }

    try {
      await this.callTelegram(bot.token, 'sendNotification', body);
      return;
    } catch (error) {
      if (!this.isNotificationUnsupported(error)) {
        throw error;
      }
      const fallbackText = payload.title
        ? `${payload.title}\n\n${payload.body}`
        : payload.body;
      await this.sendMessage(bot.token, userId, fallbackText);
    }
  }

  private async answerCallbackQuery(token: string, queryId: string) {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: queryId,
      }),
    });
    await this.assertTelegramResponseOk(res);
  }

  private async assertTelegramResponseOk(res: globalThis.Response): Promise<any> {
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    const ok = res.ok && (data?.ok ?? true);
    if (!ok) {
      const description =
        data?.description || data?.error_message || raw || `Telegram API error (${res.status})`;
      throw new Error(description);
    }
    if (data && typeof data === 'object' && 'result' in data) {
      return (data as any).result;
    }
    if (data !== null) return data;
    return raw ? { raw } : null;
  }

  private isNotificationUnsupported(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    if (!message) return false;
    return (
      message.includes('unknown method') ||
      message.includes('method not found') ||
      message.includes('not found') ||
      message.includes('not available') ||
      message.includes('sendnotification is not supported')
    );
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
    merchantCustomerId: string,
    merchantId: string,
    message: string,
  ) {
    const prismaAny = this.prisma as any;
    const link = await prismaAny?.customerTelegram?.findUnique?.({
      where: { merchantCustomerId },
    });
    const tgId = link?.tgId || null;
    if (!tgId) return;

    const bot = this.bots.get(merchantId);
    if (!bot) return;

    try {
      await this.sendMessage(bot.token, tgId, message);
      return { success: true };
    } catch (error) {
      this.logger.error(`Ошибка отправки уведомления: ${error}`);
      return { success: false, error };
    }
  }

  // Resolve or create per-merchant mapping from tgId to customerId
  private async resolveMerchantCustomer(
    merchantId: string,
    opts: { tgId?: string; phone?: string },
  ): Promise<{ merchantCustomerId: string; customerId: string }> {
    const prismaAny = this.prisma as any;
    const { tgId, phone } = opts;
    if (!tgId && !phone) throw new Error('resolveMerchantCustomer requires tgId or phone');

    const manager = prismaAny?.merchantCustomer;

    if (tgId && manager?.findUnique) {
      const existing = await manager.findUnique({
        where: { merchantId_tgId: { merchantId, tgId } },
        select: { id: true, customerId: true },
      });
      if (existing) return { merchantCustomerId: existing.id, customerId: existing.customerId };
    }

    if (phone && manager?.findUnique) {
      const existingByPhone = await manager.findUnique({
        where: { merchantId_phone: { merchantId, phone } },
        select: { id: true, customerId: true },
      });
      if (existingByPhone) {
        return {
          merchantCustomerId: existingByPhone.id,
          customerId: existingByPhone.customerId,
        };
      }
    }

    let customerId: string | null = null;
    if (tgId) {
      const existingCustomer = await this.prisma.customer.findFirst({ where: { tgId } });
      if (existingCustomer) customerId = existingCustomer.id;
    }
    if (!customerId && phone) {
      const existingCustomerByPhone = await this.prisma.customer.findFirst({ where: { phone } });
      if (existingCustomerByPhone) customerId = existingCustomerByPhone.id;
    }
    if (!customerId) {
      const createdCustomer = await this.prisma.customer.create({
        data: {
          tgId: tgId ?? null,
          phone: phone ?? null,
        },
        select: { id: true },
      });
      customerId = createdCustomer.id;
    } else {
      try {
        await this.prisma.customer.update({
          where: { id: customerId },
          data: {
            tgId: tgId ?? undefined,
            phone: phone ?? undefined,
          },
        });
      } catch {}
    }

    const created = await manager?.create?.({
      data: {
        merchantId,
        customerId,
        tgId: tgId ?? null,
        phone: phone ?? null,
      },
      select: { id: true, customerId: true },
    });

    if (!created) {
      throw new Error('Failed to create merchant customer');
    }

    if (tgId) {
      await prismaAny?.customerTelegram?.create?.({
        data: { merchantId, tgId, merchantCustomerId: created.id },
      });
    }

    return { merchantCustomerId: created.id, customerId: created.customerId };
  }

  private async updateMerchantCustomer(
    merchantId: string,
    merchantCustomerId: string,
    data: Partial<{ phone: string; tgId: string | null; name: string | null }>,
  ): Promise<void> {
    const prismaAny = this.prisma as any;
    await prismaAny?.merchantCustomer?.update?.({
      where: { id: merchantCustomerId, merchantId },
      data,
    });
  }

  private async findMerchantCustomerByPhone(merchantId: string, phone: string) {
    const prismaAny = this.prisma as any;
    return prismaAny?.merchantCustomer?.findUnique?.({
      where: { merchantId_phone: { merchantId, phone } },
      select: { id: true, customerId: true },
    });
  }

  private async linkTelegramToMerchantCustomer(
    tgId: string,
    merchantId: string,
    merchantCustomerId: string,
    previousProfile?: { merchantCustomerId: string; customerId: string } | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      await txAny?.merchantCustomer?.update?.({
        where: { id: merchantCustomerId },
        data: { tgId },
      });

      const owner = await txAny?.merchantCustomer?.findUnique?.({
        where: { id: merchantCustomerId },
        select: { customerId: true },
      });
      if (owner?.customerId) {
        await tx.customer.update({
          where: { id: owner.customerId },
          data: { tgId },
        });
      }

      await txAny?.customerTelegram?.upsert?.({
        where: { merchantId_tgId: { merchantId, tgId } },
        create: { merchantId, tgId, merchantCustomerId },
        update: { merchantCustomerId },
      });

      if (previousProfile && previousProfile.merchantCustomerId !== merchantCustomerId) {
        await txAny?.merchantCustomer?.update?.({
          where: { id: previousProfile.merchantCustomerId },
          data: { tgId: null },
        });
        await tx.customer.update({
          where: { id: previousProfile.customerId },
          data: { tgId: null },
        });
      }
    });
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

  private normalizePhoneStrict(phone?: string): string {
    if (!phone) throw new Error('phone required');
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('8')) cleaned = '7' + cleaned.substring(1);
    if (cleaned.length === 10 && !cleaned.startsWith('7')) cleaned = '7' + cleaned;
    if (cleaned.length !== 11) throw new Error('invalid phone');
    return '+' + cleaned;
  }
}
