import { MerchantsSettingsService } from './merchants-settings.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import type { LookupCacheService } from '../../../core/cache/lookup-cache.service';

type MockedPrisma = {
  merchant: {
    findUnique: jest.Mock;
  };
  merchantSettings: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
  };
};
type MockedCache = {
  invalidateSettings: jest.Mock;
};

function createService() {
  const prisma: MockedPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
    merchantSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const cache: MockedCache = {
    invalidateSettings: jest.fn(),
  };
  const config = new AppConfigService();
  const service = new MerchantsSettingsService(
    prisma as unknown as PrismaService,
    config,
    cache as unknown as LookupCacheService,
  );

  return { service, prisma, cache };
}

describe('MerchantsSettingsService settings behavior', () => {
  it('maps integration and miniapp settings in getSettings', async () => {
    const { service, prisma } = createService();
    prisma.merchant.findUnique.mockResolvedValue({
      id: 'm-1',
      settings: {
        merchantId: 'm-1',
        qrTtlSec: 180,
        requireJwtForQuote: true,
        useWebhookNext: true,
        webhookSecretNext: 'next',
        webhookKeyIdNext: 'kid-next',
        telegramBotToken: 'token',
        telegramBotUsername: '@bot',
        telegramStartParamRequired: true,
        miniappBaseUrl: 'https://mini.example',
        miniappThemePrimary: '#111111',
        miniappThemeBg: '#f5f5f5',
        miniappLogoUrl: '/logo.svg',
        timezone: 'MSK+3',
        rulesJson: { schemaVersion: 2, reviews: { enabled: true } },
      },
    });

    const result = await service.getSettings('m-1');

    expect(result).toEqual(
      expect.objectContaining({
        merchantId: 'm-1',
        qrTtlSec: 180,
        requireJwtForQuote: true,
        useWebhookNext: true,
        webhookSecretNext: 'next',
        webhookKeyIdNext: 'kid-next',
        telegramBotToken: 'token',
        telegramBotUsername: '@bot',
        telegramStartParamRequired: true,
        miniappBaseUrl: 'https://mini.example',
        miniappThemePrimary: '#111111',
        miniappThemeBg: '#f5f5f5',
        miniappLogoUrl: '/logo.svg',
        timezone: 'MSK+3',
      }),
    );
  });

  it('persists integration and miniapp settings in updateSettings', async () => {
    const { service, prisma, cache } = createService();
    prisma.merchant.findUnique.mockResolvedValue({ id: 'm-1' });
    prisma.merchantSettings.findUnique.mockResolvedValue({
      pointsTtlDays: 0,
      rulesJson: null,
    });
    prisma.merchantSettings.upsert.mockImplementation(
      ({ where, update, create }: { where: { merchantId: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => ({
        merchantId: where.merchantId,
        earnBps: Number(update.earnBps ?? create.earnBps ?? 300),
        redeemLimitBps: Number(update.redeemLimitBps ?? create.redeemLimitBps ?? 5000),
        qrTtlSec: Number(update.qrTtlSec ?? create.qrTtlSec ?? 300),
        webhookUrl: update.webhookUrl ?? create.webhookUrl ?? null,
        webhookSecret: update.webhookSecret ?? create.webhookSecret ?? null,
        webhookKeyId: update.webhookKeyId ?? create.webhookKeyId ?? null,
        redeemCooldownSec: Number(update.redeemCooldownSec ?? create.redeemCooldownSec ?? 0),
        earnCooldownSec: Number(update.earnCooldownSec ?? create.earnCooldownSec ?? 0),
        redeemDailyCap: update.redeemDailyCap ?? create.redeemDailyCap ?? null,
        earnDailyCap: update.earnDailyCap ?? create.earnDailyCap ?? null,
        maxOutlets: update.maxOutlets ?? create.maxOutlets ?? null,
        requireJwtForQuote: Boolean(update.requireJwtForQuote ?? create.requireJwtForQuote ?? false),
        rulesJson: update.rulesJson ?? create.rulesJson ?? null,
        pointsTtlDays: update.pointsTtlDays ?? create.pointsTtlDays ?? null,
        earnDelayDays: update.earnDelayDays ?? create.earnDelayDays ?? null,
        telegramBotToken: update.telegramBotToken ?? create.telegramBotToken ?? null,
        telegramBotUsername: update.telegramBotUsername ?? create.telegramBotUsername ?? null,
        telegramStartParamRequired: Boolean(
          update.telegramStartParamRequired ??
            create.telegramStartParamRequired ??
            false,
        ),
        miniappBaseUrl: update.miniappBaseUrl ?? create.miniappBaseUrl ?? null,
        miniappThemePrimary:
          update.miniappThemePrimary ?? create.miniappThemePrimary ?? null,
        miniappThemeBg: update.miniappThemeBg ?? create.miniappThemeBg ?? null,
        miniappLogoUrl: update.miniappLogoUrl ?? create.miniappLogoUrl ?? null,
        timezone: update.timezone ?? create.timezone ?? 'MSK+4',
      }),
    );

    const result = await service.updateSettings(
      'm-1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      { schemaVersion: 2 },
      {
        useWebhookNext: true,
        telegramStartParamRequired: true,
        telegramBotUsername: '@new_bot',
        miniappBaseUrl: 'https://mini.next',
        miniappThemePrimary: '#222222',
        miniappThemeBg: '#eeeeee',
        miniappLogoUrl: '/logo-next.svg',
        timezone: 'MSK+5',
      },
    );

    expect(prisma.merchantSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId: 'm-1' },
        update: expect.objectContaining({
          useWebhookNext: true,
          telegramStartParamRequired: true,
          telegramBotUsername: '@new_bot',
          miniappBaseUrl: 'https://mini.next',
          miniappThemePrimary: '#222222',
          miniappThemeBg: '#eeeeee',
          miniappLogoUrl: '/logo-next.svg',
          timezone: 'MSK+5',
          requireJwtForQuote: true,
        }),
      }),
    );
    expect(cache.invalidateSettings).toHaveBeenCalledWith('m-1');
    expect(result).toEqual(
      expect.objectContaining({
        requireJwtForQuote: true,
        telegramStartParamRequired: true,
        telegramBotUsername: '@new_bot',
        miniappBaseUrl: 'https://mini.next',
        miniappThemePrimary: '#222222',
        miniappThemeBg: '#eeeeee',
        miniappLogoUrl: '/logo-next.svg',
        timezone: 'MSK+5',
      }),
    );
  });
});
