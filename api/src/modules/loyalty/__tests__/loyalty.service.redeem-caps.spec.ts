import { LoyaltyService } from '../services/loyalty.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { PromoCodesService } from '../../promocodes/promocodes.service';
import type { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import type { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import type { LoyaltyContextService } from '../services/loyalty-context.service';
import type { LoyaltyTierService } from '../services/loyalty-tier.service';
import type { LoyaltyIntegrationService } from '../services/loyalty-integration.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MetricsStub = {
  inc: MockFn;
  observe: MockFn;
  setGauge: MockFn;
};
type MerchantSettings = {
  earnBps: number;
  redeemLimitBps: number;
  redeemCooldownSec: number;
  earnCooldownSec: number;
  redeemDailyCap: number | null;
  earnDailyCap: number | null;
  rulesJson: unknown;
  updatedAt: Date | null;
};
type PositionInput = {
  qty: number;
  price: number;
  externalId?: string;
  actionIds?: string[];
};
type ActivePromotionRule = {
  id: string;
  name: string;
  kind: 'POINTS_MULTIPLIER' | 'NTH_FREE' | 'FIXED_PRICE';
  pointsRuleType?: string;
  pointsValue?: number;
  productIds: Set<string>;
  categoryIds: Set<string>;
};
type ResolvedPosition = PositionInput & {
  amount: number;
  accruePoints: boolean;
  allowEarnAndPay: boolean;
  promotionMultiplier: number;
  redeemPercent: number;
  pointPromotions?: ActivePromotionRule[];
};
type ProductRecord = {
  id: string;
  categoryId: string | null;
  name: string | null;
  accruePoints: boolean;
  allowRedeem: boolean;
  redeemPercent: number;
  externalId?: string | null;
};
type ProductFindArgs = { where?: { externalId?: string } };
type PrismaStub = {
  product?: { findMany: MockFn<Promise<ProductRecord[]>, [ProductFindArgs]> };
};
type LoyaltyServicePrivate = {
  getSettings: (merchantId: string) => Promise<MerchantSettings>;
  resolvePositions: (
    merchantId: string,
    items: PositionInput[],
    customerId?: string | null,
  ) => Promise<ResolvedPosition[]>;
  loadActivePromotionRules: (
    merchantId: string,
  ) => Promise<ActivePromotionRule[]>;
  filterPromotionsForCustomer: (
    merchantId: string,
    customerId: string,
    rules: ActivePromotionRule[],
  ) => Promise<ActivePromotionRule[]>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPromoCodesService = (stub: PromoCodesService) =>
  stub as unknown as PromoCodesService;
const asStaffNotificationsService = (stub: TelegramStaffNotificationsService) =>
  stub as unknown as TelegramStaffNotificationsService;
const asStaffMotivationEngine = (stub: StaffMotivationEngine) =>
  stub as unknown as StaffMotivationEngine;
const getIntegrationService = (service: LoyaltyService) =>
  (service as unknown as { integrationService: LoyaltyIntegrationService })
    .integrationService;
const asPrivateService = (service: LoyaltyService) =>
  getIntegrationService(service) as unknown as LoyaltyServicePrivate;
const getContext = (service: LoyaltyService) =>
  (service as unknown as { context: { ensureCustomerContext: MockFn } })
    .context;
const getTiers = (service: LoyaltyService) =>
  (service as unknown as { tiers: { isAllowSameReceipt: MockFn } }).tiers;

describe('LoyaltyService redeem caps', () => {
  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
  };
  const promoCodes = {} as PromoCodesService;
  const staffNotifications = {} as TelegramStaffNotificationsService;
  const staffMotivation = {} as StaffMotivationEngine;

  const makeService = (prismaOverrides: Partial<PrismaStub> = {}) => {
    const prisma: PrismaStub = { ...prismaOverrides };
    const context = {
      ensureCustomerContext: mockFn().mockResolvedValue({
        customerId: 'c-test',
        accrualsBlocked: false,
        redemptionsBlocked: false,
      }),
      ensureCustomerId: mockFn().mockResolvedValue({ id: 'c-test' }),
      resolveDeviceContext: mockFn().mockResolvedValue(null),
      resolveOutletContext: mockFn().mockResolvedValue({ outletId: null }),
    };
    const tiers = {
      resolveTierRatesForCustomer: mockFn().mockResolvedValue({
        earnBps: 0,
        redeemLimitBps: 0,
        tierMinPayment: null,
      }),
      isAllowSameReceipt: mockFn().mockResolvedValue(true),
      refreshTierAssignmentIfExpired: mockFn().mockResolvedValue(undefined),
      recomputeTierProgress: mockFn().mockResolvedValue(undefined),
    };
    return new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodes),
      asStaffNotificationsService(staffNotifications),
      asStaffMotivationEngine(staffMotivation),
      context as unknown as LoyaltyContextService,
      tiers as unknown as LoyaltyTierService,
    );
  };

  const stubIntegrationContext = (service: LoyaltyService) => {
    const servicePrivate = asPrivateService(service);
    jest.spyOn(servicePrivate, 'getSettings').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 0,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
  };

  it('limits redeem by product percent caps', async () => {
    const service = makeService();
    const servicePrivate = asPrivateService(service);
    stubIntegrationContext(service);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      },
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-1',
      customerId: 'c-1',
      balance: 1000,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 0,
        redeemLimitBps: 10000,
        earnPercent: 0,
        redeemLimitPercent: 100,
        tierMinPayment: null,
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
    const servicePrivate = asPrivateService(service);
    stubIntegrationContext(service);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: false,
        promotionMultiplier: 1,
        redeemPercent: 100,
      },
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-2',
      customerId: 'c-2',
      balance: 1000,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 0,
        redeemLimitBps: 10000,
        earnPercent: 0,
        redeemLimitPercent: 100,
        tierMinPayment: null,
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
    const servicePrivate = asPrivateService(service);
    stubIntegrationContext(service);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      },
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-3',
      customerId: 'c-3',
      balance: 1000,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 0,
        redeemLimitBps: 2500,
        earnPercent: 0,
        redeemLimitPercent: 25,
        tierMinPayment: null,
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
    const servicePrivate = asPrivateService(service);
    stubIntegrationContext(service);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: false,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      },
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-4',
      customerId: 'c-4',
      balance: 1000,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 0,
        redeemLimitBps: 5000,
        earnPercent: 0,
        redeemLimitPercent: 50,
        tierMinPayment: null,
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
    const servicePrivate = asPrivateService(service);
    const promoRule: ActivePromotionRule = {
      id: 'promo-1',
      name: 'Fixed promo',
      kind: 'POINTS_MULTIPLIER',
      pointsRuleType: 'fixed',
      pointsValue: 5,
      productIds: new Set<string>(),
      categoryIds: new Set<string>(),
    };
    getContext(service).ensureCustomerContext.mockResolvedValue({
      customerId: 'c-5',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    jest.spyOn(servicePrivate, 'getSettings').mockResolvedValue({
      earnBps: 1000,
      redeemLimitBps: 0,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
    getTiers(service).isAllowSameReceipt.mockResolvedValue(true);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
        pointPromotions: [promoRule],
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-5',
      customerId: 'c-5',
      balance: 0,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 1000,
        redeemLimitBps: 0,
        earnPercent: 10,
        redeemLimitPercent: 0,
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
    const servicePrivate = asPrivateService(service);
    const promoRule: ActivePromotionRule = {
      id: 'promo-2',
      name: 'Fixed promo',
      kind: 'POINTS_MULTIPLIER',
      pointsRuleType: 'fixed',
      pointsValue: 50,
      productIds: new Set<string>(),
      categoryIds: new Set<string>(),
    };
    stubIntegrationContext(service);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: false,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
        pointPromotions: [promoRule],
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-7',
      customerId: 'c-7',
      balance: 0,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 1000,
        redeemLimitBps: 0,
        earnPercent: 10,
        redeemLimitPercent: 0,
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
    const promo: ActivePromotionRule = {
      id: 'promo-1',
      name: 'x2',
      kind: 'POINTS_MULTIPLIER',
      pointsRuleType: 'multiplier',
      pointsValue: 2,
      productIds: new Set<string>(),
      categoryIds: new Set<string>(),
    };
    const prisma: PrismaStub = {
      product: {
        findMany: mockFn<
          Promise<ProductRecord[]>,
          [ProductFindArgs]
        >().mockImplementation(({ where }) => {
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
    };
    const service = makeService(prisma);
    const servicePrivate = asPrivateService(service);
    stubIntegrationContext(service);
    jest
      .spyOn(servicePrivate, 'loadActivePromotionRules')
      .mockResolvedValue([promo]);
    jest
      .spyOn(servicePrivate, 'filterPromotionsForCustomer')
      .mockResolvedValue([promo]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-8',
      customerId: 'c-8',
      balance: 0,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 300,
        redeemLimitBps: 0,
        earnPercent: 3,
        redeemLimitPercent: 0,
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
    const servicePrivate = asPrivateService(service);
    getContext(service).ensureCustomerContext.mockResolvedValue({
      customerId: 'c-6',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    jest.spyOn(servicePrivate, 'getSettings').mockResolvedValue({
      earnBps: 500,
      redeemLimitBps: 10000,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      rulesJson: null,
      updatedAt: null,
    });
    getTiers(service).isAllowSameReceipt.mockResolvedValue(false);
    jest.spyOn(servicePrivate, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
      },
    ]);
    jest.spyOn(getIntegrationService(service), 'balance').mockResolvedValue({
      merchantId: 'm-6',
      customerId: 'c-6',
      balance: 1000,
    });
    jest
      .spyOn(getIntegrationService(service), 'getBaseRatesForCustomer')
      .mockResolvedValue({
        earnBps: 500,
        redeemLimitBps: 10000,
        earnPercent: 5,
        redeemLimitPercent: 100,
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
