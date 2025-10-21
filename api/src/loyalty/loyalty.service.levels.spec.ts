import { LoyaltyService } from './loyalty.service';
import { LevelsService } from '../levels/levels.service';

function mkPrisma(overrides: any = {}) {
  const base: any = {
    customer: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: args?.data?.id || 'C1' })),
    },
    merchant: { upsert: jest.fn(async () => ({})) },
    merchantSettings: {
      findUnique: jest.fn(async () => ({
        merchantId: 'M1',
        updatedAt: new Date(),
        // Levels config: Silver at 500, Gold at 1000; metric by EARN sum
        rulesJson: {
          levelsCfg: {
            periodDays: 365,
            metric: 'earn',
            levels: [
              { name: 'Base', threshold: 0 },
              { name: 'Silver', threshold: 500 },
              { name: 'Gold', threshold: 1000 },
            ],
          },
          levelBenefits: {
            earnBpsBonusByLevel: { Base: 0, Silver: 200, Gold: 400 },
            redeemLimitBpsBonusByLevel: { Base: 0, Silver: 0, Gold: 0 },
          },
        },
      })),
    },
    transaction: {
      count: jest.fn(async () => 0),
      // Customer earned total 600 within period -> Silver
      findMany: jest.fn(async () => [{ amount: 300 }, { amount: 300 }]),
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
        eligibleTotal: 1000,
      },
      undefined,
    );

    // Base earnBps=500 (default) + Silver bonus 200 = 700 bps -> 7% of 1000 = 70 points
    expect(res.pointsToEarn).toBe(70);
    expect(res.canEarn).toBe(true);
  });

  it('increases redeem cap with redeemLimitBps bonus by current level', async () => {
    const prisma = mkPrisma({
      merchantSettings: {
        findUnique: jest.fn(async () => ({
          merchantId: 'M1',
          updatedAt: new Date(),
          rulesJson: {
            levelsCfg: {
              periodDays: 365,
              metric: 'earn',
              levels: [
                { name: 'Base', threshold: 0 },
                { name: 'Silver', threshold: 500 },
                { name: 'Gold', threshold: 1000 },
              ],
            },
            levelBenefits: {
              earnBpsBonusByLevel: { Base: 0, Silver: 0, Gold: 0 },
              redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000, Gold: 2000 },
            },
          },
        })),
      },
      transaction: {
        count: jest.fn(async () => 0),
        // ensure Silver level (600 earned)
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
        eligibleTotal: 1000,
      },
      undefined,
    );

    // Base redeemLimitBps default 5000 + Silver bonus 1000 = 6000 => cap = 600
    expect(res.discountToApply).toBe(600);
    expect(res.pointsToBurn).toBe(600);
  });
});

describe('LevelsService.getLevel', () => {
  it('uses shared helper to compute progress by transactions metric', async () => {
    const prisma = mkPrisma({
      merchantSettings: {
        findUnique: jest.fn(async () => ({
          merchantId: 'M1',
          rulesJson: {
            levelsCfg: {
              metric: 'transactions',
              periodDays: 30,
              levels: [
                { name: 'Base', threshold: 0 },
                { name: 'Fan', threshold: 5 },
              ],
            },
          },
        })),
      },
      transaction: {
        count: jest.fn(async () => 3),
        findMany: jest.fn(async () => []),
      },
    });
    const svc = new LevelsService(prisma, metrics);

    const res = await svc.getLevel('M1', 'C1');

    expect(prisma.transaction.count).toHaveBeenCalled();
    expect(res.current.name).toBe('Base');
    expect(res.next?.name).toBe('Fan');
    expect(res.progressToNext).toBe(2);
    expect(res.metric).toBe('transactions');
  });

  it('returns top level when threshold reached via earn sum', async () => {
    const prisma = mkPrisma({
      transaction: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => [{ amount: 600 }, { amount: 500 }]),
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
