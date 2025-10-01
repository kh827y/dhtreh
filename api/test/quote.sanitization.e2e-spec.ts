import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: Quote sanitization — отрицательные и нулевые значения total/eligibleTotal приводят к нулевым начислениям/списаниям.
 */
describe('Quote sanitization (e2e)', () => {
  let app: INestApplication;

  const state = { walletBal: 10000 } as any;

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: { findUnique: async (args: any) => ({ merchantId: args.where.merchantId, earnBps: 500, redeemLimitBps: 5000, updatedAt: new Date(), rulesJson: null }) },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
    },
    hold: {
      findUnique: async () => null,
      create: async (args: any) => ({ ...args.data, id: 'H1' })
    },
    eventOutbox: { create: async (_args: any) => ({}) },
    transaction: { findFirst: async ()=>null, findMany: async ()=>[], create: async ()=>({ id:'T1'}) },
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
      transaction: { create: async ()=>({ id:'T1'}) },
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

  it('EARN with negative eligibleTotal -> pointsToEarn=0, canEarn=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-SAN', userToken: 'C1', mode: 'EARN', orderId: 'O-NEG', total: -100, eligibleTotal: -50 })
      .expect(201);
    expect(res.body.canEarn).toBe(false);
    expect(res.body.pointsToEarn).toBe(0);
  });

  it('REDEEM with negative totals -> discountToApply=0, canRedeem=false', async () => {
    state.walletBal = 10000;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-SAN', userToken: 'C1', mode: 'REDEEM', orderId: 'O-NEG-R', total: -100, eligibleTotal: -100 })
      .expect(201);
    expect(res.body.canRedeem).toBe(false);
    expect(res.body.discountToApply).toBe(0);
  });
});
