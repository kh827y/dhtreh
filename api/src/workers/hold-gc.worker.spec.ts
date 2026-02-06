import { HoldGcWorker } from './hold-gc.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { MetricsService } from '../core/metrics/metrics.service';
import { AppConfigService } from '../core/config/app-config.service';
import * as lockUtil from '../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  hold: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type MetricsStub = {
  inc: MockFn;
  setGauge: MockFn;
};

type WorkerPrivate = {
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateWorker = (worker: HoldGcWorker) =>
  worker as unknown as WorkerPrivate;

describe('HoldGcWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('cancels expired holds and records metrics', async () => {
    const prisma: PrismaStub = {
      hold: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'h1' },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };
    const worker = new HoldGcWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await asPrivateWorker(worker).tick();

    expect(prisma.hold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'h1' },
      }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('loyalty_hold_gc_canceled_total');
  });

  it('does nothing when lock is not acquired', async () => {
    const prisma: PrismaStub = {
      hold: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'h1' },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };
    const worker = new HoldGcWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await asPrivateWorker(worker).tick();

    expect(prisma.hold.findMany).not.toHaveBeenCalled();
    expect(prisma.hold.update).not.toHaveBeenCalled();
  });
});
