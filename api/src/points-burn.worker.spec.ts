import { PointsBurnWorker } from './points-burn.worker';

describe('PointsBurnWorker (unit)', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('tick burns remaining lot points and emits burned event when flags enabled', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const lots = [
      {
        id: 'L1',
        merchantId: 'M1',
        customerId: 'C1',
        points: 100,
        consumedPoints: 20,
        earnedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        orderId: 'order-1',
      },
      {
        id: 'L2',
        merchantId: 'M1',
        customerId: 'C1',
        points: 30,
        consumedPoints: 0,
        earnedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        orderId: 'order-2',
      },
    ];
    const remain =
      lots[0].points -
      lots[0].consumedPoints +
      (lots[1].points - lots[1].consumedPoints); // 110

    const updates: any[] = [];
    const txInstance: any = {
      wallet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'W1',
          merchantId: 'M1',
          customerId: 'C1',
          type: 'POINTS',
          balance: 200,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      earnLot: {
        findMany: jest.fn().mockResolvedValue(lots),
        update: jest.fn(async (args: any) => {
          updates.push(args);
          return {};
        }),
      },
      transaction: { create: jest.fn().mockResolvedValue({}) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      eventOutbox: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma: any = {
      merchantSettings: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: { findMany: jest.fn().mockResolvedValue(lots) },
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        await fn(txInstance),
    };

    const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };

    const w = new PointsBurnWorker(prisma, metrics);
    // @ts-ignore private
    await w.tick();

    // Burn amount is min(wallet.balance=200, remain=110) = 110
    expect(txInstance.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADJUST', amount: -110 }),
      }),
    );
    // Wallet decremented by burned amount (110)
    expect(txInstance.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'W1', balance: { gte: 110 } },
        data: expect.objectContaining({ balance: { decrement: 110 } }),
      }),
    );
    // Lots consumed in FIFO order; ensure at least one update occurred
    expect(updates.length).toBeGreaterThan(0);
    // Outbox event emitted for burned points
    expect(txInstance.eventOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'loyalty.points_ttl.burned',
        }),
      }),
    );
  });

  it('tick skips when no balance or no lots remain', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const lots: any[] = [
      {
        id: 'L1',
        merchantId: 'M1',
        customerId: 'C1',
        points: 100,
        consumedPoints: 100,
        earnedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        orderId: 'order-1',
      },
    ];

    const tx = {
      wallet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'W1',
          merchantId: 'M1',
          customerId: 'C1',
          type: 'POINTS',
          balance: 0,
        }),
      },
      earnLot: { findMany: jest.fn().mockResolvedValue(lots) },
      transaction: { create: jest.fn() },
      eventOutbox: { create: jest.fn() },
    };

    const prisma: any = {
      merchantSettings: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: { findMany: jest.fn().mockResolvedValue(lots) },
      $transaction: async (fn: (tx: any) => Promise<any>) => await fn(tx),
    };

    const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };
    const w = new PointsBurnWorker(prisma, metrics);
    // @ts-ignore private
    await w.tick();

    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.eventOutbox.create).not.toHaveBeenCalled();
  });
});
