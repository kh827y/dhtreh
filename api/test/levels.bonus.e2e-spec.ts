import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('Levels bonuses applied in quote (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: new Map<string, any>(),
    txns: [] as Array<{ merchantId: string; customerId: string; type: 'EARN'|'REDEEM'; amount: number; createdAt: Date }>,
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) => fn(prismaMock),
    merchant: { upsert: jest.fn(async () => ({})) },
    merchantSettings: {
      findUnique: async (args: any) => state.settings.get(args.where.merchantId) || null,
    },
    customer: {
      findUnique: async (_args: any) => null,
      create: async (args: any) => ({ id: args?.data?.id || 'C1' }),
    },
    transaction: {
      findMany: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && (!args.where.type || t.type === args.where.type) && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)),
      count: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)).length,
    },
    hold: { create: async (args: any) => ({ id: 'H1', ...args.data }) },
    wallet: {
      findFirst: async (_args: any) => ({ id: 'W1', balance: 2000, type: 'POINTS' }),
      create: async () => ({ id: 'W1', balance: 2000, type: 'POINTS' }),
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

    // Configure levels + benefits for merchant M-LVL
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

  it('EARN picks up earnBps bonus (Base 500 + Silver 200 = 700 bps)', async () => {
    const r = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-LVL', userToken: 'C1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(r.body.pointsToEarn).toBe(70);
  });

  it('REDEEM cap includes redeemLimitBps bonus (Base 5000 + Silver 1000 = 6000 => 600 cap)', async () => {
    const r = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-LVL', userToken: 'C1', mode: 'REDEEM', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(r.body.discountToApply).toBe(600);
  });
});
