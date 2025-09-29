import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PromosService } from '../src/promos/promos.service';

/**
 * E2E: Promo + Rules + Levels (earn bonus) in one quote.
 * Expected: eligible 1000 -> promo -50 -> 950;
 * earnBps = 500 + 200(Silver) = 700 => pointsToEarn = floor(950*0.07)=66.
 */
describe('Combo: Promo+Rules+Levels (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: {
      merchantId: 'M-Combo', earnBps: 500, redeemLimitBps: 5000, updatedAt: new Date(),
      rulesJson: {
        levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 100 } ] },
        levelBenefits: { earnBpsBonusByLevel: { Base: 0, Silver: 200 }, redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000 } },
      },
    },
  };

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: { findUnique: async (args: any) => (args.where.merchantId === state.settings.merchantId ? state.settings : null) },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    // Sum EARN in period >= 100 to reach Silver
    transaction: { findMany: async (args: any) => [{ id: 'T1', merchantId: state.settings.merchantId, customerId: 'C-Combo', type: 'EARN', amount: 100, createdAt: new Date() }] },
    wallet: {
      findFirst: async (_args: any) => null,
      create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
      findUnique: async (args: any) => ({ id: args.where.id, balance: 0 }),
      update: async (args: any) => ({ id: args.where.id, balance: args.data.balance }),
    },
    hold: { create: async (args: any) => ({ ...args.data }) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      merchant: { upsert: async ()=>({}) },
      wallet: {
        findFirst: async (_args: any) => null,
        create: async (args: any) => ({ id: 'W1', ...args.data, balance: 0 }),
        findUnique: async (args: any) => ({ id: args.where.id, balance: 0 }),
        update: async (args: any) => ({ id: args.where.id, balance: args.data.balance }),
      },
      hold: { create: async (args: any) => ({ ...args.data }) },
      eventOutbox: { create: async (_args: any) => ({}) },
    }),
  };

  const promosMock: Partial<PromosService> = {
    preview: async () => ({ canApply: true, discount: 50, name: 'PROMO50' } as any),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .overrideProvider(PromosService).useValue(promosMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('EARN: 66 points after promo and Silver bonus', async () => {
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-Combo', userToken: 'C-Combo', mode: 'EARN', total: 1000, eligibleTotal: 1000, promoCode: 'PROMO50' })
      .expect(201);
    expect(res.body.pointsToEarn).toBe(66);
  });
});
