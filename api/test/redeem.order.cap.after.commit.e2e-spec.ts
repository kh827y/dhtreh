import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: REDEEM per-order cap after commit.
 * Base: redeemLimitBps=5000 on eligible 1000 => cap=500.
 * 1) Quote: cap 500 -> holdId
 * 2) Commit: creates receipt with redeemApplied=500
 * 3) Quote again for same orderId -> remainingByOrder=0 => canRedeem=false, discountToApply=0
 */
describe('REDEEM per-order cap after commit (e2e)', () => {
  let app: INestApplication;

  const state = {
    walletBal: 10000,
    holds: [] as any[],
    receipts: [] as any[],
    txns: [] as any[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) => fn(prismaMock),
    merchantSettings: {
      findUnique: async (args: any) => ({
        merchantId: args.where.merchantId,
        earnBps: 500,
        redeemLimitBps: 5000,
        updatedAt: new Date(),
        rulesJson: null,
      }),
    },
    merchant: { upsert: async () => ({}) },
    customer: {
      findUnique: async (args: any) => ({ id: args.where.id }),
      create: async (args: any) => ({ id: args.data.id }),
    },
    transaction: {
      findMany: async (_args: any) =>
        state.txns.filter((t: any) => t.type === 'REDEEM'),
      create: async (args: any) => {
        state.txns.push({ id: 'T1', ...args.data, createdAt: new Date() });
        return { id: 'T1' };
      },
    },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
      findUnique: async (_args: any) => ({
        id: 'W1',
        balance: state.walletBal,
      }),
      update: async (args: any) => {
        if (typeof args.data?.balance === 'number')
          state.walletBal = args.data.balance;
        return { id: 'W1', balance: state.walletBal };
      },
    },
    hold: {
      findUnique: async (args: any) =>
        state.holds.find((h) => h.id === args.where.id) || null,
      create: async (args: any) => {
        const h = { id: 'H1', ...args.data };
        state.holds.push(h);
        return h;
      },
      update: async (args: any) => {
        const i = state.holds.findIndex((h) => h.id === args.where.id);
        if (i >= 0) {
          state.holds[i] = { ...state.holds[i], ...args.data };
          return state.holds[i];
        }
        return null;
      },
    },
    receipt: {
      findUnique: async (args: any) =>
        state.receipts.find(
          (r) =>
            r.merchantId === args.where.merchantId_orderId.merchantId &&
            r.orderId === args.where.merchantId_orderId.orderId,
        ) || null,
      create: async (args: any) => {
        const r = { id: 'R1', ...args.data };
        state.receipts.push(r);
        return r;
      },
    },
    eventOutbox: { create: async (_args: any) => ({ id: 'E1' }) },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Quote -> Commit -> Quote same order returns 0', async () => {
    state.walletBal = 10000;
    // First quote
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: 'M-OCAP-C',
        userToken: 'C1',
        mode: 'REDEEM',
        orderId: 'ORD-C1',
        total: 1000,
        eligibleTotal: 1000,
      })
      .expect(201);
    expect(q1.body.discountToApply).toBe(500);
    expect(q1.body.holdId).toBeTruthy();

    // Commit
    const c = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: q1.body.holdId, orderId: 'ORD-C1' })
      .expect(201);
    expect(c.body.redeemApplied).toBe(500);

    // Second quote for same order -> remaining is 0
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: 'M-OCAP-C',
        userToken: 'C1',
        mode: 'REDEEM',
        orderId: 'ORD-C1',
        total: 1000,
        eligibleTotal: 1000,
      })
      .expect(201);
    expect(q2.body.canRedeem).toBe(false);
    expect(q2.body.discountToApply).toBe(0);
  });
});
