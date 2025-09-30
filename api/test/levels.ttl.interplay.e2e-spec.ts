import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';
import { EarnActivationWorker } from './../src/earn-activation.worker';

/**
 * Levels x TTL interplay: metric=earn over period; activation of PENDING lot should
 * create EARN txn and thus push customer to Silver, affecting earn bonus in quote.
 */
describe('Levels x TTL interplay (e2e)', () => {
  let app: INestApplication;

  const now = Date.now();
  const d = (days: number) => new Date(now - days*24*60*60*1000);

  const state = {
    settings: new Map<string, any>(),
    lots: [] as any[],
    wallet: { id: 'W1', merchantId: 'M-L2', customerId: 'C-L2', type: 'POINTS', balance: 0 },
    txns: [] as Array<{ merchantId: string; customerId: string; type: 'EARN'|'REDEEM'; amount: number; createdAt: Date }>,
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),

    merchantSettings: {
      findUnique: async (args: any) => state.settings.get(args.where.merchantId) || null,
      findMany: async (_args: any) => Array.from(state.settings.values()),
    },
    customer: {
      findUnique: async (args: any) => ({ id: args.where.id }),
      create: async (args: any) => ({ id: args.data.id }),
    },
    merchant: {
      upsert: async (_args: any) => ({}),
    },
    hold: {
      create: async (args: any) => ({ ...args.data }),
      findUnique: async (_args: any) => null,
      update: async (_args: any) => ({}),
    },

    // Earn lots for activation and TTL workers
    earnLot: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        let arr = state.lots.filter(l => (!where.merchantId || l.merchantId === where.merchantId) && (!where.customerId || l.customerId === where.customerId));
        if (where.status) arr = arr.filter(l => l.status === where.status);
        if (where.maturesAt?.lte) arr = arr.filter(l => (l.maturesAt || new Date(8640000000000000)) <= where.maturesAt.lte);
        if (where.earnedAt?.lt) arr = arr.filter(l => (l.earnedAt || new Date(0)) < where.earnedAt.lt);
        if (args?.orderBy?.maturesAt === 'asc') arr = arr.sort((a:any,b:any)=>(a.maturesAt?.getTime()||0)-(b.maturesAt?.getTime()||0));
        if (args?.orderBy?.earnedAt === 'asc') arr = arr.sort((a:any,b:any)=>(a.earnedAt?.getTime()||0)-(b.earnedAt?.getTime()||0));
        if (args?.take) arr = arr.slice(0, args.take);
        return arr.map(x=>({ ...x }));
      },
      findUnique: async (args: any) => state.lots.find(l => l.id === args.where.id) || null,
      update: async (args: any) => { const i = state.lots.findIndex(l => l.id === args.where.id); if (i>=0) state.lots[i] = { ...state.lots[i], ...args.data }; return state.lots[i]; },
    },

    wallet: {
      findFirst: async (args: any) => ({ ...state.wallet }),
      findUnique: async (args: any) => ({ id: state.wallet.id, balance: state.wallet.balance }),
      update: async (args: any) => { if (args?.data?.balance != null) state.wallet.balance = args.data.balance; return { ...state.wallet }; },
    },

    transaction: {
      findMany: async (args: any) => {
        const w = args?.where || {};
        let arr = state.txns.filter(t => t.merchantId === w.merchantId && t.customerId === w.customerId);
        if (w.type) arr = arr.filter(t => String(t.type) === String(w.type));
        if (w.createdAt?.gte) arr = arr.filter(t => t.createdAt >= new Date(w.createdAt.gte));
        return arr.map(x=>({ ...x }));
      },
      create: async (args: any) => { state.txns.push({ merchantId: args.data.merchantId, customerId: args.data.customerId, type: args.data.type, amount: args.data.amount, createdAt: new Date() }); return { id: 'T1', ...args.data }; },
    },

    eventOutbox: { create: async (_args: any) => ({}) },

    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prismaMock),
  };

  beforeAll(async () => {
    jest.useFakeTimers().setSystemTime(now);
    const lockUtil = require('../src/pg-lock.util');
    jest.spyOn(lockUtil, 'pgTryAdvisoryLock').mockResolvedValue({ ok: true, key: [1,2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
    process.env.WORKERS_ENABLED = '1';

    // Merchant settings with levels metric by earn and low threshold for Silver (100)
    state.settings.set('M-L2', {
      merchantId: 'M-L2', updatedAt: new Date(), earnBps: 500, redeemLimitBps: 5000,
      rulesJson: {
        levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 100 } ] },
        levelBenefits: { earnBpsBonusByLevel: { Base: 0, Silver: 200 }, redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000 } },
      },
    });

    // PENDING lot that matured in the past with 120 points → after activation, we cross Silver threshold
    state.lots.push({ id: 'LOT-1', merchantId: 'M-L2', customerId: 'C-L2', points: 120, consumedPoints: 0, status: 'PENDING', maturesAt: d(2), earnedAt: null, orderId: 'O-L2-1', outletId: null, staffId: null });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Activate PENDING → ACTIVE and create EARN txn 120
    const act = new EarnActivationWorker(prismaMock as any, { inc: ()=>{}, setGauge: ()=>{} } as any);
    // @ts-ignore private
    await (act as any).tick();
  });

  afterAll(async () => { await app.close(); jest.useRealTimers(); });

  it('GET /levels reflects Silver after activation', async () => {
    const r = await request(app.getHttpServer()).get(`/levels/M-L2/C-L2`).expect(200);
    expect(r.body.current?.name).toBe('Silver');
  });

  it('Quote uses Silver bonus (700 bps => 70 points on 1000)', async () => {
    const q = await request(app.getHttpServer()).post('/loyalty/quote').send({ merchantId: 'M-L2', userToken: 'C-L2', mode: 'EARN', total: 1000, eligibleTotal: 1000 }).expect(201);
    expect(q.body.pointsToEarn).toBe(70);
  });
});
