import { Injectable } from '@nestjs/common';
import type {
  RegisterBotResult,
  TelegramWebhookInfo,
} from './telegram-bot.types';
import { TelegramBotMessagingService } from './services/telegram-bot-messaging.service';
import { TelegramBotRegistryService } from './services/telegram-bot-registry.service';
import { TelegramBotUpdatesService } from './services/telegram-bot-updates.service';

@Injectable()
export class TelegramBotService {
  constructor(
    private readonly registry: TelegramBotRegistryService,
    private readonly updates: TelegramBotUpdatesService,
    private readonly messaging: TelegramBotMessagingService,
  ) {
    void this.loadBots();
  }

  loadBots() {
    return this.registry.loadBots();
  }

  registerBot(
    merchantId: string,
    botToken: string,
  ): Promise<RegisterBotResult> {
    return this.registry.registerBot(merchantId, botToken);
  }

  setupWebhook(merchantId: string) {
    return this.registry.setupWebhook(merchantId);
  }

  fetchBotInfo(token: string) {
    return this.registry.fetchBotInfo(token);
  }

  fetchWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    return this.registry.fetchWebhookInfo(token);
  }

  processWebhook(merchantId: string, update: unknown) {
    return this.updates.processWebhook(merchantId, update);
  }

  sendCampaignMessage(
    merchantId: string,
    tgId: string,
    options: {
      text: string;
      asset?: { buffer: Buffer; mimeType?: string; fileName?: string };
    },
  ): Promise<void> {
    return this.messaging.sendCampaignMessage(merchantId, tgId, options);
  }

  sendPushNotification(
    merchantId: string,
    tgId: string,
    payload: {
      title?: string;
      body: string;
      data?: Record<string, string>;
      deepLink?: string;
    },
  ): Promise<void> {
    return this.messaging.sendPushNotification(merchantId, tgId, payload);
  }

  sendNotification(customerId: string, merchantId: string, message: string) {
    return this.messaging.sendNotification(customerId, merchantId, message);
  }

  rotateWebhookSecret(merchantId: string) {
    return this.registry.rotateWebhookSecret(merchantId);
  }

  deactivateBot(merchantId: string) {
    return this.registry.deactivateBot(merchantId);
  }
}
