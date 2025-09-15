import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService.quote with level benefits (Wave 2)', () => {
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
            levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 500 }, { name: 'Gold', threshold: 1000 } ] },
            levelBenefits: {
              earnBpsBonusByLevel: { Base: 0, Silver: 200, Gold: 400 },
              redeemLimitBpsBonusByLevel: { Base: 0, Silver: 0, Gold: 0 },
            },
          },
        }))
      },
      transaction: {
        // Customer earned total 600 within period -> Silver
        findMany: jest.fn(async () => ([ { amount: 300 }, { amount: 300 } ])),
      },
      device: { findUnique: jest.fn(async () => null) },
      hold: { findUnique: jest.fn(async () => null), create: jest.fn(async (args: any) => ({ id: 'H1', ...args?.data })) },
      wallet: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'W1', balance: 0 })),
      },
      $transaction: jest.fn(async (fn: any) => fn(base)),
    };
    return Object.assign(base, overrides);
  }

  const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

  it('applies earnBps bonus by current level', async () => {
    const prisma = mkPrisma();
    const svc = new LoyaltyService(prisma as any, metrics);

    const res = await (svc as any).quote({
      mode: 'earn',
      merchantId: 'M1',
      userToken: 'C1',
      orderId: 'O-1',
      total: 1000,
      eligibleTotal: 1000,
    }, undefined);

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
            levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 500 }, { name: 'Gold', threshold: 1000 } ] },
            levelBenefits: {
              earnBpsBonusByLevel: { Base: 0, Silver: 0, Gold: 0 },
              redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000, Gold: 2000 },
            },
          },
        }))
      },
      transaction: {
        // ensure Silver level (600 earned)
        findMany: jest.fn(async () => ([ { amount: 300 }, { amount: 300 } ])),
      },
      wallet: {
        findFirst: jest.fn(async () => ({ id: 'W1', balance: 1000, type: 'POINTS' })),
      },
    });
    const svc = new LoyaltyService(prisma as any, metrics);

    const res = await (svc as any).quote({
      mode: 'redeem',
      merchantId: 'M1',
      userToken: 'C1',
      orderId: 'O-2',
      total: 1000,
      eligibleTotal: 1000,
    }, undefined);

    // Base redeemLimitBps default 5000 + Silver bonus 1000 = 6000 => cap = 600
    expect(res.discountToApply).toBe(600);
    expect(res.pointsToBurn).toBe(600);
  });
});
