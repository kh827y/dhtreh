import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

// E2E: Verify level bonuses affect both quote and commit flows

describe('Levels bonuses with commit (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: new Map<string, any>(),
    txns: [] as Array<{ merchantId: string; customerId: string; type: 'EARN'|'REDEEM'; amount: number; createdAt: Date }>,
    holds: [] as any[],
    wallets: new Map<string, { id: string; balance: number }>(),
    receipts: [] as any[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) => fn(prismaMock),
    merchant: { upsert: jest.fn(async () => ({})) },
    merchantSettings: { findUnique: async (args: any) => state.settings.get(args.where.merchantId) || null },
    customer: {
      findUnique: async (_args: any) => null,
      create: async (args: any) => ({ id: args?.data?.id || 'C1' }),
    },
    transaction: {
      findMany: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && (!args.where.type || t.type === args.where.type) && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)),
      count: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)).length,
      create: async (args: any) => { state.txns.push({ merchantId: args.data.merchantId, customerId: args.data.customerId, type: args.data.type, amount: args.data.amount, createdAt: new Date() } as any); return { id: 'T1', ...args.data }; },
    },
    device: { findUnique: async () => null },
    hold: {
      findUnique: async (args: any) => state.holds.find(h => h.id === args.where.id) || null,
      create: async (args: any) => { const h = { id: 'H1', ...args.data }; state.holds.push(h); return h; },
      update: async (args: any) => { const i = state.holds.findIndex(h => h.id === args.where.id); if (i>=0) { state.holds[i] = { ...state.holds[i], ...args.data }; return state.holds[i]; } return null; },
    },
    wallet: {
      findFirst: async (args: any) => {
        const key = `${args.where.merchantId}|${args.where.customerId}`;
        const w = state.wallets.get(key) || { id: 'W1', balance: 1000 };
        state.wallets.set(key, w);
        return { id: w.id, balance: w.balance, type: 'POINTS' };
      },
      findUnique: async (args: any) => {
        for (const [k, v] of state.wallets.entries()) if (v.id === args.where.id) return { id: v.id, balance: v.balance } as any;
        return null;
      },
      create: async (args: any) => { const key = `${args.data.merchantId}|${args.data.customerId}`; const w = { id: 'W1', balance: 0 }; state.wallets.set(key, w); return { id: w.id, balance: w.balance, type: 'POINTS' }; },
      update: async (args: any) => {
        for (const [k, v] of state.wallets.entries()) if (v.id === args.where.id) { v.balance = args.data.balance; return { id: v.id, balance: v.balance }; }
        throw new Error('wallet not found');
      },
    },
    receipt: {
      findUnique: async (_args: any) => null,
      create: async (args: any) => { const r = { id: 'R1', ...args.data }; state.receipts.push(r); return r; },
    },
    eventOutbox: {
      create: async () => ({ id: 'E1' }),
    },
  };

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    process.env.METRICS_DEFAULTS = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days*24*60*60*1000);

    state.settings.set('M-LVL', {
      merchantId: 'M-LVL',
      updatedAt: new Date(),
      rulesJson: {
        levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 500 }, { name: 'Gold', threshold: 1000 } ] },
        levelBenefits: {
          earnBpsBonusByLevel: { Base: 0, Silver: 200, Gold: 400 },
          redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000, Gold: 2000 },
        },
      },
    });

    // Seed EARN to reach Silver (600)
    state.txns.push({ merchantId: 'M-LVL', customerId: 'C1', type: 'EARN', amount: 300, createdAt: d(10) });
    state.txns.push({ merchantId: 'M-LVL', customerId: 'C1', type: 'EARN', amount: 300, createdAt: d(5) });
  });

  afterAll(async () => { await app.close(); });

  it('REDEEM: level bonus raises cap in quote and commit burns that amount', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-LVL', userToken: 'C1', mode: 'REDEEM', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(q.body.discountToApply).toBe(600);

    const c = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: q.body.holdId, orderId: 'O-CLVL-1' })
      .expect(201);
    expect(c.body.redeemApplied).toBe(600);
  });

  it('EARN: level bonus raises points in quote and commit applies that amount', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-LVL', userToken: 'C1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(q.body.pointsToEarn).toBe(70);

    const c = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: q.body.holdId, orderId: 'O-CLVL-2' })
      .expect(201);
    expect(c.body.earnApplied).toBe(70);
  });
});
