import { EarnActivationWorker } from './../src/earn-activation.worker';
import { PointsTtlWorker } from './../src/points-ttl.worker';
import { PointsBurnWorker } from './../src/points-burn.worker';

describe('TTL full flow (lots + PENDING -> activation -> preview -> burn)', () => {
  const now = Date.now();
  const d = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);
  const createdEvents: any[] = [];

  const state = {
    lots: [
      // matured in the past (40 days ago), will be ACTIVATED and immediately expired by TTL(30)
      {
        id: 'L1',
        merchantId: 'M1',
        customerId: 'C1',
        points: 100,
        consumedPoints: 0,
        status: 'PENDING',
        maturesAt: d(40),
        earnedAt: null as any,
        orderId: 'O1',
        outletId: null,
        staffId: null,
      },
    ] as any[],
    wallet: {
      id: 'W1',
      merchantId: 'M1',
      customerId: 'C1',
      type: 'POINTS',
      balance: 0,
    },
  };

  const mkTx = () => ({
    earnLot: {
      findUnique: jest.fn(
        async (args: any) =>
          state.lots.find((l) => l.id === args.where.id) || null,
      ),
      findMany: jest.fn(async (args: any) => {
        let arr = state.lots.filter(
          (l) => l.merchantId === args.where.merchantId,
        );
        if (args.where.status)
          arr = arr.filter((l) => l.status === args.where.status);
        if (args.where.earnedAt?.lt)
          arr = arr.filter(
            (l) => l.earnedAt && l.earnedAt < args.where.earnedAt.lt,
          );
        if (args.where.consumedPoints?.gt != null)
          arr = arr.filter(
            (l) => (l.consumedPoints || 0) > args.where.consumedPoints.gt,
          );
        if (args.orderBy?.earnedAt === 'asc')
          arr = arr.sort(
            (a, b) =>
              (a.earnedAt?.getTime() || 0) - (b.earnedAt?.getTime() || 0),
          );
        if (args.orderBy?.earnedAt === 'desc')
          arr = arr.sort(
            (a, b) =>
              (b.earnedAt?.getTime() || 0) - (a.earnedAt?.getTime() || 0),
          );
        if (args.orderBy?.maturesAt === 'asc')
          arr = arr.sort(
            (a, b) =>
              (a.maturesAt?.getTime() || 0) - (b.maturesAt?.getTime() || 0),
          );
        if (args.take) arr = arr.slice(0, args.take);
        return arr.map((x) => ({ ...x }));
      }),
      update: jest.fn(async (args: any) => {
        const i = state.lots.findIndex((l) => l.id === args.where.id);
        if (i >= 0) state.lots[i] = { ...state.lots[i], ...args.data };
        return state.lots[i];
      }),
    },
    wallet: {
      findFirst: jest.fn(async () => ({ ...state.wallet })),
      findUnique: jest.fn(async () => ({
        id: state.wallet.id,
        balance: state.wallet.balance,
      })),
      update: jest.fn(async (args: any) => {
        if (args.data?.balance != null)
          state.wallet.balance = args.data.balance;
        return { ...state.wallet };
      }),
    },
    transaction: { create: jest.fn(async (args: any) => args.data) },
    ledgerEntry: { create: jest.fn(async () => ({})) },
    eventOutbox: {
      create: jest.fn(async (args: any) => {
        createdEvents.push(args.data);
        return args.data;
      }),
    },
  });

  const prisma: any = {
    merchantSettings: {
      findMany: jest.fn(async (_args: any) => [
        { merchantId: 'M1', pointsTtlDays: 30 },
      ]),
    },
    earnLot: {
      // Used by EarnActivationWorker (PENDING, maturesAt<=now) and PointsTtlWorker (ACTIVE, earnedAt<cutoff)
      findMany: jest.fn(async (args: any) => {
        const where = args?.where || {};
        let arr = state.lots.filter((l) => true);
        if (where.status) arr = arr.filter((l) => l.status === where.status);
        if (where.maturesAt?.lte)
          arr = arr.filter(
            (l) =>
              (l.maturesAt || new Date(8640000000000000)) <=
              where.maturesAt.lte,
          );
        if (where.earnedAt?.lt)
          arr = arr.filter(
            (l) => (l.earnedAt || new Date(0)) < where.earnedAt.lt,
          );
        if (args?.orderBy?.maturesAt === 'asc')
          arr = arr.sort(
            (a: any, b: any) =>
              (a.maturesAt?.getTime() || 0) - (b.maturesAt?.getTime() || 0),
          );
        if (args?.orderBy?.earnedAt === 'asc')
          arr = arr.sort(
            (a: any, b: any) =>
              (a.earnedAt?.getTime() || 0) - (b.earnedAt?.getTime() || 0),
          );
        if (args?.take) arr = arr.slice(0, args.take);
        return arr.map((x) => ({ ...x }));
      }),
    },
    eventOutbox: {
      create: jest.fn(async (args: any) => {
        createdEvents.push(args.data);
        return args.data;
      }),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(mkTx()),
  };

  const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(now);
    // Mock advisory locks
    const lockUtil = require('../src/pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('activates PENDING lot -> creates EARN and wallet increases', async () => {
    process.env.WORKERS_ENABLED = '1';
    const w = new EarnActivationWorker(prisma, metrics);
    // @ts-ignore private
    await (w as any).tick();

    const lot = state.lots[0];
    expect(lot.status).toBe('ACTIVE');
    expect(lot.earnedAt instanceof Date).toBe(true);
    expect(state.wallet.balance).toBe(100);
  });

  it('TTL preview emits expiringPoints for ACTIVE lot older than cutoff', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    const w = new PointsTtlWorker(prisma, metrics);
    // @ts-ignore private
    await (w as any).tick();

    const ev = createdEvents.find(
      (e) => e.eventType === 'loyalty.points_ttl.preview',
    );
    expect(ev).toBeTruthy();
    expect(ev.payload.merchantId).toBe('M1');
    expect(ev.payload.customerId).toBe('C1');
    expect(ev.payload.expiringPoints).toBe(100);
  });

  it('TTL burn consumes lots and reduces wallet balance', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    const w = new PointsBurnWorker(prisma, metrics);
    // @ts-ignore private
    await (w as any).tick();

    // After burn, wallet goes to 0 (min(balance=100, remain=100))
    expect(state.wallet.balance).toBe(0);
    // Events include burned
    const burned = createdEvents.find(
      (e) => e.eventType === 'loyalty.points_ttl.burned',
    );
    expect(burned).toBeTruthy();
    expect(burned.payload.amount).toBe(100);
  });
});
