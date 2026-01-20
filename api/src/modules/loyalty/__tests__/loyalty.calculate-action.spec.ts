import { LoyaltyService } from '../services/loyalty.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { PromoCodesService } from '../../promocodes/promocodes.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import type { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import type { LoyaltyContextService } from '../services/loyalty-context.service';
import type { LoyaltyTierService } from '../services/loyalty-tier.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockPrisma = {
  loyaltyPromotion: { findMany: MockFn };
  customer: { findUnique: MockFn };
  customerSegment: { findMany: MockFn };
  segmentCustomer: { findMany: MockFn };
  promotionParticipant: { findMany: MockFn };
};
type PrismaOverrides = {
  loyaltyPromotion?: Partial<MockPrisma['loyaltyPromotion']>;
  customer?: Partial<MockPrisma['customer']>;
  customerSegment?: Partial<MockPrisma['customerSegment']>;
  segmentCustomer?: Partial<MockPrisma['segmentCustomer']>;
  promotionParticipant?: Partial<MockPrisma['promotionParticipant']>;
};
type MetricsStub = {
  inc: MockFn;
  observe: MockFn;
  setGauge: MockFn;
};
type LoyaltyServicePrivate = {
  resolvePositions: MockFn;
  loadActivePromotionRules: MockFn;
};
type PromotionRule = {
  id: string;
  name: string;
  kind: string;
  productIds: Set<string>;
  categoryIds: Set<string>;
  pointsRuleType?: string;
  pointsValue?: number;
  buyQty?: number;
  freeQty?: number;
  fixedPrice?: number;
  segmentId?: string | null;
  usageLimit?: string | null;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPromoCodesService = (stub: PromoCodesService) =>
  stub as unknown as PromoCodesService;
const asStaffNotifyService = (stub: TelegramStaffNotificationsService) =>
  stub as unknown as TelegramStaffNotificationsService;
const asStaffMotivationEngine = (stub: StaffMotivationEngine) =>
  stub as unknown as StaffMotivationEngine;
const asPrivateService = (service: LoyaltyService) =>
  service as unknown as LoyaltyServicePrivate;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

function buildPrisma(overrides: PrismaOverrides = {}): MockPrisma {
  const base: MockPrisma = {
    loyaltyPromotion: { findMany: mockFn() },
    customer: { findUnique: mockFn() },
    customerSegment: { findMany: mockFn() },
    segmentCustomer: { findMany: mockFn() },
    promotionParticipant: { findMany: mockFn() },
  };

  return {
    loyaltyPromotion: {
      ...base.loyaltyPromotion,
      ...overrides.loyaltyPromotion,
    },
    customer: { ...base.customer, ...overrides.customer },
    customerSegment: { ...base.customerSegment, ...overrides.customerSegment },
    segmentCustomer: { ...base.segmentCustomer, ...overrides.segmentCustomer },
    promotionParticipant: {
      ...base.promotionParticipant,
      ...overrides.promotionParticipant,
    },
  };
}

function makeService(prismaOverrides: PrismaOverrides = {}) {
  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
  };
  const prisma = buildPrisma(prismaOverrides);
  const promoCodes = {} as PromoCodesService;
  const staffNotify = {} as TelegramStaffNotificationsService;
  const staffMotivation = {} as StaffMotivationEngine;
  const context = {
    ensureCustomerContext: mockFn().mockResolvedValue({
      customerId: 'cust-1',
      accrualsBlocked: false,
      redemptionsBlocked: false,
    }),
    ensureCustomerId: mockFn().mockResolvedValue({ id: 'cust-1' }),
    resolveDeviceContext: mockFn().mockResolvedValue(null),
    resolveOutletContext: mockFn().mockResolvedValue({ outletId: null }),
  };
  const tiers = {
    resolveTierRatesForCustomer: mockFn().mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 0,
      tierMinPayment: null,
    }),
    isAllowSameReceipt: mockFn().mockResolvedValue(false),
    refreshTierAssignmentIfExpired: mockFn().mockResolvedValue(undefined),
    recomputeTierProgress: mockFn().mockResolvedValue(undefined),
  };
  return new LoyaltyService(
    asPrismaService(prisma),
    asMetricsService(metrics),
    asPromoCodesService(promoCodes),
    asStaffNotifyService(staffNotify),
    asStaffMotivationEngine(staffMotivation),
    context as unknown as LoyaltyContextService,
    tiers as unknown as LoyaltyTierService,
  );
}

