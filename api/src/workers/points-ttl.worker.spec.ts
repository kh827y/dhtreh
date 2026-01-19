import { PointsTtlWorker } from './points-ttl.worker';
import * as lockUtil from '../shared/pg-lock.util';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MerchantSettingsRecord = { merchantId: string; pointsTtlDays: number };
type EarnLotRecord = {
  id: string;
  merchantId: string;
  customerId: string;
  points: number;
  consumedPoints: number;
  earnedAt: Date;
  orderId: string;
  status: string;
};
type WalletRecord = {
  id: string;
  merchantId: string;
  customerId: string;
  balance: number;
};
type TransactionGroup = { customerId: string | null; _sum: { amount: number } };
type EventPayload = {
  eventType: string;
  payload?: {
    customerId?: string;
    expiringPoints?: number;
    mode?: string;
    tentativeExpire?: number;
  };
};
type EventOutboxCreateArgs = { data: EventPayload };
type PrismaStub = {
  merchantSettings: {
    findMany: MockFn<Promise<MerchantSettingsRecord[]>, [unknown?]>;
  };
  earnLot?: { findMany: MockFn<Promise<EarnLotRecord[]>, [unknown?]> };
  wallet?: { findMany: MockFn<Promise<WalletRecord[]>, [unknown?]> };
  transaction?: { groupBy: MockFn<Promise<TransactionGroup[]>, [unknown?]> };
  eventOutbox: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    create: MockFn<EventPayload, [EventOutboxCreateArgs]>;
  };
};
type MetricsStub = { setGauge: MockFn };
type WorkerPrivate = { tick: () => Promise<void> };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateWorker = (worker: PointsTtlWorker) =>
  worker as unknown as WorkerPrivate;

describe('PointsTtlWorker (unit)', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('tick emits preview events using lots when EARN_LOTS_FEATURE=1', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const created: EventPayload[] = [];
    const prisma: PrismaStub = {
      merchantSettings: {
        findMany: mockFn<
          Promise<MerchantSettingsRecord[]>,
          [unknown?]
        >().mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: {
        findMany: mockFn<Promise<EarnLotRecord[]>, [unknown?]>()
          .mockResolvedValueOnce([
            {
              id: 'L1',
              merchantId: 'M1',
              customerId: 'C1',
              points: 100,
              consumedPoints: 20,
              earnedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
              orderId: 'order-1',
              status: 'ACTIVE',
            },
            {
              id: 'L2',
              merchantId: 'M1',
              customerId: 'C1',
              points: 50,
              consumedPoints: 0,
              earnedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
              orderId: 'order-2',
              status: 'ACTIVE',
            },
            {
              id: 'L3',
              merchantId: 'M1',
              customerId: 'C2',
              points: 30,
              consumedPoints: 10,
              earnedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
              orderId: 'order-3',
              status: 'ACTIVE',
            },
          ])
          .mockResolvedValueOnce([]),
      },
      eventOutbox: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
        create: mockFn<
          EventPayload,
          [EventOutboxCreateArgs]
        >().mockImplementation((args) => {
          created.push(args.data);
          return args.data;
        }),
      },
    };
    const metrics: MetricsStub = { setGauge: mockFn() };

    const w = new PointsTtlWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );
    // Вручную вызовем приватный tick
    const workerPrivate = asPrivateWorker(w);
    await workerPrivate.tick();

    expect(prisma.merchantSettings.findMany).toHaveBeenCalled();
    expect(created.length).toBeGreaterThan(0);
    const forC1 = created.find(
      (e) =>
        e.eventType === 'loyalty.points_ttl.preview' &&
        e.payload?.customerId === 'C1',
    );
    expect(forC1).toBeTruthy();
    if (!forC1?.payload) {
      throw new Error('Expected preview payload for customer C1');
    }
    // C1: remain = (100-20) + (50-0) = 130
    expect(forC1.payload.expiringPoints).toBe(130);
  });

  it('tick emits approx preview when lots disabled', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    delete process.env.EARN_LOTS_FEATURE;

    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const created: EventPayload[] = [];
    const prisma: PrismaStub = {
      merchantSettings: {
        findMany: mockFn<
          Promise<MerchantSettingsRecord[]>,
          [unknown?]
        >().mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      wallet: {
        findMany: mockFn<
          Promise<WalletRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          { id: 'W1', merchantId: 'M1', customerId: 'C1', balance: 100 },
        ]),
      },
      transaction: {
        groupBy: mockFn<
          Promise<TransactionGroup[]>,
          [unknown?]
        >().mockResolvedValue([{ customerId: 'C1', _sum: { amount: 30 } }]),
      },
      eventOutbox: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
        create: mockFn<
          EventPayload,
          [EventOutboxCreateArgs]
        >().mockImplementation((args) => {
          created.push(args.data);
          return args.data;
        }),
      },
    };
    const metrics: MetricsStub = { setGauge: mockFn() };
    const w = new PointsTtlWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
    );
    const workerPrivate = asPrivateWorker(w);
    await workerPrivate.tick();

    expect(created.length).toBeGreaterThan(0);
    const ev = created.find(
      (e) => e.eventType === 'loyalty.points_ttl.preview',
    );
    expect(ev).toBeTruthy();
    if (!ev?.payload) {
      throw new Error('Expected preview payload');
    }
    expect(ev.payload.mode).toBe('approx');
    // tentativeExpire = balance - recentEarn = 70
    expect(ev.payload.tentativeExpire).toBe(70);
  });
});
