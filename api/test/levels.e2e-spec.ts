import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

type Txn = { merchantId: string; customerId: string; type: 'EARN'|'REDEEM'; amount: number; createdAt: Date };

describe('Levels (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: new Map<string, any>(),
    txns: [] as Txn[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchantSettings: {
      findUnique: async (args: any) => state.settings.get(args.where.merchantId) || null,
    },
    transaction: {
      findMany: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && String(args.where.type) === String(args.where.type) && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)),
      count: async (args: any) => state.txns.filter(t => t.merchantId === args.where.merchantId && t.customerId === args.where.customerId && (!args.where.createdAt?.gte || t.createdAt >= args.where.createdAt.gte)).length,
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // Config: metric by EARN sum, thresholds 0/500/1000
    state.settings.set('M1', { merchantId: 'M1', rulesJson: { levelsCfg: { periodDays: 365, metric: 'earn', levels: [ { name: 'Base', threshold: 0 }, { name: 'Silver', threshold: 500 }, { name: 'Gold', threshold: 1000 } ] } } });

    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days*24*60*60*1000);
    // C1 earned 600 in period, C2 earned 1200, C3 only transactions count scenario later
    state.txns.push({ merchantId: 'M1', customerId: 'C1', type: 'EARN', amount: 300, createdAt: d(10) });
    state.txns.push({ merchantId: 'M1', customerId: 'C1', type: 'EARN', amount: 300, createdAt: d(5) });
    state.txns.push({ merchantId: 'M1', customerId: 'C2', type: 'EARN', amount: 700, createdAt: d(30) });
    state.txns.push({ merchantId: 'M1', customerId: 'C2', type: 'EARN', amount: 500, createdAt: d(2) });
  });

  afterAll(async () => { await app.close(); });

  it('GET /levels/:merchantId/:customerId returns current and next level by EARN sum', async () => {
    const r1 = await request(app.getHttpServer()).get('/levels/M1/C1').expect(200);
    expect(r1.body.current.name).toBe('Silver');
    expect(r1.body.next.name).toBe('Gold');
    expect(r1.body.progressToNext).toBe(1000 - r1.body.value);

    const r2 = await request(app.getHttpServer()).get('/levels/M1/C2').expect(200);
    expect(r2.body.current.name).toBe('Gold');
    expect(r2.body.next).toBeNull();
    expect(r2.body.progressToNext).toBe(0);
  });

  it('supports metric=transactions', async () => {
    // switch config
    state.settings.set('M1', { merchantId: 'M1', rulesJson: { levelsCfg: { periodDays: 365, metric: 'transactions', levels: [ { name: 'Base', threshold: 0 }, { name: 'Active', threshold: 2 } ] } } });
    const r = await request(app.getHttpServer()).get('/levels/M1/C1').expect(200);
    expect(r.body.metric).toBe('transactions');
    // C1 has 2 transactions (EARN)
    expect(r.body.current.name).toBe('Active');
  });
});