describe('LoyaltyService.calculateAction', () => {
  it('разбивает позиции по акции NTH_FREE и возвращает base_price только для бесплатных', async () => {
    const svc = makeService();
    const servicePrivate = asPrivateService(svc);
    const promo: PromotionRule = {
      id: '12',
      name: '3 пиццы по цене 2х',
      kind: 'NTH_FREE',
      buyQty: 2,
      freeQty: 1,
      productIds: new Set(['prod-1']),
      categoryIds: new Set<string>(),
    };

    servicePrivate.resolvePositions = mockFn().mockResolvedValue([
      {
        externalId: 'picca-01',
        name: 'Пицца',
        qty: 3,
        price: 500,
        amount: 1500,
        resolvedProductId: 'prod-1',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    servicePrivate.loadActivePromotionRules = mockFn().mockResolvedValue([
      promo,
    ]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ externalId: 'picca-01', qty: 3, price: 500 }],
    });

    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toEqual(
      objectContaining({
        id_product: 'picca-01',
        qty: 1,
        price: 0,
        base_price: 500,
        actions: ['12'],
        actions_names: ['3 пиццы по цене 2х'],
      }),
    );
    expect(result.positions[1]).toEqual(
      objectContaining({
        id_product: 'picca-01',
        qty: 2,
        price: 500,
        base_price: null,
        actions: [],
        actions_names: [],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: 3 пиццы по цене 2х — 1 шт. бесплатно для товара "Пицца"',
    );
  });

  it('применяет акционную цену и переносит исходную стоимость в base_price', async () => {
    const svc = makeService();
    const servicePrivate = asPrivateService(svc);
    const promo: PromotionRule = {
      id: 'p-fixed',
      name: 'Спеццена',
      kind: 'FIXED_PRICE',
      fixedPrice: 150,
      productIds: new Set(['prod-2']),
      categoryIds: new Set<string>(),
    };

    servicePrivate.resolvePositions = mockFn().mockResolvedValue([
      {
        externalId: 'latte-01',
        name: 'Латте',
        qty: 1,
        price: 200,
        amount: 200,
        resolvedProductId: 'prod-2',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    servicePrivate.loadActivePromotionRules = mockFn().mockResolvedValue([
      promo,
    ]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ externalId: 'latte-01', qty: 1, price: 200 }],
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual(
      objectContaining({
        id_product: 'latte-01',
        qty: 1,
        price: 150,
        base_price: 200,
        actions: ['p-fixed'],
        actions_names: ['Спеццена'],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: Спеццена — цена 150 вместо 200 для товара "Латте"',
    );
  });

  it('для балльных акций не меняет цену и не заполняет base_price', async () => {
    const svc = makeService();
    const servicePrivate = asPrivateService(svc);
    const promo: PromotionRule = {
      id: 'p-mult',
      name: 'Х2 баллы',
      kind: 'POINTS_MULTIPLIER',
      pointsRuleType: 'multiplier',
      pointsValue: 2,
      productIds: new Set(['prod-3']),
      categoryIds: new Set<string>(),
    };

    servicePrivate.resolvePositions = mockFn().mockResolvedValue([
      {
        externalId: 'cake-01',
        name: 'Чизкейк',
        qty: 1,
        price: 300,
        amount: 300,
        resolvedProductId: 'prod-3',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    servicePrivate.loadActivePromotionRules = mockFn().mockResolvedValue([
      promo,
    ]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ externalId: 'cake-01', qty: 1, price: 300 }],
    });

    expect(result.positions[0]).toEqual(
      objectContaining({
        id_product: 'cake-01',
        price: 300,
        base_price: null,
        actions: ['p-mult'],
        actions_names: ['Х2 баллы'],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: Х2 баллы (x2) для товара "Чизкейк"',
    );
  });

  it('фильтрует акции по аудитории и лимитам использования', async () => {
    const now = new Date();
    const svc = makeService({
      customer: {
        findUnique: mockFn().mockResolvedValue({
          id: 'C-1',
          merchantId: 'M-1',
          accrualsBlocked: false,
          redemptionsBlocked: false,
        }),
      },
      customerSegment: {
        findMany: mockFn().mockResolvedValue([
          { id: 'seg-1', systemKey: null, isSystem: false, rules: {} },
          { id: 'seg-2', systemKey: null, isSystem: false, rules: {} },
        ]),
      },
      segmentCustomer: {
        findMany: mockFn().mockResolvedValue([{ segmentId: 'seg-1' }]),
      },
      promotionParticipant: {
        findMany: mockFn().mockResolvedValue([
          {
            promotionId: 'promo-limit',
            purchasesCount: 1,
            lastPurchaseAt: now,
          },
        ]),
      },
    });
    const servicePrivate = asPrivateService(svc);
    const promos: PromotionRule[] = [
      {
        id: 'promo-seg',
        name: 'Сегмент',
        kind: 'POINTS_MULTIPLIER',
        pointsRuleType: 'multiplier',
        pointsValue: 2,
        productIds: new Set(['prod-1']),
        categoryIds: new Set<string>(),
        segmentId: 'seg-1',
        usageLimit: null,
      },
      {
        id: 'promo-limit',
        name: 'Лимит',
        kind: 'POINTS_MULTIPLIER',
        pointsRuleType: 'multiplier',
        pointsValue: 2,
        productIds: new Set(['prod-1']),
        categoryIds: new Set<string>(),
        segmentId: null,
        usageLimit: 'once_per_day',
      },
      {
        id: 'promo-other',
        name: 'Другой сегмент',
        kind: 'POINTS_MULTIPLIER',
        pointsRuleType: 'multiplier',
        pointsValue: 2,
        productIds: new Set(['prod-1']),
        categoryIds: new Set<string>(),
        segmentId: 'seg-2',
        usageLimit: null,
      },
      {
        id: 'promo-open',
        name: 'Общая акция',
        kind: 'POINTS_MULTIPLIER',
        pointsRuleType: 'multiplier',
        pointsValue: 2,
        productIds: new Set(['prod-1']),
        categoryIds: new Set<string>(),
        segmentId: null,
        usageLimit: null,
      },
    ];

    servicePrivate.resolvePositions = mockFn().mockResolvedValue([
      {
        externalId: 'cake-01',
        name: 'Чизкейк',
        qty: 1,
        price: 300,
        amount: 300,
        resolvedProductId: 'prod-1',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    servicePrivate.loadActivePromotionRules =
      mockFn().mockResolvedValue(promos);

    const result: Awaited<ReturnType<LoyaltyService['calculateAction']>> =
      await svc.calculateAction({
        merchantId: 'M-1',
        customerId: 'C-1',
        items: [{ externalId: 'cake-01', qty: 1, price: 300 }],
      });

    const applied = [
      ...(result.positions[0].actions as Iterable<string>),
    ].sort();
    expect(applied).toEqual(['promo-open', 'promo-seg']);
  });
});

describe('LoyaltyService.loadActivePromotionRules', () => {
  it('запрашивает акции с корректным фильтром endAt', async () => {
    const findMany = mockFn().mockResolvedValue([]);
    const svc = makeService({ loyaltyPromotion: { findMany } });
    const servicePrivate = asPrivateService(svc);
    const now = new Date('2025-01-10T12:00:00.000Z');

    await servicePrivate.loadActivePromotionRules('m-1', now);

    expect(findMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({
          OR: [{ startAt: null }, { startAt: { lte: now } }],
          AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
        }),
      }),
    );
  });

  it('собирает правила по товарам и механикам акций', async () => {
    const now = new Date('2025-01-10T12:00:00.000Z');
    const findMany = mockFn().mockResolvedValue([
      {
        id: 'p-1',
        name: 'x2 баллы',
        rewardType: 'POINTS',
        rewardMetadata: {
          pointsRuleType: 'multiplier',
          pointsValue: 2,
          productIds: ['prod-1'],
        },
      },
      {
        id: 'p-2',
        name: '2+1',
        rewardType: 'DISCOUNT',
        rewardMetadata: {
          kind: 'NTH_FREE',
          buyQty: 2,
          freeQty: 1,
          productIds: ['prod-2'],
        },
      },
      {
        id: 'p-3',
        name: 'Цена 99',
        rewardType: 'DISCOUNT',
        rewardMetadata: {
          kind: 'FIXED_PRICE',
          price: 99,
          productIds: ['prod-3'],
        },
      },
    ]);
    const svc = makeService({ loyaltyPromotion: { findMany } });
    const servicePrivate = asPrivateService(svc);

    const rules = (await servicePrivate.loadActivePromotionRules(
      'm-1',
      now,
    )) as PromotionRule[];

    const ruleById = (id: string) => rules.find((rule) => rule.id === id);
    expect(ruleById('p-1')).toEqual(
      objectContaining({
        kind: 'POINTS_MULTIPLIER',
        pointsRuleType: 'multiplier',
        pointsValue: 2,
      }),
    );
    expect(Array.from(ruleById('p-1')?.productIds ?? [])).toEqual(['prod-1']);

    expect(ruleById('p-2')).toEqual(
      objectContaining({
        kind: 'NTH_FREE',
        buyQty: 2,
        freeQty: 1,
      }),
    );
    expect(Array.from(ruleById('p-2')?.productIds ?? [])).toEqual(['prod-2']);

    expect(ruleById('p-3')).toEqual(
      objectContaining({
        kind: 'FIXED_PRICE',
        fixedPrice: 99,
      }),
    );
    expect(Array.from(ruleById('p-3')?.productIds ?? [])).toEqual(['prod-3']);
  });
});
