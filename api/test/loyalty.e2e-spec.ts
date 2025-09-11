import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';
import { createHash } from 'crypto';

type Wallet = { id: string; customerId: string; merchantId: string; balance: number };
type Hold = { id: string; customerId: string; merchantId: string; mode: 'REDEEM'|'EARN'; redeemAmount?: number; earnPoints?: number; orderId?: string|null; total?: number|null; eligibleTotal?: number|null; status: string; expiresAt?: Date|null; outletId?: string|null; deviceId?: string|null; staffId?: string|null };
type Receipt = { id: string; merchantId: string; customerId: string; orderId: string; receiptNumber?: string|null; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; outletId?: string|null; deviceId?: string|null; staffId?: string|null };

describe('Loyalty (e2e)', () => {
  let app: INestApplication;

  const state = {
    merchantSettings: new Map<string, any>(),
    customers: new Map<string, { id: string; tgId?: string|null }>(),
    wallets: [] as Wallet[],
    holds: [] as Hold[],
    receipts: [] as Receipt[],
    transactions: [] as any[],
    eventOutbox: [] as any[],
    staff: [] as { id: string; merchantId: string; apiKeyHash?: string; status: string; allowedOutletId?: string|null; allowedDeviceId?: string|null }[],
    devices: [] as { id: string; merchantId: string; type: 'SMART'|'PC_POS'|'VIRTUAL'; label?: string|null; bridgeSecret?: string|null }[],
    idem: new Map<string, any>(),
  };

  const uuid = (() => { let i = 1; return () => `id-${i++}`; })();

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) => {
      // snapshot state (shallow) for rollback on error
      const snap = {
        merchantSettings: new Map(state.merchantSettings),
        customers: new Map(state.customers),
        wallets: state.wallets.map(w => ({ ...w })),
        holds: state.holds.map(h => ({ ...h })),
        receipts: state.receipts.map(r => ({ ...r })),
        transactions: state.transactions.map(t => ({ ...t })),
        eventOutbox: state.eventOutbox.map(e => ({ ...e })),
        staff: state.staff.map(s => ({ ...s })),
        devices: state.devices.map(d => ({ ...d })),
        idem: new Map(state.idem),
      };
      try {
        return await fn(prismaMock);
      } catch (e) {
        // rollback
        state.merchantSettings = snap.merchantSettings;
        state.customers = snap.customers;
        state.wallets = snap.wallets;
        state.holds = snap.holds;
        state.receipts = snap.receipts;
        state.transactions = snap.transactions;
        state.eventOutbox = snap.eventOutbox;
        state.staff = snap.staff;
        state.devices = snap.devices;
        state.idem = snap.idem;
        throw e;
      }
    },

    merchantSettings: {
      findUnique: async (args: any) => {
        const id = args.where.merchantId;
        return state.merchantSettings.get(id) || null;
      },
      update: async (args: any) => {
        const id = args.where.merchantId;
        const ex = state.merchantSettings.get(id) || { merchantId: id };
        const u = { ...ex, ...args.data };
        state.merchantSettings.set(id, u);
        return u;
      },
    },

    customer: {
      findUnique: async (args: any) => state.customers.get(args.where.id) || null,
      create: async (args: any) => { const c = { id: args.data.id, tgId: null }; state.customers.set(c.id, c); return c; },
    },

    wallet: {
      findFirst: async (args: any) => state.wallets.find(w => w.customerId === args.where.customerId && w.merchantId === args.where.merchantId && String(args.where.type) === 'POINTS') || null,
      create: async (args: any) => { const w: Wallet = { id: uuid(), customerId: args.data.customerId, merchantId: args.data.merchantId, balance: 0 }; state.wallets.push(w); return w; },
      findUnique: async (args: any) => state.wallets.find(w => w.id === args.where.id) || null,
      update: async (args: any) => { const w = state.wallets.find(x => x.id === args.where.id)!; Object.assign(w, { balance: args.data.balance }); return w; },
    },

    hold: {
      findUnique: async (args: any) => {
        if (args?.where?.id) return state.holds.find(h => h.id === args.where.id) || null;
        if (args?.where?.qrJti) return state.holds.find(h => (h as any).qrJti === args.where.qrJti) || null;
        return null;
      },
      create: async (args: any) => { const h: Hold = { id: args.data.id || uuid(), customerId: args.data.customerId, merchantId: args.data.merchantId, mode: args.data.mode, redeemAmount: args.data.redeemAmount, earnPoints: args.data.earnPoints, orderId: args.data.orderId ?? null, total: args.data.total ?? null, eligibleTotal: args.data.eligibleTotal ?? null, status: args.data.status, expiresAt: args.data.expiresAt ?? null, outletId: args.data.outletId ?? null, deviceId: args.data.deviceId ?? null, staffId: args.data.staffId ?? null } as any; state.holds.push(h); return h; },
      update: async (args: any) => { const h = state.holds.find(x => x.id === args.where.id)!; Object.assign(h, args.data); return h; },
    },

    transaction: {
      findFirst: async (_args: any) => null,
      findMany: async (_args: any) => state.transactions.slice(),
      create: async (args: any) => { state.transactions.push({ id: uuid(), ...args.data, createdAt: new Date() }); return state.transactions[state.transactions.length - 1]; },
    },

    receipt: {
      findUnique: async (args: any) => state.receipts.find(r => r.merchantId === args.where.merchantId_orderId.merchantId && r.orderId === args.where.merchantId_orderId.orderId) || null,
      create: async (args: any) => { const r: Receipt = { id: uuid(), merchantId: args.data.merchantId, customerId: args.data.customerId, orderId: args.data.orderId, receiptNumber: args.data.receiptNumber ?? null, total: args.data.total, eligibleTotal: args.data.eligibleTotal, redeemApplied: args.data.redeemApplied, earnApplied: args.data.earnApplied, outletId: args.data.outletId ?? null, deviceId: args.data.deviceId ?? null, staffId: args.data.staffId ?? null }; state.receipts.push(r); return r; },
    },

    eventOutbox: {
      create: async (args: any) => { state.eventOutbox.push({ id: uuid(), ...args.data, createdAt: new Date() }); return state.eventOutbox[state.eventOutbox.length - 1]; },
      updateMany: async (_args: any) => ({ count: 0 }),
      findMany: async (_args: any) => state.eventOutbox.slice(),
      count: async (_args: any) => state.eventOutbox.length,
    },

    idempotencyKey: {
      findUnique: async (args: any) => state.idem.get(args.where.merchantId_key.merchantId + '|' + args.where.merchantId_key.key) || null,
      create: async (args: any) => { state.idem.set(args.data.merchantId + '|' + args.data.key, { response: args.data.response }); return {}; },
    },

    staff: {
      findFirst: async (args: any) => {
        const h = args.where.apiKeyHash;
        const m = args.where.merchantId;
        return state.staff.find(s => s.merchantId === m && s.apiKeyHash === h && s.status === 'ACTIVE') || null;
      },
    },

    qrNonce: {
      create: async (_args: any) => ({}),
    },

    device: {
      findUnique: async (args: any) => state.devices.find(d => d.id === args.where.id) || null,
    },
  };

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    // default settings for M1
    state.merchantSettings.set('M1', { merchantId: 'M1', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, webhookSecret: 'whsec1', webhookKeyId: 'key_v1', updatedAt: new Date() });
    // settings for guard merchant
    state.merchantSettings.set('M-guard', { merchantId: 'M-guard', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: true, updatedAt: new Date() });
    // bridge signature required merchant
    state.merchantSettings.set('M-bridge', { merchantId: 'M-bridge', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, requireBridgeSig: true, bridgeSecret: 'br1', updatedAt: new Date() });
    // jwt-only quotes merchant
    state.merchantSettings.set('M-jwt', { merchantId: 'M-jwt', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, requireJwtForQuote: true, updatedAt: new Date() });
    // staff for guard
    state.staff.push({ id: 'S1', merchantId: 'M-guard', apiKeyHash: createHash('sha256').update('staff-secret','utf8').digest('hex'), status: 'ACTIVE' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('Idempotency: same Idempotency-Key returns cached commit response', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-2', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const key = 'idem-123';
    const r1 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .set('Idempotency-Key', key)
      .send({ holdId, orderId: 'O-3' })
      .expect(201);
    const r2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .set('Idempotency-Key', key)
      .send({ holdId, orderId: 'O-3' })
      .expect(201);
    expect(r1.body).toEqual(r2.body);
  });

  it('Bridge signature: quote requires valid X-Bridge-Signature when enabled', async () => {
    // Missing header -> 401
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-bridge', userToken: 'C-3', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(401);
    // Correct header -> 201
    const body = { merchantId: 'M-bridge', userToken: 'C-3', mode: 'EARN', total: 1000, eligibleTotal: 1000 };
    const ts = Math.floor(Date.now()/1000).toString();
    const sig = require('crypto').createHmac('sha256', 'br1').update(`${ts}.${JSON.stringify(body)}`).digest('base64');
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .set('X-Bridge-Signature', `v1,ts=${ts},sig=${sig}`)
      .send(body)
      .expect(201);
  });

  it('JWT-only quotes: requireJwtForQuote=1 blocks plain token, allows JWT from /loyalty/qr', async () => {
    // plain token -> 400
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-jwt', userToken: 'C-4', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(400);
    // get QR token and retry
    const qr = await request(app.getHttpServer())
      .post('/loyalty/qr')
      .send({ merchantId: 'M-jwt', customerId: 'C-4', ttlSec: 60 })
      .expect(201);
    const token = qr.body.token as string;
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-jwt', userToken: token, mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('POST /loyalty/quote (EARN) -> returns holdId', async () => {
    const res = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    expect(res.body.holdId).toBeTruthy();
  });

  it('POST /loyalty/commit -> ok and outbox event created', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const res = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ merchantId: 'M1', holdId, orderId: 'O-1' })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(state.eventOutbox.find(e => e.eventType === 'loyalty.commit' && e.payload.orderId === 'O-1')).toBeTruthy();
    // response signature headers (if present) should look valid
    const sig = res.headers['x-loyalty-signature'];
    if (typeof sig === 'string') {
      expect(sig).toMatch(/^v1,/);
    }
  });

  it('POST /loyalty/refund -> ok and outbox refund event created', async () => {
    // prepare a committed receipt via quote+commit
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ merchantId: 'M1', holdId, orderId: 'O-2' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/loyalty/refund')
      .send({ merchantId: 'M1', orderId: 'O-2', refundTotal: 200 })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(state.eventOutbox.find(e => e.eventType === 'loyalty.refund' && e.payload.orderId === 'O-2')).toBeTruthy();
  });

  it('CashierGuard: requireStaffKey=true blocks without key, allows with correct key', async () => {
    // blocked
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-guard', userToken: 'C-guard', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(403);
    // allowed with staff key
    await request(app.getHttpServer())
      .post('/loyalty/quote')
      .set('X-Staff-Key', 'staff-secret')
      .send({ merchantId: 'M-guard', userToken: 'C-guard', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
  });
});
