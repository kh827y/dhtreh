import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toLevelRule } from '../../loyalty/utils/tier-defaults.util';
import { readSupportTelegramFromRules } from '../../../shared/miniapp-settings.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  asNumber,
  asString,
  formatErrorMessage,
  toRecord,
} from '../telegram-bot.utils';
import type { BotConfig, TelegramUpdateRecord } from '../telegram-bot.types';
import { TelegramBotApiService } from './telegram-bot-api.service';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';
import { TelegramBotCustomersService } from './telegram-bot-customers.service';

@Injectable()
export class TelegramBotUpdatesService {
  private readonly logger = new Logger(TelegramBotUpdatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TelegramBotRegistryService,
    private readonly api: TelegramBotApiService,
    private readonly customers: TelegramBotCustomersService,
  ) {}

  async processWebhook(merchantId: string, update: unknown) {
    const bot =
      (await this.registry.ensureBotLoaded(merchantId)) ||
      this.registry.getBot(merchantId);
    if (!bot) {
      this.logger.warn(`Бот не найден для мерчанта ${merchantId}`);
      return;
    }

    try {
      const updateRecord = toRecord(update) as TelegramUpdateRecord | null;
      const message = toRecord(updateRecord?.message);
      const messageChat = toRecord(message?.chat);
      const messageFrom = toRecord(message?.from);
      const chatId = asNumber(messageChat?.id);
      const userId = asNumber(messageFrom?.id);
      const text = asString(message?.text);

      // Обработка команд
      if (text && chatId && userId) {
        if (text.startsWith('/start')) {
          await this.handleStart(bot, chatId, userId, merchantId);
        } else if (text === '/balance') {
          await this.handleBalance(bot, chatId, userId, merchantId);
        } else if (text === '/miniapp') {
          await this.handleMiniApp(bot, chatId, merchantId);
        } else if (text === '/help') {
          await this.handleHelp(bot, chatId, merchantId);
        }
      } else if (message?.contact) {
        // Пользователь поделился контактом (номер телефона)
        const contact = toRecord(message.contact);
        const contactUserId =
          asNumber(contact?.user_id) ?? userId ?? chatId ?? null;
        const phoneRaw =
          asString(contact?.phone_number) ?? asString(contact?.phoneNumber);
        if (contactUserId && phoneRaw) {
          const tgId = String(contactUserId);
          const phone = this.customers.normalizePhoneStrict(phoneRaw);
          let profile: Awaited<
            ReturnType<TelegramBotCustomersService['resolveCustomer']>
          > | null = null;
          try {
            profile = await this.customers.resolveCustomer(merchantId, {
              tgId,
            });
            await this.customers.updateCustomer(
              merchantId,
              profile.customerId,
              {
                phone,
              },
            );
            try {
              await this.prisma.customer.update({
                where: { id: profile.customerId },
                data: { phone },
              });
            } catch (err) {
              logIgnoredError(
                err,
                'TelegramBotUpdatesService update phone',
                this.logger,
                'debug',
              );
            }
            this.logger.log(
              `Сохранён телефон для customer=${profile.customerId} (merchant=${merchantId})`,
            );
          } catch (err) {
            const errorRecord = toRecord(err);
            const code = asString(errorRecord?.code) ?? '';
            const msg = formatErrorMessage(err);
            if (code === 'P2002' || /Unique constraint/i.test(msg)) {
              try {
                const existing = await this.customers.findCustomerByPhone(
                  merchantId,
                  phone,
                );
                if (!existing) throw err;
                await this.customers.linkTelegramToCustomer(
                  tgId,
                  merchantId,
                  existing.id,
                  profile?.customerId ?? null,
                );
                this.logger.log(
                  `Телефон уже использовался. Подвязали Telegram пользователя ${tgId} к customer=${existing.id} (merchant=${merchantId})`,
                );
              } catch (linkError) {
                const linkMsg = formatErrorMessage(linkError);
                this.logger.warn(
                  `Не удалось привязать существующего клиента по номеру: ${linkMsg}`,
                );
              }
            } else {
              this.logger.warn(
                `Не удалось сохранить телефон из контакта: ${msg}`,
              );
            }
          }
        }
      }

      // Обработка callback кнопок
      const callbackQuery = toRecord(updateRecord?.callback_query);
      if (callbackQuery) {
        await this.handleCallbackQuery(bot, callbackQuery, merchantId);
      }
    } catch (error) {
      this.logger.error(
        `Ошибка обработки webhook для ${merchantId}: ${formatErrorMessage(
          error,
        )}`,
      );
    }
  }

