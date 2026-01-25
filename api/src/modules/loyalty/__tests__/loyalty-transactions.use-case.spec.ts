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

function createUseCase() {
  const service: MockedService = {
    cancel: jest.fn(),
  };

  const prisma = {} as PrismaService;
  const metrics = {} as MetricsService;
  const cache = {} as LookupCacheService;
  const config = {} as AppConfigService;
  const support = {} as LoyaltyControllerSupportService;
  const idempotency = {} as LoyaltyIdempotencyService;
  const webhook = {} as LoyaltyWebhookService;

  const useCase = new LoyaltyTransactionsUseCase(
    service as unknown as LoyaltyService,
    prisma,
    metrics,
    cache,
    config,
    support,
    idempotency,
    webhook,
  );

  return { useCase, service };
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
});
