import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('CSV Exports (e2e)', () => {
  let app: INestApplication;

  const state = {
    receipts: [] as Array<{ id: string; merchantId: string; customerId: string; orderId: string; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; createdAt: Date; outletId?: string|null; staffId?: string|null }>,
    transactions: [] as Array<{ id: string; merchantId: string; customerId: string; type: string; amount: number; orderId?: string|null; createdAt: Date; outletId?: string|null; staffId?: string|null }>,
  };
  const uuid = (() => { let i = 1; return () => `id-${i++}`; })();

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    receipt: {
      findMany: async (args: any) => {
        let arr = state.receipts.filter(x => x.merchantId === args.where.merchantId);
        if (args.where.createdAt?.lt) arr = arr.filter(x => x.createdAt < args.where.createdAt.lt);
        if (args.where.orderId) arr = arr.filter(x => x.orderId === args.where.orderId);
        if (args.where.customerId) arr = arr.filter(x => x.customerId === args.where.customerId);
        if (args.orderBy?.createdAt === 'desc') arr = arr.slice().sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
        return arr.slice(0, args.take || 1000);
      },
    },
    transaction: {
      findMany: async (args: any) => {
        let arr = state.transactions.filter(x => x.merchantId === args.where.merchantId && x.customerId === args.where.customerId);
        if (args.where.createdAt?.lt) arr = arr.filter(x => x.createdAt < args.where.createdAt.lt);
        if (args.orderBy?.createdAt === 'desc') arr = arr.slice().sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
        return arr.slice(0, args.take || 1000);
      },
    },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    const now = new Date();
    state.receipts.push({ id: uuid(), merchantId: 'M1', customerId: 'C1', orderId: 'O1', total: 1000, eligibleTotal: 900, redeemApplied: 100, earnApplied: 50, createdAt: now, outletId: null, staffId: null });
    state.receipts.push({ id: uuid(), merchantId: 'M1', customerId: 'C2', orderId: 'O2', total: 500, eligibleTotal: 500, redeemApplied: 0, earnApplied: 25, createdAt: new Date(now.getTime()-3600_000), outletId: null, staffId: null });
    state.transactions.push({ id: uuid(), merchantId: 'M1', customerId: 'C1', type: 'EARN', amount: 50, orderId: 'O1', createdAt: now });
    state.transactions.push({ id: uuid(), merchantId: 'M1', customerId: 'C1', type: 'REDEEM', amount: -100, orderId: 'O3', createdAt: new Date(now.getTime()-7200_000) });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /merchants/:id/receipts.csv returns CSV with header', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/receipts.csv')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(typeof res.text).toBe('string');
    expect(res.text.split('\n')[0]).toContain('id,orderId,customerId,total,eligibleTotal,redeemApplied,earnApplied,createdAt,outletId,staffId');
  });

  it('GET /merchants/:id/transactions.csv returns CSV with header', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/transactions.csv?customerId=C1')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(typeof res.text).toBe('string');
    expect(res.text.split('\n')[0]).toContain('id,type,amount,orderId,customerId,createdAt,outletId,staffId');
  });
});
