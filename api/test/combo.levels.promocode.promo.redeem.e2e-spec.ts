import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PromosService } from '../src/promos/promos.service';

/**
 * E2E: Promo + Rules + Levels (redeem cap) in one quote.
 * Expected: eligible 1000 -> promo -50 -> 950;
 * redeemBps = 5000 + 1000(Silver) = 6000 => cap = floor(950*0.6)=570.
 * Wallet has enough balance to cover cap.
 */
describe('Combo: Promo+Rules+Levels for REDEEM (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: {
      merchantId: 'M-ComboR', earnBps: 500, redeemLimitBps: 5000, updatedAt: new Date(),
      rulesJson: {
        levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 100 } ] },
        levelBenefits: { earnBpsBonusByLevel: { Base: 0, Silver: 200 }, redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000 } },
      },
    },
    walletBal: 10000,
  };

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: { findUnique: async (args: any) => (args.where.merchantId === state.settings.merchantId ? state.settings : null) },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    // Sum EARN in period >= 100 to reach Silver
    transaction: { findMany: async (_args: any) => [{ id: 'T1', merchantId: state.settings.merchantId, customerId: 'C-Combo', type: 'EARN', amount: 120, createdAt: new Date() }] },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
    },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      merchant: { upsert: async ()=>({}) },
      wallet: {
        findFirst: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
      },
      hold: { create: async (args: any) => ({ ...args.data }) },
      eventOutbox: { create: async (_args: any) => ({}) },
      transaction: { create: async (_args: any) => ({ id: 'T-REDEEM' }) },
    }),
  };

  const promosMock: Partial<PromosService> = { preview: async () => ({ canApply: true, discount: 50, name: 'PROMO50' } as any) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .overrideProvider(PromosService).useValue(promosMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('REDEEM cap = 570 after promo and Silver bonus', async () => {
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: state.settings.merchantId, userToken: 'C-Combo', mode: 'REDEEM', total: 1000, eligibleTotal: 1000, promoCode: 'PROMO50' })
      .expect(201);
    expect(res.body.canRedeem).toBe(true);
    expect(res.body.discountToApply).toBe(570);
  });
});
