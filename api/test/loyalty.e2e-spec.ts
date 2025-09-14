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
    earnLots: [] as Array<{ id: string; merchantId: string; customerId: string; points: number; consumedPoints: number; earnedAt: Date; maturesAt?: Date|null; expiresAt?: Date|null; orderId?: string|null; receiptId?: string|null; outletId?: string|null; deviceId?: string|null; staffId?: string|null; status: 'ACTIVE'|'PENDING' }>,
    vouchers: [] as Array<{ id: string; merchantId: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; validFrom?: Date|null; validUntil?: Date|null; minPurchaseAmount?: number|null }>,
    voucherCodes: [] as Array<{ id: string; voucherId: string; code: string; validFrom?: Date|null; validUntil?: Date|null; maxUses?: number|null; usedCount?: number }>,
    voucherUsages: [] as Array<{ id: string; voucherId: string; codeId: string; customerId: string; orderId?: string|null; amount: number }>,
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
      create: async (args: any) => { const w: any = { id: uuid(), customerId: args.data.customerId, merchantId: args.data.merchantId, type: String(args.data.type || 'POINTS'), balance: 0 }; state.wallets.push(w); return w; },
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

    earnLot: {
      findMany: async (args: any) => {
        let arr = state.earnLots.filter(l => l.merchantId === args.where.merchantId && l.customerId === args.where.customerId);
        if (args.where.consumedPoints?.gt) arr = arr.filter(l => (l.consumedPoints || 0) > args.where.consumedPoints.gt);
        if (args.orderBy?.earnedAt === 'asc') arr = arr.sort((a,b) => a.earnedAt.getTime() - b.earnedAt.getTime());
        if (args.orderBy?.earnedAt === 'desc') arr = arr.sort((a,b) => b.earnedAt.getTime() - a.earnedAt.getTime());
        return arr.map(x => ({ ...x }));
      },
      update: async (args: any) => {
        const idx = state.earnLots.findIndex(l => l.id === args.where.id);
        if (idx >= 0) {
          const l = state.earnLots[idx];
          state.earnLots[idx] = { ...l, ...args.data };
          return state.earnLots[idx];
        }
        throw new Error('earnLot not found');
      },
      create: async (args: any) => {
        const d = args.data;
        const lot = {
          id: uuid(),
          merchantId: d.merchantId,
          customerId: d.customerId,
          points: d.points,
          consumedPoints: d.consumedPoints || 0,
          earnedAt: d.earnedAt ? new Date(d.earnedAt) : new Date(),
          maturesAt: d.maturesAt ? new Date(d.maturesAt) : null,
          expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
          orderId: d.orderId ?? null,
          receiptId: d.receiptId ?? null,
          outletId: d.outletId ?? null,
          deviceId: d.deviceId ?? null,
          staffId: d.staffId ?? null,
          status: d.status || 'ACTIVE',
        } as any;
        state.earnLots.push(lot);
        return lot;
      },
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
    voucherCode: {
      findUnique: async (args: any) => {
        if (args?.where?.code) return state.voucherCodes.find(c => c.code === args.where.code) || null;
        if (args?.where?.id) return state.voucherCodes.find(c => c.id === args.where.id) || null;
        return null;
      },
      update: async (args: any) => {
        const idx = state.voucherCodes.findIndex(c => c.id === args.where.id);
        if (idx >= 0) {
          const cur = state.voucherCodes[idx];
          const usedCount = (args.data.usedCount != null) ? args.data.usedCount : cur.usedCount || 0;
          state.voucherCodes[idx] = { ...cur, usedCount };
          return state.voucherCodes[idx];
        }
        return null;
      },
    },
    voucher: {
      findUnique: async (args: any) => state.vouchers.find(v => v.id === args.where.id) || null,
      create: async (args: any) => { const v = { id: args.data.id || uuid(), ...args.data }; state.vouchers.push(v as any); return v; },
    },
    voucherUsage: {
      findFirst: async (args: any) => state.voucherUsages.find(u => u.voucherId === args.where.voucherId && u.customerId === args.where.customerId && ((args.where.orderId ?? undefined) === (u.orderId ?? undefined))) || null,
      create: async (args: any) => { const u = { id: uuid(), ...args.data }; state.voucherUsages.push(u as any); return u; },
    },
  };

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    process.env.EARN_LOTS_FEATURE = '1';
    // default settings for M1
    state.merchantSettings.set('M1', { merchantId: 'M1', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, webhookSecret: 'whsec1', webhookKeyId: 'key_v1', updatedAt: new Date() });
    // lots-enabled merchant
    state.merchantSettings.set('M-lots', { merchantId: 'M-lots', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, updatedAt: new Date(), pointsTtlDays: 30 });
    // settings for guard merchant
    state.merchantSettings.set('M-guard', { merchantId: 'M-guard', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: true, updatedAt: new Date() });
    // bridge signature required merchant
    state.merchantSettings.set('M-bridge', { merchantId: 'M-bridge', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, requireBridgeSig: true, bridgeSecret: 'br1', updatedAt: new Date() });
    // jwt-only quotes merchant
    state.merchantSettings.set('M-jwt', { merchantId: 'M-jwt', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, requireJwtForQuote: true, updatedAt: new Date() });
    // staff for guard
    state.staff.push({ id: 'S1', merchantId: 'M-guard', apiKeyHash: createHash('sha256').update('staff-secret','utf8').digest('hex'), status: 'ACTIVE' });

    // Seed a voucher TENOFF (10% off, min 500)
    const now = new Date();
    const future = new Date(now.getTime() + 7*24*60*60*1000);
    state.vouchers.push({ id: 'V-TEN', merchantId: 'M1', valueType: 'PERCENTAGE', value: 10, validFrom: null, validUntil: future, minPurchaseAmount: 500 });
    state.voucherCodes.push({ id: 'VC-TEN', voucherId: 'V-TEN', code: 'TENOFF', validFrom: null, validUntil: future, maxUses: 1, usedCount: 0 });

    // Seed M2 voucher TEN2 for combined promo+voucher test
    state.vouchers.push({ id: 'V-TEN2', merchantId: 'M2', valueType: 'PERCENTAGE', value: 10, validFrom: null, validUntil: future, minPurchaseAmount: 0 });
    state.voucherCodes.push({ id: 'VC-TEN2', voucherId: 'V-TEN2', code: 'TEN2', validFrom: null, validUntil: future, maxUses: 10, usedCount: 0 });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('Quote order: voucher applied before promo, then points on remaining (M2)', async () => {
    // Configure promo for M2: fixed 50
    await prismaMock.merchantSettings.update({ where: { merchantId: 'M2' }, data: { rulesJson: { promos: [ { then: { discountFixed: 50 } } ] }, updatedAt: new Date() } });
    const r = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M2', userToken: 'C-vp-1', mode: 'EARN', total: 1000, eligibleTotal: 1000, voucherCode: 'TEN2' })
      .expect(201);
    // 1000 - voucher 10% = 900; then promo -50 => 850; earn 5% => 42 or 42/43 after flooring
    expect(r.body.pointsToEarn).toBe(42);
  });

  it('Quote (EARN) applies voucher discount before calculating points', async () => {
    const r = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-vq-1', mode: 'EARN', total: 1000, eligibleTotal: 1000, voucherCode: 'TENOFF' })
      .expect(201);
    expect(r.body.pointsToEarn).toBe(45); // default earnBps 5% on 900 eligible
  });

  it('Commit with voucherCode is idempotent by orderId (voucherUsage created once)', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-vr-1', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const orderId = 'O-vr-1';

    const c1 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId, voucherCode: 'TENOFF' })
      .expect(201);
    expect(c1.body.ok).toBe(true);
    const usageCountAfterFirst = state.voucherUsages.length;
    expect(usageCountAfterFirst).toBeGreaterThanOrEqual(1);

    const c2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId, voucherCode: 'TENOFF' })
      .expect(201);
    expect(c2.body.alreadyCommitted).toBe(true);
    const usageCountAfterSecond = state.voucherUsages.length;
    expect(usageCountAfterSecond).toBe(usageCountAfterFirst);
  });

  it('Refund idempotency: same Idempotency-Key returns cached body and does not re-apply balance change', async () => {
    // Prepare: earn to have points and a receipt
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-ridem', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId, orderId: 'OI-idem-ref-1' }).expect(201);

    const b0 = await request(app.getHttpServer()).get('/loyalty/balance/M1/C-ridem').expect(200);
    const key = 'idem-rf-1';
    const r1 = await request(app.getHttpServer())
      .post('/loyalty/refund')
      .set('Idempotency-Key', key)
      .send({ merchantId: 'M1', orderId: 'OI-idem-ref-1', refundEligibleTotal: 500 })
      .expect(201);
    const b1 = await request(app.getHttpServer()).get('/loyalty/balance/M1/C-ridem').expect(200);
    const r2 = await request(app.getHttpServer())
      .post('/loyalty/refund')
      .set('Idempotency-Key', key)
      .send({ merchantId: 'M1', orderId: 'OI-idem-ref-1', refundEligibleTotal: 500 })
      .expect(201);
    const b2 = await request(app.getHttpServer()).get('/loyalty/balance/M1/C-ridem').expect(200);
    expect(r1.body).toEqual(r2.body);
    expect(b2.body.balance).toBe(b1.body.balance);
    expect(b1.body.balance).not.toBe(b0.body.balance);
  });

  it('Multi-step partial REFUND (REDEEM): two 25% refunds restore ~50% of applied redeem', async () => {
    // Seed balance 200 points
    const qE = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-rmulti', mode: 'EARN', total: 2000, eligibleTotal: 2000 })
      .expect(201);
    const hE = qE.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hE, orderId: 'OR-rmulti-seed' }).expect(201);

    // Redeem
    const qR = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-rmulti', mode: 'REDEEM', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const hR = qR.body.holdId as string;
    const cR = await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hR, orderId: 'OR-rmulti' }).expect(201);
    const appliedRedeem = Number(cR.body.redeemApplied || 0);

    // Two partial refunds 25% + 25%
    const rA = await request(app.getHttpServer()).post('/loyalty/refund').send({ merchantId: 'M1', orderId: 'OR-rmulti', refundEligibleTotal: 250 }).expect(201);
    const rB = await request(app.getHttpServer()).post('/loyalty/refund').send({ merchantId: 'M1', orderId: 'OR-rmulti', refundEligibleTotal: 250 }).expect(201);
    const totalRestored = Number(rA.body.pointsRestored || 0) + Number(rB.body.pointsRestored || 0);
    expect(totalRestored).toBe(Math.round(appliedRedeem * 0.5));
  });

  it('Multi-step partial REFUND (EARN): two 25% refunds revoke ~50% of earned points', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-emulti', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId, orderId: 'OI-emulti' }).expect(201);
    const baseEarn = Number(q.body.pointsToEarn || 0);

    const rA = await request(app.getHttpServer()).post('/loyalty/refund').send({ merchantId: 'M1', orderId: 'OI-emulti', refundEligibleTotal: 250 }).expect(201);
    const rB = await request(app.getHttpServer()).post('/loyalty/refund').send({ merchantId: 'M1', orderId: 'OI-emulti', refundEligibleTotal: 250 }).expect(201);
    const totalRevoked = Number(rA.body.pointsRevoked || 0) + Number(rB.body.pointsRevoked || 0);
    const half = Math.round(baseEarn * 0.5);
    expect(Math.abs(totalRevoked - half)).toBeLessThanOrEqual(1);
  });

  it('Lots: EARN creates ACTIVE earn lot when lots feature enabled', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-lots', userToken: 'C-lots', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId, orderId: 'OL-earn-1' }).expect(201);
    const lots = await prismaMock.earnLot.findMany({ where: { merchantId: 'M-lots', customerId: 'C-lots' }, orderBy: { earnedAt: 'asc' } });
    const sumPoints = lots.reduce((s: number, l: any) => s + (l.points || 0), 0);
    // Default earnBps fallback is 500 (5%) when rulesJson is not configured
    expect(sumPoints).toBeGreaterThanOrEqual(50);
    expect(lots.find((l: any) => l.status === 'ACTIVE')).toBeTruthy();
  });

  it('Lots: REDEEM applies redeem; REFUND restores proportional points when lots feature enabled', async () => {
    // prepare: ensure customer has some ACTIVE lots in M-lots
    const qE = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-lots3', mode: 'EARN', total: 2000, eligibleTotal: 2000 })
      .expect(201);
    const hE = qE.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hE, orderId: 'OL-seed' }).expect(201);

    // ensure lots exist (seeded above)

    // Redeem 1000 total eligible -> limit 500, wallet >=200 (from earn 200) -> consume 200
    const qR = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-lots3', mode: 'REDEEM', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const hR = qR.body.holdId as string;
    const cR = await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hR, orderId: 'OL-redeem-1' }).expect(201);
    const appliedRedeem = Number(cR.body.redeemApplied || 0);

    // Refund half -> unconsume 100
    const rR = await request(app.getHttpServer()).post('/loyalty/refund').send({ merchantId: 'M1', orderId: 'OL-redeem-1', refundEligibleTotal: 500 }).expect(201);
    expect(rR.body.pointsRestored).toBe(Math.round(appliedRedeem * 0.5));
  });

  it('Invariant: EARN then partial REFUND revokes proportional points (by response)', async () => {
    // Earn 100 points (10% of 1000)
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-inv-earn', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const h1 = q1.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: h1, orderId: 'OI-earn-1' }).expect(201);

    // Balance after EARN (for info only)
    await request(app.getHttpServer()).get('/loyalty/balance/M1/C-inv-earn').expect(200);

    // Refund 50% of eligible -> expect ~half of earned points revoked
    const r = await request(app.getHttpServer())
      .post('/loyalty/refund')
      .send({ merchantId: 'M1', orderId: 'OI-earn-1', refundEligibleTotal: 500 })
      .expect(201);
    // Points revoked should be approx half of previously earned points for the order
    // Our earn was Math.floor(eligibleTotal * 0.05) = 50; expect ~25
    expect(r.body.pointsRevoked).toBe(Math.round((q1.body.pointsToEarn || 50) * 0.5));
  });

  it('Invariant: REDEEM then partial REFUND restores proportional points (by response)', async () => {
    // Seed balance by earning 200 points
    const qE = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-inv-red', mode: 'EARN', total: 2000, eligibleTotal: 2000 })
      .expect(201);
    const hE = qE.body.holdId as string;
    await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hE, orderId: 'OR-seed' }).expect(201);

    await request(app.getHttpServer()).get('/loyalty/balance/M1/C-inv-red').expect(200);
    const qR = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-inv-red', mode: 'REDEEM', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const hR = qR.body.holdId as string;
    const cRes = await request(app.getHttpServer()).post('/loyalty/commit').send({ holdId: hR, orderId: 'OR-1' }).expect(201);
    const appliedRedeem = Number(cRes.body.redeemApplied || 0);

    // Refund 50% of eligible -> expect ~half of appliedRedeem restored
    const ref = await request(app.getHttpServer())
      .post('/loyalty/refund')
      .send({ merchantId: 'M1', orderId: 'OR-1', refundEligibleTotal: 500 })
      .expect(201);
    expect(ref.body.pointsRestored).toBe(Math.round(appliedRedeem * 0.5));
  });

  it('OrderId collision: second commit returns alreadyCommitted=true', async () => {
    // First hold
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-ord', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const h1 = q1.body.holdId as string;

    // Second hold (same merchant, same orderId)
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-ord', mode: 'EARN', total: 500, eligibleTotal: 500 })
      .expect(201);
    const h2 = q2.body.holdId as string;

    const orderId = 'O-coll-1';

    const c1 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: h1, orderId })
      .expect(201);

    const c2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: h2, orderId })
      .expect(201);

    expect(c1.body.ok).toBe(true);
    expect(c2.body.alreadyCommitted).toBe(true);
    expect(c2.body.receiptId).toBe(c1.body.receiptId);
  });

  it('Idempotency-Key is scoped per merchant', async () => {
    const key = 'scope-key-' + Date.now();

    // Merchant M1
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-scope', mode: 'EARN', total: 100, eligibleTotal: 100 })
      .expect(201);
    const h1 = q1.body.holdId as string;

    // Merchant M2 (no special settings)
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M2', userToken: 'C-scope', mode: 'EARN', total: 100, eligibleTotal: 100 })
      .expect(201);
    const h2 = q2.body.holdId as string;

    const r1 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .set('Idempotency-Key', key)
      .send({ holdId: h1, orderId: 'O-scope-1' })
      .expect(201);

    const r2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .set('Idempotency-Key', key)
      .send({ holdId: h2, orderId: 'O-scope-2' })
      .expect(201);

    // Same key but different merchants -> independent results
    expect(r1.body.receiptId).not.toBe(r2.body.receiptId);
  });

  it('Concurrency invariant: two commits on the same hold -> exactly one receipt, second alreadyCommitted', async () => {
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M1', userToken: 'C-conc', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/loyalty/commit').send({ holdId, orderId: 'O-conc-1' }),
      request(app.getHttpServer()).post('/loyalty/commit').send({ holdId, orderId: 'O-conc-1' }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const r1 = a.body;
    const r2 = b.body;
    expect(r1.receiptId).toBeTruthy();
    expect(r2.receiptId).toBeTruthy();
    expect(r1.receiptId).toBe(r2.receiptId);
    // one of the responses should indicate alreadyCommitted
    const flags = [r1.alreadyCommitted === true, r2.alreadyCommitted === true];
    expect(flags.includes(true)).toBe(true);
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
