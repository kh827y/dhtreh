import { LoyaltyService } from '../services/loyalty.service';
import { LevelsService } from '../../levels/levels.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { PromoCodesService } from '../../promocodes/promocodes.service';
import type { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import type { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import { LoyaltyContextService } from '../services/loyalty-context.service';
import { LoyaltyTierService } from '../services/loyalty-tier.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type MockPrisma = {
  customer: MockModel;
  merchant: MockModel;
  merchantSettings: MockModel;
  transaction: MockModel;
  loyaltyTier: MockModel;
  loyaltyTierAssignment: MockModel;
  receipt: MockModel;
  hold: MockModel;
  holdItem: MockModel;
  wallet: MockModel;
  $transaction: MockFn<unknown, [(tx: MockPrisma) => unknown]>;
  [key: string]: MockModel | MockFn | undefined;
};
type MetricsStub = Pick<MetricsService, 'inc' | 'observe' | 'setGauge'>;
type StaffMotivationStub = {
  getSettings: MockFn<
    ReturnType<StaffMotivationEngine['getSettings']>,
    Parameters<StaffMotivationEngine['getSettings']>
  >;
  recordPurchase: MockFn<
    ReturnType<StaffMotivationEngine['recordPurchase']>,
    Parameters<StaffMotivationEngine['recordPurchase']>
  >;
  recordRefund: MockFn<
    ReturnType<StaffMotivationEngine['recordRefund']>,
    Parameters<StaffMotivationEngine['recordRefund']>
  >;
  getLeaderboard: MockFn<
    ReturnType<StaffMotivationEngine['getLeaderboard']>,
    Parameters<StaffMotivationEngine['getLeaderboard']>
  >;
};
type PromoCodesStub = { apply: MockFn };
type NotificationsStub = Record<string, unknown>;
type QuoteResult = {
  pointsToEarn?: number;
  canEarn?: boolean;
  discountToApply?: number;
  pointsToBurn?: number;
};
type LoyaltyServicePrivate = {
  quote: (
    params: Record<string, unknown>,
    opts?: unknown,
  ) => Promise<QuoteResult>;
};
type LoyaltyTierPrivate = {
  promoteTierIfEligible: (
    tx: Record<string, unknown>,
    params: { merchantId: string; customerId: string; progress: number },
  ) => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const mockFnWithImpl = <Return, Args extends unknown[]>(
  impl: (...args: Args) => Return,
) => mockFn<Return, Args>().mockImplementation(impl);
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPromoCodesService = (stub: PromoCodesStub) =>
  stub as unknown as PromoCodesService;
const asNotificationsService = (stub: NotificationsStub) =>
  stub as unknown as TelegramStaffNotificationsService;
const asStaffMotivationEngine = (stub: StaffMotivationStub) =>
  stub as unknown as StaffMotivationEngine;
const buildContext = (prisma: MockPrisma) =>
  new LoyaltyContextService(asPrismaService(prisma));
const buildTiers = (prisma: MockPrisma) =>
  new LoyaltyTierService(asPrismaService(prisma));
const getTiers = (service: LoyaltyService) =>
  (service as unknown as { tiers: LoyaltyTierService }).tiers;

function mkPrisma(overrides: Partial<MockPrisma> = {}): MockPrisma {
  const base: MockPrisma = {
    customer: {
      findUnique: mockFnWithImpl(() => ({
        id: 'C1',
        merchantId: 'M1',
      })),
      findMany: mockFnWithImpl(() => []),
      create: mockFnWithImpl((args: { data?: { id?: string } }) => ({
        id: args?.data?.id || 'C1',
        merchantId: 'M1',
      })),
    },
    merchant: { upsert: mockFnWithImpl(() => ({})) },
    merchantSettings: {
      findUnique: mockFnWithImpl(() => ({
        merchantId: 'M1',
        updatedAt: new Date(),
        rulesJson: {},
      })),
    },
    transaction: {
      count: mockFnWithImpl(() => 0),
      // Customer earned total 600 within period -> Silver
      findMany: mockFnWithImpl(() => [{ amount: 300 }, { amount: 300 }]),
    },
    loyaltyTier: {
      findMany: mockFnWithImpl(() => []),
      findUnique: mockFnWithImpl(() => null),
      findFirst: mockFnWithImpl(
        (params?: { where?: { isInitial?: boolean; merchantId?: string } }) =>
          params?.where?.isInitial
            ? {
                id: 'tier-base',
                merchantId: params.where?.merchantId ?? 'M1',
                name: 'Base',
                thresholdAmount: 0,
                earnRateBps: 500,
                redeemRateBps: 5000,
                metadata: { minPaymentAmount: 0 },
                isHidden: false,
              }
            : null,
      ),
      aggregate: mockFnWithImpl(() => ({ _min: { order: null } })),
      create: mockFnWithImpl((args: { data?: Record<string, unknown> }) => ({
        id: 'tier-created',
        ...(args?.data ?? {}),
      })),
    },
    loyaltyTierAssignment: {
      findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(null),
      findMany: mockFnWithImpl(() => []),
      count: mockFnWithImpl(() => 0),
      groupBy: mockFnWithImpl(() => []),
      create: mockFnWithImpl(() => ({})),
      update: mockFnWithImpl(() => ({})),
    },
    receipt: {
      count: mockFnWithImpl(() => 0),
      findMany: mockFnWithImpl(() => []),
      findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
        null,
      ),
      aggregate: mockFnWithImpl(() => ({ _sum: { total: 0 } })),
    },
    hold: {
      findUnique: mockFnWithImpl(() => null),
      findFirst: mockFnWithImpl(() => null),
      create: mockFnWithImpl((args: { data?: Record<string, unknown> }) => ({
        id: 'H1',
        ...(args?.data ?? {}),
      })),
    },
    holdItem: {
      deleteMany: mockFnWithImpl(() => ({ count: 0 })),
      createMany: mockFnWithImpl(() => ({ count: 0 })),
    },
    wallet: {
      findFirst: mockFnWithImpl(() => null),
      create: mockFnWithImpl(() => ({ id: 'W1', balance: 0 })),
    },
    $transaction: mockFn<unknown, [(tx: MockPrisma) => unknown]>(),
  };
  const merged: MockPrisma = { ...base, ...overrides };
  for (const key of Object.keys(overrides)) {
    const baseValue = base[key];
    const overrideValue = overrides[key];
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      merged[key] = { ...baseValue, ...overrideValue };
    }
  }
  merged.$transaction.mockImplementation((fn) => fn(merged));
  return merged;
}

