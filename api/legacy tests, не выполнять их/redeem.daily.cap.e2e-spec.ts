import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: REDEEM daily cap — лимит за последние 24 часа ограничивает списание.
 * Case A: dailyCap=700, уже списано 400 → dailyRedeemLeft=300 → применится min(500 by bps, 300 daily, wallet=10k) = 300.
 * Case B: уже списано 700 → dailyRedeemLeft=0 → отказ.
 */
describe('REDEEM daily cap (e2e)', () => {
  let app: INestApplication;
  const state = { walletBal: 10000, used: 400 } as any;

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchantSettings: {
      findUnique: async (args: any) => ({
        merchantId: args.where.merchantId,
        earnBps: 500,
        redeemLimitBps: 5000,
        redeemDailyCap: 700,
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
      findMany: async (_args: any) => {
        // Вернём REDEEM транзакции за последние 24ч с суммой списания state.used
        if (state.used <= 0) return [];
        const parts = [] as any[];
        let rem = state.used;
        while (rem > 0) {
          const chunk = Math.min(rem, 250);
          parts.push({ amount: -chunk, type: 'REDEEM', createdAt: new Date() });
          rem -= chunk;
        }
        return parts;
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
    hold: { create: async (args: any) => ({ ...args.data, id: 'H1' }) },
    eventOutbox: { create: async (_args: any) => ({}) },
    $transaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        merchant: { upsert: async () => ({}) },
        wallet: {
          findFirst: async (_args: any) => ({
            id: 'W1',
            balance: state.walletBal,
          }),
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
        hold: { create: async (args: any) => ({ ...args.data, id: 'H1' }) },
        eventOutbox: { create: async (_args: any) => ({}) },
      }),
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

  it('Daily cap limits redeem to 300 when used=400 and limit=700', async () => {
    state.walletBal = 10000;
    state.used = 400;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: 'M-DCAP',
        userToken: 'C1',
        mode: 'REDEEM',
        orderId: 'ORD-1',
        total: 1000,
        eligibleTotal: 1000,
      })
      .expect(201);
    expect(res.body.canRedeem).toBe(true);
    expect(res.body.discountToApply).toBe(300);
  });

  it('Daily cap exhausted -> deny redeem', async () => {
    state.walletBal = 10000;
    state.used = 700;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({
        merchantId: 'M-DCAP',
        userToken: 'C1',
        mode: 'REDEEM',
        orderId: 'ORD-2',
        total: 1000,
        eligibleTotal: 1000,
      })
      .expect(201);
    expect(res.body.canRedeem).toBe(false);
    expect(res.body.discountToApply).toBe(0);
  });
});
