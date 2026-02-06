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
  buildReviewsShareSettings: jest.Mock;
  buildShareOptions: jest.Mock;
};

function createUseCase() {
  const service: MockedService = {
    applyPromoCode: jest.fn(),
  };
  const support: MockedSupport = {
    ensureCustomer: jest.fn(),
    listPromotionsForCustomer: jest.fn(),
    buildReviewsShareSettings: jest.fn(),
    buildShareOptions: jest.fn(),
  };

  const prisma = {} as PrismaService;
  const metrics = { inc: jest.fn() } as unknown as MetricsService;
  const reviews = { createReview: jest.fn() } as unknown as ReviewService;
  const cache = {
    getMerchantSettings: jest.fn(),
  } as unknown as LookupCacheService;
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

  return { useCase, service, support, cache, reviews, metrics };
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

  it('blocks submitReview when reviews are disabled in settings', async () => {
    const { useCase, support, cache, reviews } = createUseCase();
    support.ensureCustomer.mockResolvedValue({ id: 'cust-1' });
    (cache.getMerchantSettings as jest.Mock).mockResolvedValue({
      rulesJson: { reviews: { enabled: false } },
    });

    await expect(
      useCase.submitReview({
        merchantId: 'm-1',
        customerId: 'c-1',
        rating: 5,
        orderId: 'order-1',
      }),
    ).rejects.toThrow('Сбор отзывов отключен');

    expect(reviews.createReview).not.toHaveBeenCalled();
  });

  it('returns review share payload when sharing is enabled', async () => {
    const { useCase, support, cache, reviews, metrics } = createUseCase();
    support.ensureCustomer.mockResolvedValue({ id: 'cust-1' });
    (cache.getMerchantSettings as jest.Mock).mockResolvedValue({
      rulesJson: { reviews: { enabled: true } },
    });
    (reviews.createReview as jest.Mock).mockResolvedValue({
      id: 'review-1',
      status: 'PUBLISHED',
      rewardPoints: 10,
      message: 'ok',
    });
    support.buildReviewsShareSettings.mockResolvedValue({
      settings: null,
      share: { enabled: true, threshold: 4, platforms: [] },
    });
    support.buildShareOptions.mockReturnValue([
      { id: 'google', url: 'https://example.com/review' },
    ]);

    const result = await useCase.submitReview({
      merchantId: 'm-1',
      customerId: 'c-1',
      rating: 5,
      orderId: 'order-1',
      outletId: 'outlet-1',
      comment: 'Great service',
    });

    expect(reviews.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'm-1',
        customerId: 'cust-1',
        rating: 5,
        orderId: 'order-1',
      }),
      expect.objectContaining({ autoApprove: true }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        reviewId: 'review-1',
        share: {
          enabled: true,
          threshold: 4,
          options: [{ id: 'google', url: 'https://example.com/review' }],
        },
      }),
    );
    expect((metrics.inc as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        ['reviews_share_stage_total', { outcome: 'shown', reason: 'ok' }],
      ]),
    );
  });
});
