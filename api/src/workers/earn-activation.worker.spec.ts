import { EarnActivationWorker } from './earn-activation.worker';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';
import * as lockUtil from '../shared/pg-lock.util';
import { AppConfigService } from '../core/config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type EarnLotRecord = {
  id: string;
  merchantId: string;
  customerId: string;
  points: number;
  consumedPoints?: number;
  maturesAt: Date;
  earnedAt?: Date | null;
  status: string;
  orderId?: string | null;
  outletId?: string | null;
  staffId?: string | null;
};
type TxStub = {
  earnLot: {
    findUnique: MockFn<EarnLotRecord | null, [{ where: { id: string } }]>;
    update: MockFn;
  };
  wallet: {
    upsert?: MockFn;
    findFirst?: MockFn;
    findUnique?: MockFn;
    update?: MockFn;
  };
  transaction: { create: MockFn };
  ledgerEntry?: { create: MockFn };
  eventOutbox: { create: MockFn };
};
type PrismaStub = {
  earnLot: { findMany: MockFn<EarnLotRecord[]> };
  $transaction: MockFn<Promise<unknown>, [(tx: TxStub) => Promise<unknown>]>;
};
type MetricsStub = { inc: MockFn; setGauge: MockFn };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

describe('EarnActivationWorker (unit)', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('activates matured PENDING lots, updates wallet and emits event', async () => {
    process.env.WORKERS_ENABLED = '1';

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const maturedAt = new Date(Date.now() - 1000);
    const pendingLot: EarnLotRecord = {
      id: 'L1',
      merchantId: 'M1',
      customerId: 'C1',
      points: 70,
      consumedPoints: 0,
      maturesAt: maturedAt,
      earnedAt: null,
      status: 'PENDING',
      orderId: 'O1',
      outletId: null,
      staffId: null,
    };

    const tx: TxStub = {
      earnLot: {
        findUnique: mockFn<
          EarnLotRecord | null,
          [{ where: { id: string } }]
        >().mockResolvedValue(pendingLot),
        update: mockFn().mockResolvedValue({}),
      },
      wallet: {
        upsert: mockFn().mockResolvedValue({}),
      },
      transaction: { create: mockFn().mockResolvedValue({}) },
      ledgerEntry: { create: mockFn().mockResolvedValue({}) },
      eventOutbox: { create: mockFn().mockResolvedValue({}) },
    };

    const prisma: PrismaStub = {
      earnLot: {
        findMany: mockFn<EarnLotRecord[]>().mockResolvedValue([pendingLot]),
      },
      $transaction: mockFn<
        Promise<unknown>,
        [(tx: TxStub) => Promise<unknown>]
      >().mockImplementation(async (fn) => await fn(tx)),
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };

    const w = new EarnActivationWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      new AppConfigService(),
    );
    // @ts-expect-error private
    await w.tick();

    expect(tx.earnLot.findUnique).toHaveBeenCalledWith({ where: { id: 'L1' } });
    expect(tx.earnLot.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: {
        status: 'ACTIVE',
        earnedAt: maturedAt,
        activationAttempts: 0,
        activationLastError: null,
      },
    });
    expect(tx.wallet.upsert).toHaveBeenCalledWith(
      objectContaining({
        update: { balance: { increment: 70 } },
      }),
    );
    expect(tx.transaction.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          merchantId: 'M1',
          customerId: 'C1',
          type: 'EARN',
          amount: 70,
        }),
      }),
    );
    expect(tx.eventOutbox.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          eventType: 'loyalty.earn.activated',
          payload: objectContaining({ outletId: null }),
        }),
      }),
    );
  });

  it('skips if lot is not matured yet', async () => {
    process.env.WORKERS_ENABLED = '1';

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const future = new Date(Date.now() + 60_000);
    const lot: EarnLotRecord = {
      id: 'L2',
      merchantId: 'M1',
      customerId: 'C1',
      points: 50,
      maturesAt: future,
      status: 'PENDING',
    };

    const tx: TxStub = {
      earnLot: {
        findUnique: mockFn<
          EarnLotRecord | null,
          [{ where: { id: string } }]
        >().mockResolvedValue({ ...lot }),
        update: mockFn(),
      },
      wallet: {
        findFirst: mockFn(),
        findUnique: mockFn(),
        update: mockFn(),
      },
      transaction: { create: mockFn() },
      eventOutbox: { create: mockFn() },
    };

    const prisma: PrismaStub = {
      earnLot: { findMany: mockFn<EarnLotRecord[]>().mockResolvedValue([lot]) },
      $transaction: mockFn<
        Promise<unknown>,
        [(tx: TxStub) => Promise<unknown>]
      >().mockImplementation(async (fn) => await fn(tx)),
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };

    const w = new EarnActivationWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      new AppConfigService(),
    );
    // @ts-expect-error private
    await w.tick();

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.eventOutbox.create).not.toHaveBeenCalled();
  });
});