  private async handleStart(
    bot: BotConfig,
    chatId: number,
    userId: number,
    merchantId: string,
  ) {
    // Не создаем клиента на /start — только показываем ID, если он уже есть
    const tgId = String(userId);
    const existing = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
      select: { id: true },
    });
    const customerId = existing?.id ?? null;

    // Получаем настройки мерчанта
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    const message = settings?.miniappThemePrimary
      ? `🎉 Добро пожаловать в программу лояльности!\n\n${
          customerId
            ? `Ваш ID: ${customerId}\n\n`
            : 'Откройте миниапп для регистрации.\n\n'
        }Используйте кнопки ниже для работы с программой.`
      : `🎉 Добро пожаловать в программу лояльности!\n\n${
          customerId
            ? `Ваш ID: ${customerId}`
            : 'Откройте миниапп для регистрации.'
        }`;

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

    await this.api.sendMessage(bot.token, chatId, message, keyboard);
  }

  private async handleBalance(
    bot: BotConfig,
    chatId: number,
    userId: number,
    merchantId: string,
  ) {
    const tgId = String(userId);
    const existing = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
      select: { id: true },
    });
    if (!existing?.id) {
      await this.api.sendMessage(
        bot.token,
        chatId,
        'Сначала откройте миниапп и завершите регистрацию.',
      );
      return;
    }
    const customerId = existing.id;

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId,
        merchantId,
        type: 'POINTS',
      },
    });

    const balance = wallet?.balance || 0;
    const message = `💰 Ваш баланс: ${balance} баллов`;

    await this.api.sendMessage(bot.token, chatId, message);
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

    await this.api.sendMessage(
      bot.token,
      chatId,
      '📱 Нажмите кнопку ниже, чтобы открыть приложение:',
      keyboard,
    );
  }

  private async handleHelp(bot: BotConfig, chatId: number, merchantId: string) {
    const [tiers, settings] = await Promise.all([
      this.prisma.loyaltyTier.findMany({
        where: { merchantId, isHidden: false },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      }),
    ]);
    const levelLines = tiers.length
      ? tiers.map((tier) => {
          const rule = toLevelRule(tier);
          const threshold = Math.max(0, Math.round(rule.threshold));
          const thresholdLabel =
            threshold <= 0
              ? 'Базовый уровень'
              : `от ${threshold.toLocaleString('ru-RU')} ₽`;
          const percent =
            typeof rule.earnRateBps === 'number'
              ? rule.earnRateBps / 100
              : null;
          const percentLabel =
            percent != null
              ? percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
              : '—';
          return `• ${rule.name}: ${thresholdLabel}, кэшбэк ${percentLabel}%`;
        })
      : ['• Уровни не настроены'];
    levelLines.push('• 1 балл = 1 рубль при списании');

    const supportTelegram = readSupportTelegramFromRules(settings?.rulesJson);
    const supportLine = supportTelegram
      ? `По всем вопросам пишите ${supportTelegram}.`
      : 'По всем вопросам обращайтесь к администратору.';

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

*Уровни лояльности:*
${levelLines.join('\n')}

${supportLine}
    `;

    await this.api.sendMessage(bot.token, chatId, helpText, null, 'Markdown');
  }

  private async handleCallbackQuery(
    bot: BotConfig,
    query: Record<string, unknown>,
    merchantId: string,
  ) {
    const message = toRecord(query.message);
    const chat = toRecord(message?.chat);
    const from = toRecord(query.from);
    const chatId = asNumber(chat?.id);
    const userId = asNumber(from?.id);
    const data = asString(query.data);
    const queryId = asString(query.id);

    if (!chatId || !userId || !data) return;

    // Отвечаем на callback, чтобы убрать "часики"
    if (queryId) {
      await this.api.answerCallbackQuery(bot.token, queryId);
    }

    switch (data) {
      case 'balance':
        await this.handleBalance(bot, chatId, userId, merchantId);
        break;
      case 'history':
        await this.handleTransactionHistory(bot, chatId, userId, merchantId);
        break;
      case 'help':
        await this.handleHelp(bot, chatId, merchantId);
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
    const existing = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
      select: { id: true },
    });
    if (!existing?.id) {
      await this.api.sendMessage(
        bot.token,
        chatId,
        'Сначала откройте миниапп и завершите регистрацию.',
      );
      return;
    }
    const customerId = existing.id;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        customerId,
        merchantId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (transactions.length === 0) {
      await this.api.sendMessage(
        bot.token,
        chatId,
        '📊 У вас пока нет операций',
      );
      return;
    }

    let message = '📊 *Последние операции:*\n\n';
    for (const tx of transactions) {
      const emoji = tx.type === 'EARN' ? '➕' : '➖';
      const date = new Date(tx.createdAt).toLocaleDateString('ru-RU');
      message += `${emoji} ${Math.abs(tx.amount)} баллов (${date})\n`;
    }

    await this.api.sendMessage(bot.token, chatId, message, null, 'Markdown');
  }
}
