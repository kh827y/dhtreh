import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { formatErrorMessage } from '../telegram-bot.utils';
import { TelegramBotApiService } from './telegram-bot-api.service';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';

@Injectable()
export class TelegramBotMessagingService {
  private readonly logger = new Logger(TelegramBotMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TelegramBotRegistryService,
    private readonly api: TelegramBotApiService,
  ) {}

  private async sendMessageWithMarkdownFallback(
    token: string,
    chatId: string | number,
    text: string,
    parseMode: string,
  ) {
    try {
      await this.api.sendMessage(token, chatId, text, null, parseMode);
    } catch (error) {
      if (!this.isMarkdownParseError(error)) throw error;
      await this.api.sendMessage(token, chatId, text);
    }
  }

  private isMarkdownParseError(error: unknown): boolean {
    const message = formatErrorMessage(error).toLowerCase();
    if (!message) return false;
    return message.includes('parse entities') || message.includes('cant parse');
  }

  private isNotificationUnsupported(error: unknown): boolean {
    const message = formatErrorMessage(error).toLowerCase();
    if (!message) return false;
    return (
      message.includes('unknown method') ||
      message.includes('method not found') ||
      message.includes('not found') ||
      message.includes('not available') ||
      message.includes('sendnotification is not supported')
    );
  }

  async sendCampaignMessage(
    merchantId: string,
    tgId: string,
    options: {
      text: string;
      asset?: { buffer: Buffer; mimeType?: string; fileName?: string };
    },
  ): Promise<void> {
    const bot =
      (await this.registry.ensureBotLoaded(merchantId)) ||
      this.registry.getBot(merchantId);
    if (!bot) throw new Error('Telegram-бот не подключён');
    const chatId = tgId;
    const text = options.text?.trim() ?? '';
    if (!text) throw new Error('Пустое сообщение');
    const parseMode = 'Markdown';

    if (options.asset) {
      if (text.length > 1024) {
        await this.sendMessageWithMarkdownFallback(
          bot.token,
          chatId,
          text,
          parseMode,
        );
        await this.api.sendPhoto(bot.token, chatId, {
          buffer: options.asset.buffer,
          mimeType: options.asset.mimeType,
          fileName: options.asset.fileName,
        });
      } else {
        try {
          await this.api.sendPhoto(bot.token, chatId, {
            buffer: options.asset.buffer,
            mimeType: options.asset.mimeType,
            fileName: options.asset.fileName,
            caption: text,
            parseMode,
          });
        } catch (error) {
          if (!this.isMarkdownParseError(error)) throw error;
          await this.api.sendPhoto(bot.token, chatId, {
            buffer: options.asset.buffer,
            mimeType: options.asset.mimeType,
            fileName: options.asset.fileName,
            caption: text,
          });
        }
      }
    } else {
      await this.sendMessageWithMarkdownFallback(
        bot.token,
        chatId,
        text,
        parseMode,
      );
    }
  }

  async sendPushNotification(
    merchantId: string,
    tgId: string,
    payload: {
      title?: string;
      body: string;
      data?: Record<string, string>;
      deepLink?: string;
    },
  ): Promise<void> {
    const bot =
      (await this.registry.ensureBotLoaded(merchantId)) ||
      this.registry.getBot(merchantId);
    if (!bot) throw new Error('Telegram-бот не подключён');
    if (!tgId) throw new Error('Неизвестный Telegram ID клиента');
    const userId = Number(tgId);
    if (!Number.isFinite(userId)) {
      throw new Error('Некорректный Telegram ID клиента');
    }

    const body: Record<string, unknown> = {
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
      await this.api.callTelegram(bot.token, 'sendNotification', body);
      return;
    } catch (error) {
      if (!this.isNotificationUnsupported(error)) {
        throw error;
      }
      const normalizedTitle = payload.title?.trim() ?? '';
      const normalizedBody = payload.body?.trim() ?? '';
      const fallbackText =
        normalizedTitle && normalizedBody && normalizedTitle !== normalizedBody
          ? `${normalizedTitle}\n\n${normalizedBody}`
          : normalizedBody;
      await this.api.sendMessage(bot.token, userId, fallbackText);
    }
  }

  async sendNotification(
    customerId: string,
    merchantId: string,
    message: string,
  ) {
    const prisma = this.prisma as Partial<PrismaService>;
    if (!prisma.customerTelegram?.findFirst) return;
    const link = await prisma.customerTelegram.findFirst({
      where: { customerId, merchantId },
    });
    const tgId = link?.tgId || null;
    if (!tgId) return;

    const bot = this.registry.getBot(merchantId);
    if (!bot) return;

    try {
      await this.api.sendMessage(bot.token, tgId, message);
      return { success: true };
    } catch (error: unknown) {
      this.logger.error(
        `Ошибка отправки уведомления: ${formatErrorMessage(error)}`,
      );
      return { success: false, error: formatErrorMessage(error) };
    }
  }
}
