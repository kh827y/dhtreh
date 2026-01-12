import { PointsTtlWorker } from './points-ttl.worker';

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

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const created: any[] = [];
    const prisma: any = {
      merchantSettings: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      earnLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            merchantId: 'M1',
            customerId: 'C1',
            points: 100,
            consumedPoints: 20,
            earnedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
            orderId: 'order-1',
            status: 'ACTIVE',
          },
          {
            merchantId: 'M1',
            customerId: 'C1',
            points: 50,
            consumedPoints: 0,
            earnedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
            orderId: 'order-2',
            status: 'ACTIVE',
          },
          {
            merchantId: 'M1',
            customerId: 'C2',
            points: 30,
            consumedPoints: 10,
            earnedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
            orderId: 'order-3',
            status: 'ACTIVE',
          },
        ]),
      },
      eventOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: any) => {
          created.push(args.data);
          return args.data;
        }),
      },
    };
    const metrics: any = { setGauge: jest.fn() };

    const w = new PointsTtlWorker(prisma, metrics);
    // Вручную вызовем приватный tick
    // @ts-ignore
    await w.tick();

    expect(prisma.merchantSettings.findMany).toHaveBeenCalled();
    expect(created.length).toBeGreaterThan(0);
    const forC1 = created.find(
      (e) =>
        e.eventType === 'loyalty.points_ttl.preview' &&
        e.payload?.customerId === 'C1',
    );
    expect(forC1).toBeTruthy();
    // C1: remain = (100-20) + (50-0) = 130
    expect(forC1.payload.expiringPoints).toBe(130);
  });

  it('tick emits approx preview when lots disabled', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    delete process.env.EARN_LOTS_FEATURE;

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const created: any[] = [];
    const prisma: any = {
      merchantSettings: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ merchantId: 'M1', pointsTtlDays: 30 }]),
      },
      wallet: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'W1', merchantId: 'M1', customerId: 'C1', balance: 100 },
          ]),
      },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
      },
      eventOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: any) => {
          created.push(args.data);
          return args.data;
        }),
      },
    };
    const metrics: any = { setGauge: jest.fn() };
    const w = new PointsTtlWorker(prisma, metrics);
    // @ts-ignore
    await w.tick();

    expect(created.length).toBeGreaterThan(0);
    const ev = created.find(
      (e) => e.eventType === 'loyalty.points_ttl.preview',
    );
    expect(ev).toBeTruthy();
    expect(ev.payload.mode).toBe('approx');
    // tentativeExpire = balance - recentEarn = 70
    expect(ev.payload.tentativeExpire).toBe(70);
  });
});
