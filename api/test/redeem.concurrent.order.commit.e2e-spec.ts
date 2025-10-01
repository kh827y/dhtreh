import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: Конкурентные коммиты по одному orderId.
 * Два quote создают два hold; первый commit создаёт чек и списывает баллы,
 * второй commit возвращает alreadyCommitted=true и не трогает баланс повторно.
 */
describe('REDEEM concurrent commit per-order idempotency (e2e)', () => {
  let app: INestApplication;

  const state = {
    walletBal: 1000,
    holds: [] as any[],
    receipts: [] as any[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    $transaction: async (fn: (tx: any)=>any) => fn({
      wallet: {
        findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        create: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
      },
      transaction: { create: async (_args: any) => ({ id: 'T1' }) },
      merchant: { upsert: async ()=>({}) },
      hold: {
        create: async (args: any) => { const h = { id: args.data.id || 'H'+(state.holds.length+1), ...args.data }; state.holds.push(h); return h; },
        findUnique: async (args: any) => state.holds.find(h=>h.id===args.where.id) || null,
        update: async (args: any) => { const i = state.holds.findIndex(h=>h.id===args.where.id); if (i>=0) { state.holds[i] = { ...state.holds[i], ...args.data }; return state.holds[i]; } return null; },
      },
      receipt: {
        findUnique: async (args: any) => state.receipts.find(r=>r.merchantId===args.where.merchantId_orderId.merchantId && r.orderId===args.where.merchantId_orderId.orderId) || null,
        create: async (args: any) => { const r = { id: 'R1', ...args.data }; state.receipts.push(r); return r; },
      },
      eventOutbox: { create: async ()=>({}) },
    }),
    merchant: { upsert: async ()=>({}) },
    merchantSettings: { findUnique: async (args: any) => ({ merchantId: args.where.merchantId, earnBps: 500, redeemLimitBps: 5000, updatedAt: new Date(), rulesJson: null }) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      create: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
    },
    transaction: { create: async (_args: any) => ({ id: 'T1' }) },
    hold: {
      create: async (args: any) => { const h = { id: args.data.id || 'H'+(state.holds.length+1), ...args.data }; state.holds.push(h); return h; },
      findUnique: async (args: any) => state.holds.find(h=>h.id===args.where.id) || null,
      update: async (args: any) => { const i = state.holds.findIndex(h=>h.id===args.where.id); if (i>=0) { state.holds[i] = { ...state.holds[i], ...args.data }; return state.holds[i]; } return null; },
    },
    receipt: {
      findUnique: async (args: any) => state.receipts.find(r=>r.merchantId===args.where.merchantId_orderId.merchantId && r.orderId===args.where.merchantId_orderId.orderId) || null,
      create: async (args: any) => { const r = { id: 'R1', ...args.data }; state.receipts.push(r); return r; },
    },
    eventOutbox: { create: async ()=>({}) },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('Second commit is idempotent and does not double-spend', async () => {
    state.walletBal = 1000; state.holds = []; state.receipts = [];

    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-CC', userToken: 'C1', mode: 'REDEEM', orderId: 'ORD-X', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-CC', userToken: 'C1', mode: 'REDEEM', orderId: 'ORD-X', total: 1000, eligibleTotal: 1000 })
      .expect(201);

    // оба hold рассчитаны по 500
    expect(q1.body.discountToApply).toBe(500);
    expect(q2.body.discountToApply).toBe(500);

    // коммитим первый -> спишет 500
    const c1 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: q1.body.holdId, orderId: 'ORD-X' })
      .expect(201);
    expect(c1.body.redeemApplied).toBe(500);
    expect(state.walletBal).toBe(500);

    // коммитим второй -> alreadyCommitted, баланс не меняется
    const c2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: q2.body.holdId, orderId: 'ORD-X' })
      .expect(201);
    expect(c2.body.alreadyCommitted).toBe(true);
    expect(state.walletBal).toBe(500);
  });
});
