import { LoyaltyPromotionsUseCase } from '../use-cases/loyalty-promotions.use-case';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { ReviewService } from '../../reviews/review.service';
import type { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import type { AppConfigService } from '../../../core/config/app-config.service';
import type { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import type { LoyaltyService } from '../services/loyalty.service';

type MockedService = {
  applyPromoCode: jest.Mock;
};
type MockedSupport = {
  ensureCustomer: jest.Mock;
  listPromotionsForCustomer: jest.Mock;
};

function createUseCase() {
  const service: MockedService = {
    applyPromoCode: jest.fn(),
  };
  const support: MockedSupport = {
    ensureCustomer: jest.fn(),
    listPromotionsForCustomer: jest.fn(),
  };

  const prisma = {} as PrismaService;
  const metrics = {} as MetricsService;
  const reviews = {} as ReviewService;
  const cache = {} as LookupCacheService;
  const config = {} as AppConfigService;

  const useCase = new LoyaltyPromotionsUseCase(
    service as unknown as LoyaltyService,
    prisma,
    metrics,
    reviews,
    cache,
    config,
    support as unknown as LoyaltyControllerSupportService,
  );

  return { useCase, service, support };
}

describe('LoyaltyPromotionsUseCase', () => {
  it('requires merchantId and customerId for listPromotions', async () => {
    const { useCase } = createUseCase();

    await expect(useCase.listPromotions('', 'c-1')).rejects.toThrow(
      'merchantId required',
    );
    await expect(useCase.listPromotions('m-1', '')).rejects.toThrow(
      'customerId required',
    );
  });

  it('delegates listPromotions to support', async () => {
    const { useCase, support } = createUseCase();
    support.listPromotionsForCustomer.mockResolvedValue(['ok']);

    const result = await useCase.listPromotions(' m-1 ', ' c-1 ');

    expect(support.listPromotionsForCustomer).toHaveBeenCalledWith(
      'm-1',
      'c-1',
    );
    expect(result).toEqual(['ok']);
  });

  it('applyPromoCode uses resolved customer id', async () => {
    const { useCase, service, support } = createUseCase();
    support.ensureCustomer.mockResolvedValue({ id: 'cust-1' });
    service.applyPromoCode.mockResolvedValue({ ok: true });

    const result = await useCase.applyPromoCode({
      merchantId: 'm-1',
      customerId: 'c-1',
      code: 'PROMO',
    });

    expect(support.ensureCustomer).toHaveBeenCalledWith('m-1', 'c-1');
    expect(service.applyPromoCode).toHaveBeenCalledWith({
      merchantId: 'm-1',
      customerId: 'cust-1',
      code: 'PROMO',
    });
    expect(result).toEqual({ ok: true });
  });
});
