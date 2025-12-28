import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService redeem caps', () => {
  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  } as any;

  const makeService = () =>
    new LoyaltyService({} as any, metrics, undefined as any, undefined as any, {} as any);

  const stubIntegrationContext = (service: LoyaltyService) => {
    jest.spyOn(service as any, 'ensureCustomerContext').mockResolvedValue({
      customerId: 'c-test',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    jest.spyOn(service as any, 'getSettings').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 0,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
    jest.spyOn(service as any, 'isAllowSameReceipt').mockResolvedValue(true);
  };

  it('limits redeem by product percent caps', async () => {
    const service = makeService();
    stubIntegrationContext(service);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-1',
      customerId: 'c-1',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-1',
      customerId: 'c-1',
      items: [
        { qty: 1, price: 100 },
        { qty: 1, price: 100 },
      ],
    });

    expect(result.max_pay_bonus).toBe(125);
    expect(result.items?.map((p) => p.max_pay_bonus)).toEqual([25, 100]);
  });

  it('ignores items with disallowed point payment', async () => {
    const service = makeService();
    stubIntegrationContext(service);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: false,
        promotionMultiplier: 1,
        redeemPercent: 100,
      } as any,
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-2',
      customerId: 'c-2',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-2',
      customerId: 'c-2',
      items: [
        { qty: 1, price: 200 },
        { qty: 1, price: 200 },
      ],
    });

    expect(result.max_pay_bonus).toBe(100);
    expect(result.items?.map((p) => p.max_pay_bonus)).toEqual([0, 100]);
  });

  it('keeps per-item caps when overall limit is lower', async () => {
    const service = makeService();
    stubIntegrationContext(service);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-3',
      customerId: 'c-3',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 2500,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-3',
      customerId: 'c-3',
      items: [
        { qty: 1, price: 500 },
        { qty: 1, price: 500 },
      ],
    });

    expect(result.max_pay_bonus).toBe(250);
    expect(result.items?.map((p) => p.max_pay_bonus)).toEqual([125, 250]);
  });

  it('does not shrink redeem limit when item has accruePoints=false', async () => {
    const service = makeService();
    stubIntegrationContext(service);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: false,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-4',
      customerId: 'c-4',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 5000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-4',
      customerId: 'c-4',
      items: [
        { qty: 1, price: 500 },
        { qty: 1, price: 500 },
      ],
    });

    expect(result.max_pay_bonus).toBe(375);
    expect(result.items?.map((p) => p.max_pay_bonus)).toEqual([125, 250]);
  });

  it('uses point promotion even when base earn would be higher', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'ensureCustomerContext').mockResolvedValue({
      customerId: 'c-5',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    jest.spyOn(service as any, 'getSettings').mockResolvedValue({
      earnBps: 1000,
      redeemLimitBps: 0,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
    jest.spyOn(service as any, 'isAllowSameReceipt').mockResolvedValue(true);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
        pointPromotions: [
          {
            id: 'promo-1',
            name: 'Fixed promo',
            kind: 'POINTS_MULTIPLIER',
            pointsRuleType: 'fixed',
            pointsValue: 5,
            productIds: new Set<string>(),
            categoryIds: new Set<string>(),
          },
        ],
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-5',
      customerId: 'c-5',
      balance: 0,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 1000,
      redeemLimitBps: 0,
      tierMinPayment: null,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-5',
      customerId: 'c-5',
      items: [{ qty: 1, price: 100 }],
    });

    expect(result.bonus_value).toBe(5);
    expect(result.items?.[0]?.earn_bonus).toBe(5);
  });

  it('skips earn when item accrual disabled even with point promo', async () => {
    const service = makeService();
    stubIntegrationContext(service);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: false,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
        pointPromotions: [
          {
            id: 'promo-2',
            name: 'Fixed promo',
            kind: 'POINTS_MULTIPLIER',
            pointsRuleType: 'fixed',
            pointsValue: 50,
            productIds: new Set<string>(),
            categoryIds: new Set<string>(),
          },
        ],
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-7',
      customerId: 'c-7',
      balance: 0,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 1000,
      redeemLimitBps: 0,
      tierMinPayment: null,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-7',
      customerId: 'c-7',
      items: [{ qty: 1, price: 100 }],
    });

    expect(result.bonus_value).toBe(0);
    expect(result.items?.[0]?.earn_bonus).toBe(0);
  });

  it('applies point promotions only when actions are provided in calculateBonusPreview', async () => {
    const promo = {
      id: 'promo-1',
      name: 'x2',
      kind: 'POINTS_MULTIPLIER',
      pointsRuleType: 'multiplier',
      pointsValue: 2,
      productIds: new Set<string>(),
      categoryIds: new Set<string>(),
    } as any;
    const prisma = {
      productExternalId: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where?.externalId) {
            return Promise.resolve([
              {
                id: 'p-1',
                categoryId: null,
                name: 'Капучино',
                accruePoints: true,
                allowRedeem: true,
                redeemPercent: 100,
                externalId: 'capuccino1',
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      },
    } as any;
    const service = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      {} as any,
    );
    stubIntegrationContext(service);
    jest
      .spyOn(service as any, 'loadActivePromotionRules')
      .mockResolvedValue([promo]);
    jest
      .spyOn(service as any, 'filterPromotionsForCustomer')
      .mockResolvedValue([promo]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-8',
      customerId: 'c-8',
      balance: 0,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 300,
      redeemLimitBps: 0,
      tierMinPayment: null,
    });

    const noActions = await service.calculateBonusPreview({
      merchantId: 'm-8',
      customerId: 'c-8',
      items: [{ externalId: 'capuccino1', qty: 1, price: 100 }],
    });
    const withActions = await service.calculateBonusPreview({
      merchantId: 'm-8',
      customerId: 'c-8',
      items: [
        {
          externalId: 'capuccino1',
          qty: 1,
          price: 100,
          actionIds: ['promo-1'],
        },
      ],
    });

    expect(noActions.bonus_value).toBe(3);
    expect(withActions.bonus_value).toBe(6);
  });

  it('skips earn when redeem requested and allowSameReceipt=false', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'ensureCustomerContext').mockResolvedValue({
      customerId: 'c-6',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    jest.spyOn(service as any, 'getSettings').mockResolvedValue({
      earnBps: 500,
      redeemLimitBps: 10000,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
    jest.spyOn(service as any, 'isAllowSameReceipt').mockResolvedValue(false);
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-6',
      customerId: 'c-6',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 500,
      redeemLimitBps: 10000,
      tierMinPayment: null,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-6',
      customerId: 'c-6',
      items: [{ qty: 1, price: 100 }],
      paidBonus: 50,
    });

    expect(result.max_pay_bonus).toBe(50);
    expect(result.bonus_value).toBe(0);
  });
});
