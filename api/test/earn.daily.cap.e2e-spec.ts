import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: EARN daily cap — лимит начислений за 24 часа ограничивает pointsToEarn.
 * Case A: cap=70, уже начислено 50 → dailyEarnLeft=20 → при earnBps=500 (5%) и eligible=1000 points=50 ⇒ применится 20.
 * Case B: cap=70, уже начислено 70 → остаток 0 → canEarn=false, pointsToEarn=0.
 */
describe('EARN daily cap (e2e)', () => {
  let app: INestApplication;
  const state = { used: 50 } as any;

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: { findUnique: async (args: any) => ({ merchantId: args.where.merchantId, earnBps: 500, redeemLimitBps: 5000, earnDailyCap: 70, updatedAt: new Date(), rulesJson: null }) },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    transaction: {
      findMany: async (_args: any) => {
        if (state.used <= 0) return [];
        const items: any[] = [];
        let rem = state.used;
        while (rem > 0) { const chunk = Math.min(rem, 30); items.push({ amount: chunk, type: 'EARN', createdAt: new Date() }); rem -= chunk; }
        return items;
      }
    },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: 0 }),
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: 0 }),
      update: async (_args: any) => ({ id: 'W1', balance: 0 }),
    },
    hold: { create: async (args: any) => ({ ...args.data, id: 'H1' }) },
    eventOutbox: { create: async (_args: any) => ({}) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      merchant: { upsert: async ()=>({}) },
      wallet: {
        findFirst: async (_args: any) => ({ id: 'W1', balance: 0 }),
        create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: 0 }),
        update: async (_args: any) => ({ id: 'W1', balance: 0 }),
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

  it('Daily cap limits EARN to 20 when used=50 and cap=70', async () => {
    state.used = 50;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-ECAP', userToken: 'C1', mode: 'EARN', orderId: 'OE-1', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res.body.canEarn).toBe(true);
    expect(res.body.pointsToEarn).toBe(20);
  });

  it('Daily cap exhausted -> deny earn', async () => {
    state.used = 70;
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-ECAP', userToken: 'C1', mode: 'EARN', orderId: 'OE-2', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res.body.canEarn).toBe(false);
    expect(res.body.pointsToEarn).toBe(0);
  });
});
