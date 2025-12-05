import { LoyaltyService } from './loyalty.service';
import { LevelsService } from '../levels/levels.service';

function mkPrisma(overrides: any = {}) {
  const base: any = {
    customer: {
      findUnique: jest.fn(async () => ({
        id: 'C1',
        merchantId: 'M1',
      })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: any) => ({ id: args?.data?.id || 'C1', merchantId: 'M1' })),
    },
    merchant: { upsert: jest.fn(async () => ({})) },
    merchantSettings: {
      findUnique: jest.fn(async () => ({
        merchantId: 'M1',
        updatedAt: new Date(),
        rulesJson: {},
      })),
    },
    transaction: {
      count: jest.fn(async () => 0),
      // Customer earned total 600 within period -> Silver
      findMany: jest.fn(async () => [{ amount: 300 }, { amount: 300 }]),
    },
    loyaltyTier: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async (params?: any) =>
        params?.where?.isInitial
          ? {
              id: 'tier-base',
              merchantId: params.where.merchantId ?? 'M1',
              name: 'Base',
              thresholdAmount: 0,
              earnRateBps: 500,
              redeemRateBps: 5000,
              metadata: { minPaymentAmount: 0 },
              isHidden: false,
            }
          : null,
      ),
      aggregate: jest.fn(async () => ({ _min: { order: null } })),
      create: jest.fn(async (args: any) => ({
        id: 'tier-created',
        ...(args?.data ?? {}),
      })),
    },
    loyaltyTierAssignment: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    receipt: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { total: 0 } })),
    },
    hold: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'H1', ...args?.data })),
    },
    wallet: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'W1', balance: 0 })),
    },
    $transaction: jest.fn(async (fn: any) => fn(base)),
  };
  return Object.assign(base, overrides);
}

function mockAssignedTier(
  prisma: ReturnType<typeof mkPrisma>,
  tier: Partial<{ earnRateBps: number; redeemRateBps: number }>,
) {
  prisma.loyaltyTierAssignment.findFirst = jest.fn().mockResolvedValue({
    id: 'assign-tier',
    merchantId: 'M1',
    customerId: 'C1',
    tierId: 'tier-silver',
    assignedAt: new Date(),
    expiresAt: null,
  });
  prisma.loyaltyTier.findUnique = jest.fn(async () => ({
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

const metrics = {
  inc: jest.fn(),
  observe: jest.fn(),
  setGauge: jest.fn(),
} as any;
const promoCodes = { apply: jest.fn() } as any;

function mkStaffMotivation(overrides: any = {}) {
  return Object.assign(
    {
      getSettings: jest.fn().mockResolvedValue({
        enabled: false,
        pointsForNewCustomer: 30,
        pointsForExistingCustomer: 10,
        leaderboardPeriod: 'week',
        customDays: null,
        updatedAt: null,
      }),
      recordPurchase: jest.fn().mockResolvedValue({ pointsIssued: 0 }),
      recordRefund: jest.fn().mockResolvedValue({ pointsDeducted: 0 }),
      getLeaderboard: jest.fn(),
    },
    overrides,
  );
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
      prisma,
      metrics,
      promoCodes,
      undefined as any,
      staffMotivation,
    );

    const res = await (svc as any).quote(
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
        count: jest.fn(async () => 0),
        // ensure Silver level (600 earned) for legacy path
        findMany: jest.fn(async () => [{ amount: 300 }, { amount: 300 }]),
      },
      wallet: {
        findFirst: jest.fn(async () => ({
          id: 'W1',
          balance: 1000,
          type: 'POINTS',
        })),
      },
    });
    mockAssignedTier(prisma, { earnRateBps: 500, redeemRateBps: 6000 });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      promoCodes,
      undefined as any,
      staffMotivation,
    );

    const res = await (svc as any).quote(
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
        findMany: jest.fn(async () => [
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
        findMany: jest.fn(async () => [{ total: 200 }, { total: 100 }]),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new LevelsService(prisma, metrics);

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
        findMany: jest.fn(async () => [
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
        findMany: jest.fn(async () => [{ total: 600 }, { total: 500 }]),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new LevelsService(prisma, metrics);

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
      prisma,
      metrics,
      promoCodes,
      undefined as any,
      staffMotivation,
    );
    const tx = {
      loyaltyTier: {
        findMany: jest.fn(async () => [
          { id: 'tier-base', thresholdAmount: 0, isHidden: false },
          { id: 'tier-silver', thresholdAmount: 1000, isHidden: false },
        ]),
      },
      loyaltyTierAssignment: {
        findFirst: jest.fn(async () => ({
          id: 'assign-1',
          merchantId: 'M1',
          customerId: 'C1',
          tierId: 'tier-base',
          tier: { id: 'tier-base', thresholdAmount: 0, isHidden: false },
        })),
        upsert: jest.fn(async () => ({})),
      },
      eventOutbox: {
        create: jest.fn(async () => ({})),
      },
    } as any;

    await (svc as any).promoteTierIfEligible(tx, {
      merchantId: 'M1',
      customerId: 'C1',
      progress: 1500,
    });

    expect(tx.loyaltyTierAssignment.upsert).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          merchantId: 'M1',
          customerId: 'C1',
          tierId: 'tier-silver',
        }),
        update: expect.objectContaining({ tierId: 'tier-silver' }),
      }),
    );
    expect(tx.eventOutbox.create).toHaveBeenCalledTimes(1);
  });
});
