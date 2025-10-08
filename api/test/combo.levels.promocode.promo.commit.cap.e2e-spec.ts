import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PromosService } from '../src/promos/promos.service';

/**
 * E2E: Promo + Rules + Levels + Commit, затем повторный quote (per-order cap = 0).
 * Ожидание: eligible 1000 -> promo -50 -> 950; level bonus Silver +1000 bps → cap = 570.
 * Первый quote -> cap=570, commit применяет 570. Второй quote по тому же orderId -> 0.
 */
describe('Combo: Promo+Rules+Levels with Commit then repeat Quote (per-order cap) (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: {
      merchantId: 'M-ComboC',
      earnBps: 500,
      redeemLimitBps: 5000,
      updatedAt: new Date(),
      rulesJson: {
        levelsCfg: {
          periodDays: 365,
          metric: 'earn',
          levels: [
            { name: 'Base', threshold: 0 },
            { name: 'Silver', threshold: 100 },
          ],
        },
        levelBenefits: {
          earnBpsBonusByLevel: { Base: 0, Silver: 200 },
          redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000 },
        },
      },
    },
    walletBal: 10000,
    holds: [] as any[],
    receipts: [] as any[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchantSettings: {
      findUnique: async (args: any) =>
        args.where.merchantId === state.settings.merchantId
          ? state.settings
          : null,
    },
    merchant: { upsert: async () => ({}) },
    customer: {
      findUnique: async (args: any) => ({ id: args.where.id }),
      create: async (args: any) => ({ id: args.data.id }),
    },
    transaction: {
      // Sum EARN in period >= 100 to reach Silver
      findMany: async (_args: any) => [
        {
          id: 'T1',
          merchantId: state.settings.merchantId,
          customerId: 'C-Combo',
          type: 'EARN',
          amount: 120,
          createdAt: new Date(),
        },
      ],
      create: async (_args: any) => ({ id: 'T-REDEEM' }),
    },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      findUnique: async (_args: any) => ({
        id: 'W1',
        balance: state.walletBal,
      }),
      update: async (args: any) => {
        if (typeof args.data?.balance === 'number')
          state.walletBal = args.data.balance;
        return { id: 'W1', balance: state.walletBal };
      },
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
    },
    hold: {
      create: async (args: any) => {
        const h = {
          id: args.data.id || 'H' + (state.holds.length + 1),
          ...args.data,
        };
        state.holds.push(h);
        return h;
      },
      findUnique: async (args: any) =>
        state.holds.find((h) => h.id === args.where.id) || null,
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
    eventOutbox: { create: async (_args: any) => ({}) },
    $transaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        merchant: { upsert: async () => ({}) },
        wallet: {
          findFirst: async (_args: any) => ({
            id: 'W1',
            balance: state.walletBal,
          }),
          findUnique: async (_args: any) => ({
            id: 'W1',
            balance: state.walletBal,
          }),
          update: async (args: any) => {
            if (typeof args.data?.balance === 'number')
              state.walletBal = args.data.balance;
            return { id: 'W1', balance: state.walletBal };
          },
          create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
        },
        hold: {
          create: async (args: any) => {
            const h = {
              id: args.data.id || 'H' + (state.holds.length + 1),
              ...args.data,
            };
            state.holds.push(h);
            return h;
          },
          findUnique: async (args: any) =>
            state.holds.find((h) => h.id === args.where.id) || null,
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
        eventOutbox: { create: async (_args: any) => ({}) },
        transaction: { create: async (_args: any) => ({ id: 'T-REDEEM' }) },
      }),
  };

  const promosMock: Partial<PromosService> = {
    preview: async () =>
      ({ canApply: true, discount: 50, name: 'PROMO50' }) as any,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(PromosService)
      .useValue(promosMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Quote(570) -> Commit -> Repeat Quote same order -> 0', async () => {
    // First quote with promo+levels
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: state.settings.merchantId,
        userToken: 'C-Combo',
        mode: 'REDEEM',
        orderId: 'ORD-COMBO',
        total: 1000,
        eligibleTotal: 1000,
        promoCode: 'PROMO50',
      })
      .expect(201);
    expect(q.body.discountToApply).toBe(570);

    // Commit
    const c = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({
        merchantId: state.settings.merchantId,
        holdId: q.body.holdId,
        orderId: 'ORD-COMBO',
      })
      .expect(201);
    expect(c.body.redeemApplied).toBe(570);

    // Second quote for the same order → remaining 0
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: state.settings.merchantId,
        userToken: 'C-Combo',
        mode: 'REDEEM',
        orderId: 'ORD-COMBO',
        total: 1000,
        eligibleTotal: 1000,
        promoCode: 'PROMO50',
      })
      .expect(201);
    expect(q2.body.canRedeem).toBe(false);
    expect(q2.body.discountToApply).toBe(0);
  });
});
