import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PortalTelegramIntegrationService } from './telegram-integration.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { AppConfigService } from '../../../core/config/app-config.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { TelegramBotService } from '../../telegram/telegram-bot.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  merchant: {
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
  merchantSettings: {
    create: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
  };
  integration: {
    findFirst: MockFn<Promise<unknown>, [unknown?]>;
    create: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
  telegramBot: {
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
};
type TelegramBotsStub = {
  registerBot: MockFn<Promise<unknown>, [string, string]>;
  deactivateBot: MockFn<Promise<unknown>, [string]>;
  fetchBotInfo: MockFn<Promise<unknown>, [string]>;
  fetchWebhookInfo: MockFn<Promise<unknown>, [string]>;
};
type ConfigStub = { get: MockFn };
type AppConfigStub = { getTelegramHttpTimeoutMs: MockFn<number, []> };
type MetricsStub = { inc: MockFn };
type ServicePrivate = {
  touchIntegration: (merchantId: string, payload?: unknown) => Promise<string>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asTelegramBotService = (stub: TelegramBotsStub) =>
  stub as unknown as TelegramBotService;
const asConfigService = (stub: ConfigStub) => stub as unknown as ConfigService;
const asAppConfigService = (stub: AppConfigStub) =>
  stub as unknown as AppConfigService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateService = (service: PortalTelegramIntegrationService) =>
  service as unknown as ServicePrivate;

function createMocks() {
  const prisma: PrismaStub = {
    merchant: {
      findUnique: mockFn(),
      update: mockFn(),
    },
    merchantSettings: {
      create: mockFn(),
      update: mockFn(),
      findUnique: mockFn(),
    },
    integration: {
      findFirst: mockFn(),
      create: mockFn(),
      update: mockFn(),
    },
    telegramBot: {
      findUnique: mockFn(),
      update: mockFn(),
    },
  };
  const telegramBots: TelegramBotsStub = {
    registerBot: mockFn(),
    deactivateBot: mockFn(),
    fetchBotInfo: mockFn(),
    fetchWebhookInfo: mockFn(),
  };
  const config: ConfigStub = {
    get: mockFn(),
  };
  const appConfig: AppConfigStub = {
    getTelegramHttpTimeoutMs: mockFn<number, []>().mockReturnValue(15000),
  };
  const metrics: MetricsStub = {
    inc: mockFn(),
  };
  const service = new PortalTelegramIntegrationService(
    asPrismaService(prisma),
    asTelegramBotService(telegramBots),
    asConfigService(config),
    asAppConfigService(appConfig),
    asMetricsService(metrics),
  );
  return { prisma, telegramBots, config, appConfig, metrics, service };
}

describe('PortalTelegramIntegrationService', () => {
  it('нормализует ссылку на бота и miniapp URL в getState', async () => {
    const { prisma, config, service } = createMocks();
    prisma.merchant.findUnique.mockResolvedValue({
      id: 'M-1',
      telegramBotEnabled: true,
      settings: null,
      telegramBot: { botUsername: 'demo_bot', isActive: true },
    });
    prisma.merchantSettings.create.mockResolvedValue({
      merchantId: 'M-1',
      telegramBotUsername: 'demo_bot',
      miniappBaseUrl: null,
    });
    prisma.integration.findFirst.mockResolvedValue({
      id: 'INT-1',
      lastSync: new Date('2024-01-01T00:00:00.000Z'),
      credentials: { tokenMask: '123...456' },
    });
    config.get.mockImplementation((key: string) =>
      key === 'MINIAPP_BASE_URL' ? 'https://miniapp.test' : null,
    );

    const state = await service.getState('M-1');

    expect(state.botUsername).toBe('@demo_bot');
    expect(state.botLink).toBe('https://t.me/demo_bot');
    expect(state.miniappUrl).toBe('https://miniapp.test/?merchant=M-1');
    expect(state.connectionHealthy).toBe(true);
    expect(state.tokenMask).toBe('123...456');
  });

  it('ошибается при подключении без токена', async () => {
    const { service } = createMocks();
    await expect(service.connect('M-2', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('подключает бота и возвращает сообщение об успешном подключении', async () => {
    const { prisma, telegramBots, service } = createMocks();
    telegramBots.registerBot.mockResolvedValue({
      success: true,
      username: 'demo_bot',
      webhookError: null,
    });
    prisma.merchant.update.mockResolvedValue(null);
    prisma.merchantSettings.update.mockResolvedValue(null);

    jest
      .spyOn(asPrivateService(service), 'touchIntegration')
      .mockResolvedValue('INT-2');
    jest.spyOn(service, 'getState').mockResolvedValue({
      enabled: true,
      botUsername: '@demo_bot',
      botLink: 'https://t.me/demo_bot',
      miniappUrl: 'https://miniapp.test/?merchant=M-2',
      connectionHealthy: true,
      lastSyncAt: null,
      integrationId: 'INT-2',
      tokenMask: '123...456',
    });
    jest.spyOn(service, 'setupMenu').mockResolvedValue({ ok: true });

    const response = await service.connect('M-2', 'token');

    expect(telegramBots.registerBot).toHaveBeenCalledWith('M-2', 'token');
    expect(response.message).toContain('Telegram Mini App подключена');
  });

  it('генерирует deep link для miniapp', async () => {
    const { prisma, service } = createMocks();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      telegramBotUsername: '@demo_bot',
      telegramStartParamRequired: true,
    });

    const { deepLink, startParam } = await service.generateLink('M-3');

    expect(deepLink).toContain(`startapp=${startParam}`);
    expect(deepLink).toMatch(/^https:\/\/t\.me\/demo_bot\?startapp=/);
    expect(startParam).toBe('M-3');
  });

  it('не проходит check без токена', async () => {
    const { prisma, service } = createMocks();
    prisma.merchant.findUnique.mockResolvedValue({
      id: 'M-4',
      telegramBotEnabled: true,
      settings: { telegramBotToken: null, telegramBotUsername: null },
      telegramBot: null,
    });

    await expect(service.check('M-4')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
