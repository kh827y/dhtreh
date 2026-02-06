import { LoyaltyTransactionsUseCase } from '../use-cases/loyalty-transactions.use-case';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import type { AppConfigService } from '../../../core/config/app-config.service';
import type { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import type { LoyaltyService } from '../services/loyalty.service';
import type { CashierRequest } from '../controllers/loyalty-controller.types';
import type { LoyaltyIdempotencyService } from '../services/loyalty-idempotency.service';
import type { LoyaltyWebhookService } from '../services/loyalty-webhook.service';

type MockedService = {
  cancel: jest.Mock;
};
type MockedPrisma = {
  merchantSettings: {
    findUnique: jest.Mock;
  };
  referralProgram: {
    findFirst: jest.Mock;
  };
};
type MockedSupport = {
  buildReviewsShareSettings: jest.Mock;
};

function createUseCase() {
  const service: MockedService = {
    cancel: jest.fn(),
  };

  const prisma: MockedPrisma = {
    merchantSettings: {
      findUnique: jest.fn(),
    },
    referralProgram: {
      findFirst: jest.fn(),
    },
  };
  const metrics = {} as MetricsService;
  const cache = {} as LookupCacheService;
  const config = {} as AppConfigService;
  const support: MockedSupport = {
    buildReviewsShareSettings: jest.fn(),
  };
  const idempotency = {} as LoyaltyIdempotencyService;
  const webhook = {} as LoyaltyWebhookService;

  const useCase = new LoyaltyTransactionsUseCase(
    service as unknown as LoyaltyService,
    prisma as unknown as PrismaService,
    metrics,
    cache,
    config,
    support as unknown as LoyaltyControllerSupportService,
    idempotency,
    webhook,
  );

  return { useCase, service, prisma, support };
}

describe('LoyaltyTransactionsUseCase', () => {
  it('requires holdId for cancel', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.cancel('', {
        cashierSession: { merchantId: 'm-1' },
      } as CashierRequest),
    ).rejects.toThrow('holdId required');
  });

  it('delegates cancel to service', async () => {
    const { useCase, service } = createUseCase();
    service.cancel.mockResolvedValue({ ok: true });

    const result = await useCase.cancel('hold-1', {
      cashierSession: { merchantId: 'm-1' },
    } as CashierRequest);

    expect(service.cancel).toHaveBeenCalledWith('hold-1', 'm-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns public settings from rules and share config', async () => {
    const { useCase, prisma, support } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      qrTtlSec: 180,
      miniappThemePrimary: '#111111',
      miniappThemeBg: '#ffffff',
      miniappLogoUrl: '/logo.png',
      rulesJson: {
        miniapp: { supportTelegram: '  @support_bot  ' },
        reviews: { enabled: false },
      },
    });
    prisma.referralProgram.findFirst.mockResolvedValue({ id: 'ref-1' });
    support.buildReviewsShareSettings.mockResolvedValue({
      settings: null,
      share: { enabled: true, threshold: 5, platforms: [] },
    });

    const result = await useCase.publicSettings('m-1');

    expect(result).toEqual({
      merchantId: 'm-1',
      qrTtlSec: 180,
      miniappThemePrimary: '#111111',
      miniappThemeBg: '#ffffff',
      miniappLogoUrl: '/logo.png',
      supportTelegram: '@support_bot',
      reviewsEnabled: false,
      referralEnabled: true,
      reviewsShare: { enabled: true, threshold: 5, platforms: [] },
    });
  });

  it('falls back to defaults in public settings when config absent', async () => {
    const { useCase, prisma, support } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue(null);
    prisma.referralProgram.findFirst.mockResolvedValue(null);
    support.buildReviewsShareSettings.mockResolvedValue({
      settings: null,
      share: null,
    });

    const result = await useCase.publicSettings('m-1');

    expect(result.qrTtlSec).toBe(300);
    expect(result.supportTelegram).toBeNull();
    expect(result.reviewsEnabled).toBe(true);
    expect(result.referralEnabled).toBe(false);
    expect(result.reviewsShare).toBeNull();
  });
});
