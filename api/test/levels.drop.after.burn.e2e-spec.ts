import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PointsBurnWorker } from '../src/points-burn.worker';

/**
 * Levels period window drop after time advance (+ TTL burn tick for completeness):
 * - levelsCfg.periodDays=1, metric=earn
 * - Initially EARN txn within 1 day -> Silver (+200 bps) => quote 70 on 1000
 * - Advance time by 2 days -> level falls to Base -> quote 50 on 1000
 */
describe('Levels drop after period window (+TTL burn) (e2e)', () => {
  let app: INestApplication;
  let burn: PointsBurnWorker;

  const now = Date.now();

  const state = {
    settings: {
      merchantId: 'M-LDROP', earnBps: 500, redeemLimitBps: 5000, pointsTtlDays: 1,
      updatedAt: new Date(),
      rulesJson: {
        levelsCfg: { periodDays: 1, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 100 } ] },
        levelBenefits: { earnBpsBonusByLevel: { Base: 0, Silver: 200 }, redeemLimitBpsBonusByLevel: { Base: 0, Silver: 1000 } },
      },
    },
    walletBal: 0,
  } as any;

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    merchantSettings: {
      findUnique: async (args: any) => (args.where.merchantId === state.settings.merchantId ? state.settings : null),
      findMany: async () => [{ merchantId: state.settings.merchantId, pointsTtlDays: state.settings.pointsTtlDays }],
    },
    merchant: { upsert: async ()=>({}) },
    customer: { findUnique: async (args: any) => ({ id: args.where.id }), create: async (args: any)=>({ id: args.data.id }) },
    transaction: {
      async findMany(args: any) {
        const since = args?.where?.createdAt?.gte ? new Date(args.where.createdAt.gte) : undefined;
        const createdAt = new Date(now); // one EARN at t=now
        const list = [{ id: 'T1', merchantId: state.settings.merchantId, customerId: 'C-LDROP', type: 'EARN', amount: 120, createdAt }];
        if (!since) return list;
        return list.filter(t => t.createdAt >= since);
      },
      // for approx TTL path (unused in this test)
      aggregate: async () => ({ _sum: { amount: 0 } }),
    },
    wallet: {
      findFirst: async (_args: any) => (state.walletBal != null ? { id: 'W1', balance: state.walletBal } : null),
      create: async (args: any) => ({ id: 'W1', ...args.data }),
      findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
      update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
    },
    earnLot: {
      findMany: async (args: any) => [], // no lots needed
    },
    hold: { create: async (args: any) => ({ ...args.data }) },
    eventOutbox: { create: async (_args: any) => ({}) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      merchant: { upsert: async ()=>({}) },
      wallet: {
        findFirst: async (_args: any) => (state.walletBal != null ? { id: 'W1', balance: state.walletBal } : null),
        create: async (args: any) => ({ id: 'W1', ...args.data }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: state.walletBal }),
        update: async (args: any) => { if (typeof args.data?.balance === 'number') state.walletBal = args.data.balance; return { id: 'W1', balance: state.walletBal }; },
      },
      hold: { create: async (args: any) => ({ ...args.data }) },
      eventOutbox: { create: async (_args: any) => ({}) },
    }),
  };

  beforeAll(async () => {
    jest.useFakeTimers().setSystemTime(now);
    const lockUtil = require('../src/pg-lock.util');
    jest.spyOn(lockUtil, 'pgTryAdvisoryLock').mockResolvedValue({ ok: true, key: [1,2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    burn = app.get(PointsBurnWorker);
  });

  afterAll(async () => { await app.close(); jest.useRealTimers(); });

  it('Initially Silver -> quote 70', async () => {
    const r1 = await request(app.getHttpServer())
      .get(`/levels/${state.settings.merchantId}/C-LDROP`).expect(200);
    expect(r1.body.current?.name).toBe('Silver');
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: state.settings.merchantId, userToken: 'C-LDROP', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(q1.body.pointsToEarn).toBe(70);
  });

  it('After time+TTL burn -> Base -> quote 50', async () => {
    // Advance time by 2 days (periodDays=1 ==> transaction leaves window)
    jest.setSystemTime(now + 2*24*60*60*1000);
    // Trigger TTL burn tick (not strictly necessary for level drop, for completeness)
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_BURN = '1';
    process.env.EARN_LOTS_FEATURE = '1';
    await (burn as any).tick();

    const r2 = await request(app.getHttpServer())
      .get(`/levels/${state.settings.merchantId}/C-LDROP`).expect(200);
    expect(r2.body.current?.name).toBe('Base');
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: state.settings.merchantId, userToken: 'C-LDROP', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(q2.body.pointsToEarn).toBe(50);
  });
});
