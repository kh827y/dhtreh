import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('CRM (e2e)', () => {
  let app: INestApplication;

  const state = {
    customers: [{ id: 'C1', phone: '+79990000001' }, { id: 'C2', phone: '+79990000002' }],
    wallets: [{ id: 'W1', merchantId: 'M1', customerId: 'C1', balance: 150 }],
    txns: [
      { id: 'T1', merchantId: 'M1', customerId: 'C1', type: 'EARN', amount: 50, orderId: 'O1', createdAt: new Date(), outletId: null, staffId: null },
      { id: 'T2', merchantId: 'M1', customerId: 'C1', type: 'REDEEM', amount: -25, orderId: 'O2', createdAt: new Date(Date.now()-3600_000), outletId: null, staffId: null },
    ],
    receipts: [
      { id: 'R1', merchantId: 'M1', customerId: 'C1', orderId: 'O1', total: 1000, eligibleTotal: 900, redeemApplied: 0, earnApplied: 50, createdAt: new Date(), outletId: null, staffId: null },
    ],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    customer: {
      findFirst: async (args: any) => state.customers.find(c => c.phone === args.where.phone) || null,
    },
    wallet: {
      findFirst: async (args: any) => state.wallets.find(w => w.merchantId === args.where.merchantId && w.customerId === args.where.customerId && String(args.where.type) === 'POINTS') || null,
    },
    transaction: {
      findMany: async (args: any) => {
        let arr = state.txns.filter(t => t.merchantId === args.where.merchantId);
        if (args.where.customerId) arr = arr.filter(t => t.customerId === args.where.customerId);
        if (args.where.before?.lt) arr = arr.filter(t => t.createdAt < args.where.before.lt);
        if (args.orderBy?.createdAt === 'desc') arr = arr.slice().sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
        return arr.slice(0, args.take || 10);
      },
    },
    receipt: {
      findMany: async (args: any) => {
        let arr = state.receipts.filter(r => r.merchantId === args.where.merchantId);
        if (args.where.customerId) arr = arr.filter(r => r.customerId === args.where.customerId);
        if (args.orderBy?.createdAt === 'desc') arr = arr.slice().sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
        return arr.slice(0, args.take || 5);
      },
    },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /merchants/:id/customer/search finds by phone and returns balance', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/customer/search?phone=%2B79990000001')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(res.body?.customerId).toBe('C1');
    expect(res.body?.balance).toBe(150);
  });

  it('GET /merchants/:id/customer/summary returns recent transactions and receipts', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/customer/summary?customerId=C1')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(res.body.balance).toBe(150);
    expect(Array.isArray(res.body.recentTx)).toBe(true);
    expect(Array.isArray(res.body.recentReceipts)).toBe(true);
  });
});
