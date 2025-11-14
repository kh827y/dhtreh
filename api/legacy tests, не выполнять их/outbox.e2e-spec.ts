import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

type Outbox = {
  id: string;
  merchantId: string;
  eventType: string;
  payload: any;
  status: string;
  retries: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('Merchants Outbox (e2e)', () => {
  let app: INestApplication;

  const state = {
    outbox: [] as Outbox[],
    settings: new Map<string, any>(),
  };
  const uuid = (() => {
    let i = 1;
    return () => `id-${i++}`;
  })();

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),

    merchantSettings: {
      update: async (args: any) => {
        const id = args.where.merchantId;
        const ex = state.settings.get(id) || { merchantId: id };
        const u = { ...ex, ...args.data };
        state.settings.set(id, u);
        return u;
      },
    },

    eventOutbox: {
      findMany: async (args: any) => {
        let arr = state.outbox.filter(
          (x) =>
            !args?.where?.merchantId || x.merchantId === args.where.merchantId,
        );
        if (args?.where?.status)
          arr = arr.filter((x) => x.status === args.where.status);
        if (args?.where?.createdAt?.gte)
          arr = arr.filter((x) => x.createdAt >= args.where.createdAt.gte);
        if (args?.orderBy?.createdAt === 'desc')
          arr = arr
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (args?.orderBy?.createdAt === 'asc')
          arr = arr
            .slice()
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (args?.take) arr = arr.slice(0, args.take);
        return arr;
      },
      findFirst: async (args: any) => {
        const list = await prismaMock.eventOutbox.findMany({
          where: args?.where,
          orderBy: args?.orderBy,
          take: 1,
        });
        return list[0] || null;
      },
      findUnique: async (args: any) =>
        state.outbox.find((x) => x.id === args.where.id) || null,
      update: async (args: any) => {
        const i = state.outbox.findIndex((x) => x.id === args.where.id);
        if (i < 0) return null;
        state.outbox[i] = {
          ...state.outbox[i],
          ...args.data,
          updatedAt: new Date(),
        };
        return state.outbox[i];
      },
      updateMany: async (args: any) => {
        let count = 0;
        for (const it of state.outbox) {
          if (
            args?.where?.merchantId &&
            it.merchantId !== args.where.merchantId
          )
            continue;
          if (args?.where?.status && it.status !== args.where.status) continue;
          if (
            args?.where?.createdAt?.gte &&
            it.createdAt < args.where.createdAt.gte
          )
            continue;
          Object.assign(it, args.data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
      delete: async (args: any) => {
        const idx = state.outbox.findIndex((x) => x.id === args.where.id);
        if (idx >= 0) state.outbox.splice(idx, 1);
        return { ok: true };
      },
      count: async (args: any) =>
        (await prismaMock.eventOutbox.findMany(args)).length,
      groupBy: async (args: any) => {
        const arr = await prismaMock.eventOutbox.findMany(args);
        const map = new Map<string, number>();
        for (const it of arr)
          map.set(it.eventType, (map.get(it.eventType) || 0) + 1);
        return Array.from(map.entries()).map(([eventType, n]) => ({
          eventType,
          _count: { eventType: n },
        }));
      },
    },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    state.settings.set('M1', { merchantId: 'M1' });
    const now = new Date();
    state.outbox.push({
      id: uuid(),
      merchantId: 'M1',
      eventType: 'loyalty.commit',
      payload: { orderId: 'order1' },
      status: 'PENDING',
      retries: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
    state.outbox.push({
      id: uuid(),
      merchantId: 'M1',
      eventType: 'loyalty.refund',
      payload: { orderId: 'order2' },
      status: 'FAILED',
      retries: 1,
      nextRetryAt: null,
      lastError: 'oops',
      createdAt: new Date(now.getTime() - 3600_000),
      updatedAt: now,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires admin key', async () => {
    await request(app.getHttpServer()).get('/merchants/M1/outbox').expect(401);
  });

  it('lists outbox items', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/outbox')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('get event by id', async () => {
    const id = state.outbox[0].id;
    const res = await request(app.getHttpServer())
      .get(`/merchants/M1/outbox/event/${id}`)
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(res.body.id).toBe(id);
  });

  it('retry single event', async () => {
    const id = state.outbox[1].id;
    await request(app.getHttpServer())
      .post(`/merchants/M1/outbox/${id}/retry`)
      .set('X-Admin-Key', 'test-admin-key')
      .expect(201);
  });

  it('retryAll by status', async () => {
    const res = await request(app.getHttpServer())
      .post('/merchants/M1/outbox/retryAll?status=FAILED')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(201);
    expect(res.body.updated).toBeGreaterThanOrEqual(0);
  });

  it('retrySince (body)', async () => {
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const res = await request(app.getHttpServer())
      .post('/merchants/M1/outbox/retrySince')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ status: 'PENDING', since })
      .expect(201);
    expect(res.body.updated).toBeGreaterThanOrEqual(0);
  });

  it('delete event', async () => {
    const id = state.outbox[0].id;
    await request(app.getHttpServer())
      .delete(`/merchants/M1/outbox/${id}`)
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
  });

  it('pause and resume', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/merchants/M1/outbox/pause')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ minutes: 5 })
      .expect(201);
    expect(res1.body.ok).toBe(true);
    const res2 = await request(app.getHttpServer())
      .post('/merchants/M1/outbox/resume')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(201);
    expect(res2.body.ok).toBe(true);
  });

  it('stats returns counts and typeCounts', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/outbox/stats')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(res.body.merchantId).toBe('M1');
    expect(res.body.counts).toBeDefined();
  });

  it('by-order returns only matching events', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/outbox/by-order?orderId=order2')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((e: any) => e.payload?.orderId === 'order2')).toBe(
      true,
    );
  });

  it('csv export returns text/csv', async () => {
    const res = await request(app.getHttpServer())
      .get('/merchants/M1/outbox.csv')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(typeof res.text).toBe('string');
    expect(res.text.split('\n')[0]).toContain('id,eventType,status');
  });
});
