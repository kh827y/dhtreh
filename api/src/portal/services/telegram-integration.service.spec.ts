import { BadRequestException } from '@nestjs/common';
import { PortalTelegramIntegrationService } from './telegram-integration.service';

function createMocks() {
  const prisma = {
    merchant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    merchantSettings: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    integration: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramBot: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const telegramBots = {
    registerBot: jest.fn(),
    deactivateBot: jest.fn(),
    fetchBotInfo: jest.fn(),
    fetchWebhookInfo: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const service = new PortalTelegramIntegrationService(
    prisma as any,
    telegramBots as any,
    config as any,
  );
  return { prisma, telegramBots, config, service };
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
      .spyOn(service as any, 'touchIntegration')
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
    jest
      .spyOn(service, 'setupMenu')
      .mockResolvedValue({ ok: true } as any);

    const response = await service.connect('M-2', 'token');

    expect(telegramBots.registerBot).toHaveBeenCalledWith('M-2', 'token');
    expect(response.message).toContain('Telegram Mini App подключена');
  });

  it('генерирует deep link для miniapp', async () => {
    const { prisma, config, service } = createMocks();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      telegramBotUsername: '@demo_bot',
    });
    config.get.mockImplementation((key: string) =>
      key === 'TMA_LINK_SECRET' ? 'secret' : null,
    );

    const { deepLink, startParam } = await service.generateLink('M-3');

    expect(deepLink).toContain(`startapp=${startParam}`);
    expect(deepLink).toMatch(/^https:\/\/t\.me\/demo_bot\?startapp=/);
    expect(startParam.split('.').length).toBe(3);
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