function mockAssignedTier(
  prisma: ReturnType<typeof mkPrisma>,
  tier: Partial<{ earnRateBps: number; redeemRateBps: number }>,
) {
  prisma.loyaltyTierAssignment.findFirst = mockFn<
    Promise<unknown>,
    [unknown?]
  >().mockResolvedValue({
    id: 'assign-tier',
    merchantId: 'M1',
    customerId: 'C1',
    tierId: 'tier-silver',
    assignedAt: new Date(),
    expiresAt: null,
  });
  prisma.loyaltyTier.findUnique = mockFnWithImpl(() => ({
    id: 'tier-silver',
    merchantId: 'M1',
    name: 'Silver',
    thresholdAmount: 500,
    earnRateBps: tier.earnRateBps ?? 500,
    redeemRateBps: tier.redeemRateBps ?? 5000,
    metadata: { minPaymentAmount: 0 },
    isHidden: false,
  }));
}

const metrics: MetricsStub = {
  inc: mockFn(),
  observe: mockFn(),
  setGauge: mockFn(),
};
const promoCodes: PromoCodesStub = { apply: mockFn() };
const notificationsStub: NotificationsStub = {};

function mkStaffMotivation(
  overrides: Partial<StaffMotivationStub> = {},
): StaffMotivationStub {
  const base: StaffMotivationStub = {
    getSettings: mockFn<
      ReturnType<StaffMotivationEngine['getSettings']>,
      Parameters<StaffMotivationEngine['getSettings']>
    >().mockResolvedValue({
      enabled: false,
      pointsForNewCustomer: 30,
      pointsForExistingCustomer: 10,
      leaderboardPeriod: 'week',
      customDays: null,
      updatedAt: null,
    }),
    recordPurchase: mockFn<
      ReturnType<StaffMotivationEngine['recordPurchase']>,
      Parameters<StaffMotivationEngine['recordPurchase']>
    >().mockResolvedValue({ pointsIssued: 0 }),
    recordRefund: mockFn<
      ReturnType<StaffMotivationEngine['recordRefund']>,
      Parameters<StaffMotivationEngine['recordRefund']>
    >().mockResolvedValue({ pointsDeducted: 0 }),
    getLeaderboard: mockFn<
      ReturnType<StaffMotivationEngine['getLeaderboard']>,
      Parameters<StaffMotivationEngine['getLeaderboard']>
    >(),
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoyaltyService.quote with level benefits (Wave 2)', () => {
  it('applies earnBps bonus by current level', async () => {
    const prisma = mkPrisma();
    mockAssignedTier(prisma, { earnRateBps: 700 });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodes),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(prisma),
      buildTiers(prisma),
    );

    const svcPrivate = svc as unknown as LoyaltyServicePrivate;
    const res = await svcPrivate.quote(
      {
        mode: 'earn',
        merchantId: 'M1',
        userToken: 'C1',
        orderId: 'O-1',
        total: 1000,
      },
      undefined,
    );

    // earnRateBps берётся из назначенного tier (700 bps) -> 7% от 1000 = 70 баллов
    expect(res.pointsToEarn).toBe(70);
    expect(res.canEarn).toBe(true);
  });

  it('uses redeemLimitBps from loyalty tier for cap', async () => {
    const prisma = mkPrisma({
      transaction: {
        count: mockFnWithImpl(() => 0),
        findMany: mockFnWithImpl(() => [{ amount: 300 }, { amount: 300 }]),
      },
      wallet: {
        findFirst: mockFnWithImpl(() => ({
          id: 'W1',
          balance: 1000,
          type: 'POINTS',
        })),
      },
    });
    mockAssignedTier(prisma, { earnRateBps: 500, redeemRateBps: 6000 });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodes),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(prisma),
      buildTiers(prisma),
    );

    const svcPrivate = svc as unknown as LoyaltyServicePrivate;
    const res = await svcPrivate.quote(
      {
        mode: 'redeem',
        merchantId: 'M1',
        userToken: 'C1',
        orderId: 'O-2',
        total: 1000,
      },
      undefined,
    );

    // Base redeemLimitBps default 5000 + Silver bonus 1000 = 6000 => cap = 600
    expect(res.discountToApply).toBe(600);
    expect(res.pointsToBurn).toBe(600);
  });
});

