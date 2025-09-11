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
    try {
      const merchants = await this.prisma.merchantSettings.findMany({
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
      this.logger.error('Ошибка загрузки ботов:', error);
    }
  }

  async registerBot(merchantId: string, botToken: string) {
    try {
      // Получаем информацию о боте
      const botInfo = await this.getBotInfo(botToken);
      
      // Сохраняем в БД
      await this.prisma.merchantSettings.update({
        where: { merchantId },
        data: {
          telegramBotToken: botToken,
          telegramBotUsername: botInfo.username,
          miniappBaseUrl: `${this.configService.get('MINIAPP_BASE_URL')}?merchant=${merchantId}`,
        },
      });

      // Настраиваем webhook
      const webhookUrl = `${this.configService.get('API_BASE_URL')}/telegram/webhook/${merchantId}`;
      await this.setWebhook(botToken, webhookUrl);

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
      };
    } catch (error) {
      this.logger.error(`Ошибка регистрации бота для ${merchantId}:`, error);
      throw error;
    }
  }

  async setupWebhook(merchantId: string) {
    const bot = this.bots.get(merchantId);
    if (!bot) return;

    try {
      await this.setWebhook(bot.token, bot.webhookUrl);
      this.logger.log(`Webhook установлен для ${merchantId}`);
    } catch (error) {
      this.logger.error(`Ошибка установки webhook для ${merchantId}:`, error);
    }
  }

  private async setWebhook(token: string, url: string) {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        allowed_updates: ['message', 'callback_query', 'inline_query'],
        drop_pending_updates: true,
      }),
    });

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

  private async handleStart(bot: BotConfig, chatId: number, userId: number, merchantId: string) {
    // Создаем или находим клиента
    const tgId = String(userId);
    let customer = await this.prisma.customer.findUnique({ where: { tgId } });
    
    if (!customer) {
      customer = await this.prisma.customer.create({ data: { tgId } });
    }

    // Получаем настройки мерчанта
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const message = settings?.miniappThemePrimary 
      ? `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${customer.id}\n\nИспользуйте кнопки ниже для работы с программой.`
      : `🎉 Добро пожаловать в программу лояльности!\n\nВаш ID: ${customer.id}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 Открыть приложение', web_app: { url: `${settings?.miniappBaseUrl}` } }
        ],
        [
          { text: '💰 Баланс', callback_data: 'balance' },
          { text: '📊 История', callback_data: 'history' }
        ],
        [
          { text: '❓ Помощь', callback_data: 'help' }
        ]
      ]
    };

    await this.sendMessage(bot.token, chatId, message, keyboard);
  }

  private async handleBalance(bot: BotConfig, chatId: number, userId: number, merchantId: string) {
    const tgId = String(userId);
    const customer = await this.prisma.customer.findUnique({ where: { tgId } });
    
    if (!customer) {
      await this.sendMessage(bot.token, chatId, 'Вы еще не зарегистрированы. Используйте /start');
      return;
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: customer.id,
        merchantId,
        type: 'POINTS',
      },
    });

    const balance = wallet?.balance || 0;
    const message = `💰 Ваш баланс: ${balance} баллов`;

    await this.sendMessage(bot.token, chatId, message);
  }

  private async handleMiniApp(bot: BotConfig, chatId: number, merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const keyboard = {
      inline_keyboard: [[
        { 
          text: '📱 Открыть приложение лояльности', 
          web_app: { url: settings?.miniappBaseUrl || '' } 
        }
      ]]
    };

    await this.sendMessage(
      bot.token, 
      chatId, 
      '📱 Нажмите кнопку ниже, чтобы открыть приложение:', 
      keyboard
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

  private async handleCallbackQuery(bot: BotConfig, query: any, merchantId: string) {
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

  private async handleTransactionHistory(bot: BotConfig, chatId: number, userId: number, merchantId: string) {
    const tgId = String(userId);
    const customer = await this.prisma.customer.findUnique({ where: { tgId } });
    
    if (!customer) {
      await this.sendMessage(bot.token, chatId, 'Вы еще не зарегистрированы. Используйте /start');
      return;
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        customerId: customer.id,
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
    parseMode?: string
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

  // Отправка уведомлений клиентам
  async sendNotification(customerId: string, merchantId: string, message: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.tgId) return;

    const bot = this.bots.get(merchantId);
    if (!bot) return;

    try {
      await this.sendMessage(bot.token, Number(customer.tgId), message);
      return { success: true };
    } catch (error) {
      this.logger.error(`Ошибка отправки уведомления: ${error}`);
      return { success: false, error };
    }
  }
}
