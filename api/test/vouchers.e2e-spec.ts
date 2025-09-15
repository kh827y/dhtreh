import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('Vouchers (e2e)', () => {
  let app: INestApplication;

  const state = {
    vouchers: [] as any[],
    codes: [] as any[],
    usages: [] as any[],
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    voucherCode: {
      findUnique: async (args: any) => state.codes.find(c => c.code === args.where.code) || null,
      update: async (args: any) => {
        const idx = state.codes.findIndex(c => c.id === args.where.id);
        if (idx >= 0) { state.codes[idx] = { ...state.codes[idx], ...args.data }; return state.codes[idx]; }
        return null;
      },
      create: async (args: any) => { const c = { id: args.data.id || `C${state.codes.length+1}`, ...args.data }; state.codes.push(c); return c; },
    },
    voucher: {
      findUnique: async (args: any) => state.vouchers.find(v => v.id === args.where.id) || null,
      update: async (args: any) => {
        const idx = state.vouchers.findIndex(v => v.id === args.where.id);
        if (idx >= 0) { state.vouchers[idx] = { ...state.vouchers[idx], ...args.data }; return state.vouchers[idx]; }
        return null;
      },
      create: async (args: any) => { const v = { id: args.data.id || `V${state.vouchers.length+1}`, ...args.data }; state.vouchers.push(v); return v; },
    },
    voucherUsage: {
      findFirst: async (args: any) => {
        const w = args.where || {};
        return state.usages.find(u => u.voucherId === w.voucherId && u.customerId === w.customerId && ((w.orderId ?? undefined) === (u.orderId ?? undefined))) || null;
      },
      create: async (args: any) => { const u = { id: `U${state.usages.length+1}`, ...args.data }; state.usages.push(u); return u; },
      count: async (args: any) => {
        const w = args.where || {};
        return state.usages.filter(u => u.voucherId === w.voucherId && u.customerId === w.customerId).length;
      },
      findMany: async (args: any) => {
        const w = args.where || {};
        return state.usages.filter(u => u.voucherId === w.voucherId && u.customerId === w.customerId).slice();
      },
    },
  };

  beforeAll(async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 7*24*60*60*1000);
    state.vouchers.push({ id: 'V1', merchantId: 'M1', valueType: 'PERCENTAGE', value: 10, validFrom: null, validUntil: future, minPurchaseAmount: 500 });
    state.codes.push({ id: 'C1', voucherId: 'V1', code: 'TENOFF', validFrom: null, validUntil: future });
    // Separate voucher/code for deactivate tests
    state.vouchers.push({ id: 'V2', merchantId: 'M1', valueType: 'PERCENTAGE', value: 5, validFrom: null, validUntil: future, minPurchaseAmount: 0 });
    state.codes.push({ id: 'C2', voucherId: 'V2', code: 'ONEUSE', validFrom: null, validUntil: future });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('issue creates voucher and code and preview works', async () => {
    const now = new Date();
    const until = new Date(now.getTime() + 24*60*60*1000).toISOString();
    const r = await request(app.getHttpServer())
      .post('/vouchers/issue')
      .send({ merchantId: 'M1', valueType: 'FIXED_AMOUNT', value: 150, code: 'NEW150', validUntil: until })
      .expect(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.voucherId).toBeTruthy();
    const pv = await request(app.getHttpServer())
      .post('/vouchers/preview')
      .send({ merchantId: 'M1', code: 'NEW150', eligibleTotal: 1000 })
      .expect(201);
    expect(pv.body.canApply).toBe(true);
    expect(pv.body.discount).toBe(150);
  });

  it('redeem idempotent when maxUses reached (same orderId returns existing usage)', async () => {
    // Prepare one-use code IDEMP1
    const now = new Date();
    const future = new Date(now.getTime() + 7*24*60*60*1000);
    state.vouchers.push({ id: 'V10', merchantId: 'M1', valueType: 'FIXED_AMOUNT', value: 100, validFrom: null, validUntil: future, minPurchaseAmount: 0 });
    state.codes.push({ id: 'C3', voucherId: 'V10', code: 'IDEMP1', validFrom: null, validUntil: future, maxUses: 1, usedCount: 0, status: 'ACTIVE' });

    // First redeem
    const r1 = await request(app.getHttpServer())
      .post('/vouchers/redeem')
      .send({ merchantId: 'M1', code: 'IDEMP1', customerId: 'C-idx', eligibleTotal: 1000, orderId: 'OID-1' })
      .expect(201);
    expect(r1.body.ok).toBe(true);
    expect(r1.body.discount).toBe(100);
    // Second redeem same orderId should return existing usage (not fail with usage limit)
    const r2 = await request(app.getHttpServer())
      .post('/vouchers/redeem')
      .send({ merchantId: 'M1', code: 'IDEMP1', customerId: 'C-idx', eligibleTotal: 1000, orderId: 'OID-1' })
      .expect(201);
    expect(r2.body.ok).toBe(true);
    expect(r2.body.discount).toBe(100);
  });

  it('status returns ACTIVE by default', async () => {
    const r = await request(app.getHttpServer())
      .post('/vouchers/status')
      .send({ merchantId: 'M1', code: 'ONEUSE' })
      .expect(201);
    expect(r.body.voucherStatus).toBe('ACTIVE');
    expect(r.body.codeStatus).toBe('ACTIVE');
  });

  it('deactivate code makes preview inactive', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/vouchers/deactivate')
      .send({ merchantId: 'M1', code: 'ONEUSE' })
      .expect(201);
    expect(r1.body.ok).toBe(true);
    const st = await request(app.getHttpServer())
      .post('/vouchers/status')
      .send({ merchantId: 'M1', code: 'ONEUSE' })
      .expect(201);
    expect(st.body.codeStatus).toBe('INACTIVE');
    const pv = await request(app.getHttpServer())
      .post('/vouchers/preview')
      .send({ merchantId: 'M1', code: 'ONEUSE', eligibleTotal: 1000 })
      .expect(201);
    expect(pv.body.canApply).toBe(false);
    expect(pv.body.reason).toBe('inactive');
  });

  it('preview returns discount for valid voucher code', async () => {
    const r = await request(app.getHttpServer())
      .post('/vouchers/preview')
      .send({ merchantId: 'M1', code: 'TENOFF', eligibleTotal: 1000 })
      .expect(201);
    expect(r.body.canApply).toBe(true);
    expect(r.body.discount).toBe(100);
    expect(r.body.voucherId).toBe('V1');
    expect(r.body.codeId).toBe('C1');
  });

  it('preview denies when below min purchase', async () => {
    const r = await request(app.getHttpServer())
      .post('/vouchers/preview')
      .send({ merchantId: 'M1', code: 'TENOFF', eligibleTotal: 400 })
      .expect(201);
    expect(r.body.canApply).toBe(false);
    expect(r.body.reason).toBe('min_purchase');
  });
});