describe('LevelsService.getLevel', () => {
  it('computes progress by receipts sum using portal tiers', async () => {
    const prisma = mkPrisma({
      loyaltyTier: {
        findMany: mockFnWithImpl(() => [
          {
            id: 'tier-base',
            name: 'Base',
            thresholdAmount: 0,
            isHidden: false,
          },
          {
            id: 'tier-silver',
            name: 'Silver',
            thresholdAmount: 500,
            isHidden: false,
          },
        ]),
      },
      receipt: {
        findMany: mockFnWithImpl(() => [{ total: 200 }, { total: 100 }]),
        count: mockFnWithImpl(() => 0),
      },
    });
    const svc = new LevelsService(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );

    const res = await svc.getLevel('M1', 'C1');

    expect(prisma.receipt.findMany).toHaveBeenCalled();
    expect(res.current.name).toBe('Base');
    expect(res.next?.name).toBe('Silver');
    expect(res.progressToNext).toBe(200);
    expect(res.metric).toBe('earn');
  });

  it('returns top visible level when threshold reached', async () => {
    const prisma = mkPrisma({
      loyaltyTier: {
        findMany: mockFnWithImpl(() => [
          {
            id: 'tier-base',
            name: 'Base',
            thresholdAmount: 0,
            isHidden: false,
          },
          {
            id: 'tier-gold',
            name: 'Gold',
            thresholdAmount: 1000,
            isHidden: false,
          },
        ]),
      },
      receipt: {
        findMany: mockFnWithImpl(() => [{ total: 600 }, { total: 500 }]),
        count: mockFnWithImpl(() => 0),
      },
    });
    const svc = new LevelsService(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );

    const res = await svc.getLevel('M1', 'C1');

    expect(res.current.name).toBe('Gold');
    expect(res.next).toBeNull();
    expect(res.progressToNext).toBe(0);
    expect(res.value).toBe(1100);
  });
});

describe('LoyaltyService tier promotion helper', () => {
  it('promotes customer via upsert when progress reaches next threshold', async () => {
    const prisma = mkPrisma();
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodes),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(prisma),
      buildTiers(prisma),
    );
    const tx: {
      loyaltyTier: MockModel;
      loyaltyTierAssignment: MockModel;
      eventOutbox: MockModel;
    } = {
      loyaltyTier: {
        findMany: mockFnWithImpl(() => [
          { id: 'tier-base', thresholdAmount: 0, isHidden: false },
          { id: 'tier-silver', thresholdAmount: 1000, isHidden: false },
        ]),
      },
      loyaltyTierAssignment: {
        findFirst: mockFnWithImpl(() => ({
          id: 'assign-1',
          merchantId: 'M1',
          customerId: 'C1',
          tierId: 'tier-base',
          tier: { id: 'tier-base', thresholdAmount: 0, isHidden: false },
        })),
        upsert: mockFnWithImpl(() => ({})),
      },
      eventOutbox: {
        create: mockFnWithImpl(() => ({})),
      },
    };

    const tiersPrivate = getTiers(svc) as unknown as LoyaltyTierPrivate;
    await tiersPrivate.promoteTierIfEligible(tx, {
      merchantId: 'M1',
      customerId: 'C1',
      progress: 1500,
    });

    expect(tx.loyaltyTierAssignment.upsert).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      objectContaining({
        create: objectContaining({
          merchantId: 'M1',
          customerId: 'C1',
          tierId: 'tier-silver',
        }),
        update: objectContaining({ tierId: 'tier-silver' }),
      }),
    );
  });
});
