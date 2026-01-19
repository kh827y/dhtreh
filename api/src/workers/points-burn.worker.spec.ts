import { PointsBurnWorker } from './points-burn.worker';
import * as lockUtil from '../shared/pg-lock.util';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type EarnLotRecord = {
  id: string;
  merchantId: string;
  customerId: string;
  points: number;
  consumedPoints: number;
  earnedAt: Date;
  orderId: string;
};
type WalletRecord = {
  id: string;
  merchantId: string;
  customerId: string;
  type: string;
  balance: number;
};
type TxStub = {
  wallet: {
    findFirst: MockFn<WalletRecord | null, [unknown?]>;
    updateMany?: MockFn<{ count: number }, [unknown]>;
  };
  earnLot: {
    findMany: MockFn<EarnLotRecord[], [unknown?]>;
    update?: MockFn<unknown, [unknown]>;
  };
  transaction: { create: MockFn<unknown, [unknown]> };
  ledgerEntry?: { create: MockFn<unknown, [unknown]> };
  eventOutbox: { create: MockFn<unknown, [unknown]> };
};
type PrismaStub = {
  merchantSettings: {
    findMany: MockFn<Array<{ merchantId: string; pointsTtlDays: number }>>;
  };
  earnLot: { findMany: MockFn<EarnLotRecord[]> };
  $transaction: (fn: (tx: TxStub) => Promise<unknown>) => Promise<unknown>;
};
type MetricsStub = { inc: MockFn; setGauge: MockFn };
type WorkerPrivate = { tick: () => Promise<void> };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateWorker = (worker: PointsBurnWorker) =>
  worker as unknown as WorkerPrivate;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

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

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const lots: EarnLotRecord[] = [
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
    const updates: Array<unknown> = [];
    const txInstance: TxStub = {
      wallet: {
        findFirst: mockFn<WalletRecord | null, [unknown?]>().mockResolvedValue({
          id: 'W1',
          merchantId: 'M1',
          customerId: 'C1',
          type: 'POINTS',
          balance: 200,
        }),
        updateMany: mockFn<{ count: number }, [unknown]>().mockResolvedValue({
          count: 1,
        }),
      },
      earnLot: {
        findMany: mockFn<EarnLotRecord[], [unknown?]>().mockResolvedValue(lots),
        update: mockFn<unknown, [unknown]>().mockImplementation((args) => {
          updates.push(args);
          return {};
        }),
      },
      transaction: {
        create: mockFn<unknown, [unknown]>().mockResolvedValue({}),
      },
      ledgerEntry: {
        create: mockFn<unknown, [unknown]>().mockResolvedValue({}),
      },
      eventOutbox: {
        create: mockFn<unknown, [unknown]>().mockResolvedValue({}),
      },
    };

    const prisma: PrismaStub = {
      merchantSettings: {
        findMany: mockFn<
          Array<{ merchantId: string; pointsTtlDays: number }>
        >().mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: { findMany: mockFn<EarnLotRecord[]>().mockResolvedValue(lots) },
      $transaction: async (fn) => await fn(txInstance),
    };

    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };

    const w = new PointsBurnWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );
    const workerPrivate = asPrivateWorker(w);
    await workerPrivate.tick();

    // Burn amount is min(wallet.balance=200, remain=110) = 110
    expect(txInstance.transaction.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ type: 'ADJUST', amount: -110 }),
      }),
    );
    // Wallet decremented by burned amount (110)
    expect(txInstance.wallet.updateMany).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'W1', balance: { gte: 110 } },
        data: objectContaining({ balance: { decrement: 110 } }),
      }),
    );
    // Lots consumed in FIFO order; ensure at least one update occurred
    expect(updates.length).toBeGreaterThan(0);
    // Outbox event emitted for burned points
    expect(txInstance.eventOutbox.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          eventType: 'loyalty.points_ttl.burned',
        }),
      }),
    );
  });

  it('tick skips when no balance or no lots remain', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const lots: EarnLotRecord[] = [
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

    const tx: TxStub = {
      wallet: {
        findFirst: mockFn<WalletRecord | null, [unknown?]>().mockResolvedValue({
          id: 'W1',
          merchantId: 'M1',
          customerId: 'C1',
          type: 'POINTS',
          balance: 0,
        }),
      },
      earnLot: {
        findMany: mockFn<EarnLotRecord[], [unknown?]>().mockResolvedValue(lots),
      },
      transaction: { create: mockFn<unknown, [unknown]>() },
      eventOutbox: { create: mockFn<unknown, [unknown]>() },
    };

    const prisma: PrismaStub = {
      merchantSettings: {
        findMany: mockFn<
          Array<{ merchantId: string; pointsTtlDays: number }>
        >().mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: { findMany: mockFn<EarnLotRecord[]>().mockResolvedValue(lots) },
      $transaction: async (fn) => await fn(tx),
    };

    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };
    const w = new PointsBurnWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );
    const workerPrivate = asPrivateWorker(w);
    await workerPrivate.tick();

    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.eventOutbox.create).not.toHaveBeenCalled();
  });
});
