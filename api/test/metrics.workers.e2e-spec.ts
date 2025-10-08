import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PointsTtlWorker } from '../src/points-ttl.worker';
import { PointsBurnWorker } from '../src/points-burn.worker';

/**
 * E2E: verify metrics output after worker ticks (preview + burn).
 */
describe('Metrics via /metrics after workers (e2e)', () => {
  let app: INestApplication;
  let ttl: PointsTtlWorker;
  let burn: PointsBurnWorker;

  const now = Date.now();
  const d = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

  const state = {
    lots: [
      {
        id: 'L1',
        merchantId: 'M-MET',
        customerId: 'C1',
        points: 100,
        consumedPoints: 0,
        earnedAt: d(40),
        status: 'ACTIVE',
      },
      {
        id: 'L2',
        merchantId: 'M-MET',
        customerId: 'C2',
        points: 50,
        consumedPoints: 10,
        earnedAt: d(50),
        status: 'ACTIVE',
      },
    ] as any[],
    wallet: new Map<
      string,
      {
        id: string;
        merchantId: string;
        customerId: string;
        type: 'POINTS';
        balance: number;
      }
    >(),
    events: [] as any[],
  };
  state.wallet.set('C1', {
    id: 'W1',
    merchantId: 'M-MET',
    customerId: 'C1',
    type: 'POINTS',
    balance: 80,
  });
  state.wallet.set('C2', {
    id: 'W2',
    merchantId: 'M-MET',
    customerId: 'C2',
    type: 'POINTS',
    balance: 40,
  });

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchantSettings: {
      findMany: async () => [{ merchantId: 'M-MET', pointsTtlDays: 30 }],
    },
    earnLot: {
      findMany: async (args: any) => {
        const w = args?.where || {};
        let arr = state.lots.filter(
          (l) =>
            (!w.merchantId || l.merchantId === w.merchantId) &&
            (!w.customerId || l.customerId === w.customerId),
        );
        if (w.status) arr = arr.filter((l) => l.status === w.status);
        if (w.earnedAt?.lt) arr = arr.filter((l) => l.earnedAt < w.earnedAt.lt);
        if (args?.orderBy?.earnedAt === 'asc')
          arr = arr.sort(
            (a: any, b: any) => a.earnedAt.getTime() - b.earnedAt.getTime(),
          );
        return arr.map((x) => ({ ...x }));
      },
    },
    wallet: {
      findMany: async (args: any) =>
        Array.from(state.wallet.values()).filter(
          (w) => w.merchantId === args.where.merchantId,
        ),
      findFirst: async (args: any) =>
        state.wallet.get(args.where.customerId) || null,
      findUnique: async (args: any) => ({
        id: args.where.id,
        balance:
          Array.from(state.wallet.values()).find((w) => w.id === args.where.id)
            ?.balance ?? 0,
      }),
      update: async (args: any) => {
        const w = Array.from(state.wallet.values()).find(
          (w) => w.id === args.where.id,
        );
        if (w && typeof args.data?.balance === 'number')
          w.balance = args.data.balance;
        return w;
      },
    },
    transaction: {
      aggregate: async (args: any) => ({ _sum: { amount: 0 } }),
      create: async (_args: any) => ({}),
    },
    ledgerEntry: { create: async (_args: any) => ({}) },
    eventOutbox: {
      create: async (args: any) => {
        state.events.push(args.data);
        return args.data;
      },
    },
    $transaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        ...prismaMock,
        earnLot: {
          ...prismaMock.earnLot,
          update: async (args: any) => {
            const i = state.lots.findIndex((l) => l.id === args.where.id);
            if (i >= 0) state.lots[i] = { ...state.lots[i], ...args.data };
            return state.lots[i];
          },
        },
        wallet: { ...prismaMock.wallet },
      }),
  };

  beforeAll(async () => {
    jest.useFakeTimers().setSystemTime(now);
    // Ensure workers acquire locks in tests
    const lockUtil = require('../src/pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    ttl = app.get(PointsTtlWorker);
    burn = app.get(PointsBurnWorker);
  });

  afterAll(async () => {
    await app.close();
    jest.useRealTimers();
  });

  it('updates metrics after ttl preview tick', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    process.env.EARN_LOTS_FEATURE = '1';
    await (ttl as any).tick();
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    // Gauge is exported with labels; we check name presence
    expect(res.text).toContain('loyalty_worker_last_tick_seconds');
  });

  it('updates burn metrics after burn tick', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';
    await (burn as any).tick();
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.text).toContain('loyalty_points_ttl_burned_total');
    expect(res.text).toContain('loyalty_points_ttl_burned_amount_total');
  });
});
