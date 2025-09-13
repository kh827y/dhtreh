import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

// Local in-memory state for mocking Prisma in tests
type Txn = { id: string; merchantId: string; customerId?: string|null; deviceId?: string|null; staffId?: string|null; createdAt: Date };

describe('AntiFraud Guard (e2e)', () => {
  let app: INestApplication;

  const state = {
    merchantSettings: new Map<string, any>(),
    customers: new Map<string, { id: string }>(),
    wallets: [] as { id: string; customerId: string; merchantId: string; balance: number }[],
    holds: [] as any[],
    receipts: [] as any[],
    transactions: [] as Txn[],
    idem: new Map<string, any>(),
    eventOutbox: [] as any[],
    audits: [] as any[],
  };

  const uuid = (() => { let i = 1; return () => `id-${i++}`; })();

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) => fn(prismaMock),

    merchantSettings: {
      findUnique: async (args: any) => state.merchantSettings.get(args.where.merchantId) || null,
      update: async (args: any) => { const id = args.where.merchantId; const ex = state.merchantSettings.get(id) || { merchantId: id }; const u = { ...ex, ...args.data }; state.merchantSettings.set(id, u); return u; },
    },

    customer: {
      findUnique: async (args: any) => state.customers.get(args.where.id) || null,
      create: async (args: any) => { const c = { id: args.data.id }; state.customers.set(c.id, c); return c; },
    },

    wallet: {
      findFirst: async (args: any) => state.wallets.find(w => w.customerId === args.where.customerId && w.merchantId === args.where.merchantId && String(args.where.type) === 'POINTS') || null,
      create: async (args: any) => { const w = { id: uuid(), customerId: args.data.customerId, merchantId: args.data.merchantId, balance: 0 }; state.wallets.push(w); return w; },
      findUnique: async (args: any) => state.wallets.find(w => w.id === args.where.id) || null,
      update: async (args: any) => { const w = state.wallets.find(x => x.id === args.where.id)!; Object.assign(w, { balance: args.data.balance }); return w; },
    },

    hold: {
      findUnique: async (args: any) => state.holds.find(h => h.id === args.where.id) || null,
      create: async (args: any) => { const h = { id: args.data.id || uuid(), ...args.data }; state.holds.push(h); return h; },
      update: async (args: any) => { const h = state.holds.find(x => x.id === args.where.id)!; Object.assign(h, args.data); return h; },
    },

    transaction: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        const gte: Date | undefined = where?.createdAt?.gte;
        return state.transactions.filter(t => {
          if (where.merchantId && t.merchantId !== where.merchantId) return false;
          if (where.customerId && t.customerId !== where.customerId) return false;
          if (where.deviceId && t.deviceId !== where.deviceId) return false;
          if (where.staffId && t.staffId !== where.staffId) return false;
          if (gte && !(t.createdAt >= gte)) return false;
          return true;
        }).slice();
      },
      create: async (args: any) => { const t: Txn = { id: uuid(), merchantId: args.data.merchantId, customerId: args.data.customerId ?? null, deviceId: args.data.deviceId ?? null, staffId: args.data.staffId ?? null, createdAt: new Date() }; state.transactions.push(t); return t; },
      count: async (args: any) => {
        const where = args?.where || {};
        const gte: Date | undefined = where?.createdAt?.gte;
        return state.transactions.filter(t => {
          if (where.merchantId && t.merchantId !== where.merchantId) return false;
          if (where.customerId && t.customerId !== where.customerId) return false;
          if (where.deviceId && t.deviceId !== where.deviceId) return false;
          if (where.staffId && t.staffId !== where.staffId) return false;
          if (gte && !(t.createdAt >= gte)) return false;
          return true;
        }).length;
      },
    },

    receipt: {
      findUnique: async (args: any) => state.receipts.find(r => r.merchantId === args.where.merchantId_orderId.merchantId && r.orderId === args.where.merchantId_orderId.orderId) || null,
      create: async (args: any) => { const r = { id: uuid(), ...args.data }; state.receipts.push(r); return r; },
    },

    idempotencyKey: {
      findUnique: async (args: any) => state.idem.get(args.where.merchantId_key.merchantId + '|' + args.where.merchantId_key.key) || null,
      create: async (args: any) => { state.idem.set(args.data.merchantId + '|' + args.data.key, { response: args.data.response }); return {}; },
    },

    eventOutbox: {
      create: async (args: any) => { state.eventOutbox.push({ id: uuid(), ...args.data, createdAt: new Date() }); return state.eventOutbox[state.eventOutbox.length - 1]; },
      findMany: async (_args: any) => state.eventOutbox.slice(),
      updateMany: async (_args: any) => ({ count: 0 }),
      count: async (_args: any) => state.eventOutbox.length,
    },

    adminAudit: {
      create: async (args: any) => { state.audits.push({ id: uuid(), ...args.data }); return state.audits[state.audits.length - 1]; },
      findMany: async (_args: any) => state.audits.slice(),
    },

    device: {
      findUnique: async (_args: any) => null,
      findMany: async (_args: any) => [],
      update: async (_args: any) => null,
      create: async (_args: any) => null,
    },
  };

  beforeAll(async () => {
    process.env.ANTIFRAUD_GUARD_FORCE = 'on';
    process.env.ANTIFRAUD_GUARD = 'on';

    // Merchant with AF limits
    state.merchantSettings.set('M-af', {
      merchantId: 'M-af', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false,
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 1,   windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          blockFactors: [],
        }
      },
      updatedAt: new Date()
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('Velocity: второй коммит одного клиента блокируется по customer.limit', async () => {
    // Первый коммит OK
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-vel', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId1 = q1.body.holdId as string;
    await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: holdId1, orderId: 'O-v-1' })
      .expect(201);

    // Второй коммит -> 429 по лимиту customer
    const q2 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-vel', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId2 = q2.body.holdId as string;
    const r2 = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: holdId2, orderId: 'O-v-2' })
      .expect(429);
    expect(String(r2.body.message || '')).toMatch(/превышен лимит/);
  });

  it('Factor block: blockFactors=["no_device_id"] -> блокировка по фактору', async () => {
    // Включаем факторную блокировку
    state.merchantSettings.set('M-af', {
      ...(state.merchantSettings.get('M-af')!),
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 5,   windowSec: 60,  dailyCap: 0, weeklyCap: 0 },
          blockFactors: ['no_device_id']
        }
      }
    });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-fac', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-f-1' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/фактору/);
  });

  it('CRITICAL риск -> блокировка по скорингу', async () => {
    // Новый мерчант без факторных блокировок
    state.merchantSettings.set('M-af2', {
      merchantId: 'M-af2', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false,
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 99,  windowSec: 60, dailyCap: 0, weeklyCap: 0 }
        }
      },
      updatedAt: new Date()
    });

    // Сгенерируем 7 быстрых транзакций за последние 5 минут для увеличения скоринга (hourly > 5 и rapid > 2)
    const ts = new Date();
    for (let i = 0; i < 7; i++) {
      state.transactions.push({ id: uuid(), merchantId: 'M-af2', customerId: 'C-crit', createdAt: new Date(ts.getTime() - 60 * 1000), deviceId: null, staffId: null });
    }

    // Совершаем EARN на 2_000_000 -> очень высокий скоринг (earnPoints > 100000)
    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af2', userToken: 'C-crit', mode: 'EARN', total: 2000000, eligibleTotal: 2000000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-c-1' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/высокий риск/i);
  });

  it('Daily cap: customer_daily блокировка при превышении суточного капа', async () => {
    // Настраиваем dailyCap=1
    state.merchantSettings.set('M-af', {
      ...(state.merchantSettings.get('M-af')!),
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 99,  windowSec: 60, dailyCap: 1, weeklyCap: 0 }
        }
      }
    });

    // Предзаполняем 1 транзакцию сегодня
    state.transactions.push({ id: uuid(), merchantId: 'M-af', customerId: 'C-day', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), deviceId: null, staffId: null });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-day', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-d-1' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/превышен лимит/);
  });

  it('Device velocity: блокировка при превышении лимита по device в окне', async () => {
    // Настраиваем лимит по device = 1 за 1 час
    state.merchantSettings.set('M-af', {
      ...(state.merchantSettings.get('M-af')!),
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 1,   windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 }
        }
      }
    });

    // Уже есть 1 транзакция от устройства D-vel
    state.transactions.push({ id: uuid(), merchantId: 'M-af', customerId: 'C-dev0', deviceId: 'D-vel', staffId: null, createdAt: new Date() });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-dev1', deviceId: 'D-vel', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-dev-2' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/превышен лимит/);
  });

  it('Staff velocity: блокировка при превышении лимита по staff в окне', async () => {
    state.merchantSettings.set('M-af', {
      ...(state.merchantSettings.get('M-af')!),
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 1,   windowSec: 3600, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 999, windowSec: 3600, dailyCap: 0, weeklyCap: 0 }
        }
      }
    });

    // Уже есть 1 транзакция от сотрудника S-vel
    state.transactions.push({ id: uuid(), merchantId: 'M-af', customerId: 'C-stf0', staffId: 'S-vel', deviceId: null, createdAt: new Date() });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-stf1', staffId: 'S-vel', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-stf-2' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/превышен лимит/);
  });

  it('Merchant velocity: блокировка при превышении лимита по мерчанту', async () => {
    // Отдельный мерчант
    state.merchantSettings.set('M-cap', {
      merchantId: 'M-cap', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false,
      rulesJson: { af: { merchant: { limit: 1, windowSec: 3600, dailyCap: 0, weeklyCap: 0 }, device: { limit: 999, windowSec: 3600 }, staff: { limit: 999, windowSec: 3600 }, customer: { limit: 999, windowSec: 3600 } } },
      updatedAt: new Date()
    });
    state.transactions.push({ id: uuid(), merchantId: 'M-cap', customerId: 'C-x', deviceId: null, staffId: null, createdAt: new Date() });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-cap', userToken: 'C-y', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-m-1' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/превышен лимит/);
  });

  it('Refund device limit: блокировка рефанда по лимиту устройства', async () => {
    // Создаём квоту и коммит без ограничений, чтобы появился чек (мерчант M-ref)
    state.merchantSettings.set('M-ref', { merchantId: 'M-ref', earnBps: 1000, redeemLimitBps: 5000, qrTtlSec: 120, requireStaffKey: false, updatedAt: new Date() });
    const q1 = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-ref', userToken: 'C-ref', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId1 = q1.body.holdId as string;
    await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId: holdId1, orderId: 'O-ref-1' })
      .expect(201);

    // Включаем device.limit=0 (запрещено всё)
    state.merchantSettings.set('M-ref', {
      ...(state.merchantSettings.get('M-ref')!),
      rulesJson: { af: { merchant: { limit: 999, windowSec: 3600 }, device: { limit: 0, windowSec: 3600 }, staff: { limit: 999, windowSec: 3600 }, customer: { limit: 999, windowSec: 3600 } } }
    });

    // Рефанд с deviceId -> должен заблокироваться антифродом
    await request(app.getHttpServer())
      .post('/loyalty/refund')
      .send({ merchantId: 'M-ref', orderId: 'O-ref-1', refundTotal: 100, deviceId: 'D-ref' })
      .expect(429);
  });

  it('Weekly cap: customer_weekly блокировка при превышении недельного капа', async () => {
    // Настраиваем weeklyCap=1
    state.merchantSettings.set('M-af', {
      ...(state.merchantSettings.get('M-af')!),
      rulesJson: {
        af: {
          merchant: { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          device:   { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          staff:    { limit: 999, windowSec: 60, dailyCap: 0, weeklyCap: 0 },
          customer: { limit: 99,  windowSec: 60, dailyCap: 0, weeklyCap: 1 }
        }
      }
    });

    // Предзаполняем 1 транзакцию в пределах недели
    state.transactions.push({ id: uuid(), merchantId: 'M-af', customerId: 'C-week', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), deviceId: null, staffId: null });

    const q = await request(app.getHttpServer())
      .post('/loyalty/quote')
      .send({ merchantId: 'M-af', userToken: 'C-week', mode: 'EARN', total: 1000, eligibleTotal: 1000 })
      .expect(201);
    const holdId = q.body.holdId as string;
    const r = await request(app.getHttpServer())
      .post('/loyalty/commit')
      .send({ holdId, orderId: 'O-w-1' })
      .expect(429);
    expect(String(r.body.message || '')).toMatch(/превышен лимит/);
  });
});
