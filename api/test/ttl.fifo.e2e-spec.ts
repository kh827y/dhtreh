import { PointsBurnWorker } from './../src/points-burn.worker';

describe('TTL FIFO burn with multiple ACTIVE lots (e2e-like, mock Prisma)', () => {
  const now = Date.now();
  const d = (days: number) => new Date(now - days*24*60*60*1000);

  const state = {
    lots: [
      { id: 'L1', merchantId: 'M1', customerId: 'C1', points: 100, consumedPoints: 20, earnedAt: d(40), status: 'ACTIVE' }, // remain 80
      { id: 'L2', merchantId: 'M1', customerId: 'C1', points: 50,  consumedPoints: 0,  earnedAt: d(35), status: 'ACTIVE' }, // remain 50
    ] as any[],
    wallet: { id: 'W1', merchantId: 'M1', customerId: 'C1', type: 'POINTS', balance: 100 },
    events: [] as any[],
    txns: [] as any[],
  };

  const mkTx = () => ({
    wallet: {
      findFirst: jest.fn(async () => ({ ...state.wallet })),
      findUnique: jest.fn(async (args: any) => ({ id: state.wallet.id, balance: state.wallet.balance })),
      update: jest.fn(async (args: any) => { if (args?.data?.balance != null) state.wallet.balance = args.data.balance; return { ...state.wallet }; }),
    },
    earnLot: {
      findMany: jest.fn(async (args: any) => {
        let arr = state.lots.filter(l => l.merchantId === args.where.merchantId && l.customerId === args.where.customerId);
        if (args.where.earnedAt?.lt) arr = arr.filter(l => l.earnedAt < args.where.earnedAt.lt);
        if (args.orderBy?.earnedAt === 'asc') arr = arr.sort((a,b)=> a.earnedAt.getTime() - b.earnedAt.getTime());
        return arr.map(x=>({ ...x }));
      }),
      update: jest.fn(async (args: any) => {
        const i = state.lots.findIndex(l => l.id === args.where.id);
        if (i >= 0) state.lots[i] = { ...state.lots[i], ...args.data };
        return state.lots[i];
      }),
    },
    transaction: { create: jest.fn(async (args: any) => { state.txns.push(args.data); return args.data; }) },
    ledgerEntry: { create: jest.fn(async ()=>({})) },
    eventOutbox: { create: jest.fn(async (args: any) => { state.events.push(args.data); return args.data; }) },
  });

  const prisma: any = {
    merchantSettings: { findMany: jest.fn(async () => [{ merchantId: 'M1', pointsTtlDays: 30 }]) },
    earnLot: { findMany: jest.fn(async (args: any) => {
      // initial selection by worker before $transaction
      let arr = state.lots.filter(l => l.merchantId === args.where.merchantId && l.status === 'ACTIVE');
      if (args.where.earnedAt?.lt) arr = arr.filter(l => l.earnedAt < args.where.earnedAt.lt);
      return arr.map(x=>({ ...x }));
    }) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn(mkTx()),
  };

  const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(now);
    const lockUtil = require('../src/pg-lock.util');
    jest.spyOn(lockUtil, 'pgTryAdvisoryLock').mockResolvedValue({ ok: true, key: [1,2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
  });

  afterAll(() => { jest.useRealTimers(); });

  it('burns FIFO and updates consumedPoints and wallet', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';

    const w = new PointsBurnWorker(prisma as any, metrics);
    // @ts-ignore private
    await (w as any).tick();

    // Burn amount = min(wallet.balance=100, remain=130) = 100
    expect(state.wallet.balance).toBe(0);
    const l1 = state.lots.find(l => l.id === 'L1')!; // had remain 80 -> fully consumed
    const l2 = state.lots.find(l => l.id === 'L2')!; // consume next 20
    expect(l1.consumedPoints).toBe(100);
    expect(l2.consumedPoints).toBe(20);

    const burned = state.events.find(e => e.eventType === 'loyalty.points_ttl.burned');
    expect(burned).toBeTruthy();
    expect(burned.payload.amount).toBe(100);
  });
});
