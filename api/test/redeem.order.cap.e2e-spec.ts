import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: REDEEM per-order cap — повторные quote с одним orderId не превышают лимит на заказ.
 * Base: redeemLimitBps=5000 на eligible 1000 => лимит 500.
 * 1) Первый quote: 500
 * 2) Считаем, что по заказу уже списано 200 (receipt.redeemApplied=200) => remainingByOrder=300.
 */
describe('REDEEM per-order cap (e2e)', () => {
  let app: INestApplication;

  const state = { walletBal: 10000 } as any;

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: { findUnique: async (args: any) => ({ merchantId: args.where.merchantId, earnBps: 500, redeemLimitBps: 5000, updatedAt: new Date(), rulesJson: null }) },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    transaction: { findMany: async (_args: any) => [] },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
    },
    hold: { create: async (args: any) => ({ ...args.data, id: 'H1' }) },
    receipt: { findUnique: async (_args: any) => null },
    eventOutbox: { create: async (_args: any) => ({}) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      merchant: { upsert: async ()=>({}) },
      wallet: {
        findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
      },
      hold: { create: async (args: any) => ({ ...args.data, id: 'H1' }) },
      eventOutbox: { create: async (_args: any) => ({}) },
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('First quote returns full cap 500', async () => {
    state.walletBal = 10000;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-OCAP', userToken: 'C1', mode: 'REDEEM', orderId: 'ORD-1', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res.body.canRedeem).toBe(true);
    expect(res.body.discountToApply).toBe(500);
  });

  it('Second quote on same order with prior redeemApplied=200 returns remaining 300', async () => {
    jest.spyOn(prismaMock.receipt, 'findUnique').mockResolvedValueOnce({ merchantId: 'M-OCAP', orderId: 'ORD-1', total: 1000, eligibleTotal: 1000, redeemApplied: 200 });
    const res2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-OCAP', userToken: 'C1', mode: 'REDEEM', orderId: 'ORD-1', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res2.body.canRedeem).toBe(true);
    expect(res2.body.discountToApply).toBe(300);
  });

  it('Wallet-limited: when wallet=200 and remaining=300, applied=200', async () => {
    state.walletBal = 200;
    jest.spyOn(prismaMock.receipt, 'findUnique').mockResolvedValueOnce({ merchantId: 'M-OCAP', orderId: 'ORD-1', total: 1000, eligibleTotal: 1000, redeemApplied: 300 });
    const res3 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-OCAP', userToken: 'C1', mode: 'REDEEM', orderId: 'ORD-1', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res3.body.canRedeem).toBe(true);
    expect(res3.body.discountToApply).toBe(200);
  });
});
