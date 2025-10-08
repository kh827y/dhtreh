import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('TTL Reconciliation (e2e)', () => {
  let app: INestApplication;

  const state = {
    lots: [] as Array<{
      id: string;
      merchantId: string;
      customerId: string;
      points: number;
      consumedPoints: number;
      earnedAt: Date;
    }>,
    events: [] as Array<{
      id: string;
      merchantId: string;
      eventType: string;
      payload: any;
      createdAt: Date;
    }>,
  };
  const uuid = (() => {
    let i = 1;
    return () => `id-${i++}`;
  })();

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),

    earnLot: {
      findMany: async (args: any) => {
        let arr = state.lots.filter(
          (x) => x.merchantId === args.where.merchantId,
        );
        if (args.where.earnedAt?.lt)
          arr = arr.filter((x) => x.earnedAt < args.where.earnedAt.lt);
        return arr;
      },
    },
    eventOutbox: {
      findMany: async (args: any) => {
        const arr = state.events.filter(
          (x) =>
            x.merchantId === args.where.merchantId &&
            x.eventType === args.where.eventType,
        );
        return arr;
      },
    },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    const cutoff = new Date('2025-01-01T00:00:00.000Z');
    // Lots: C1 has 100 (consumed 20 => remain 80), C2 has 50 (consumed 0 => remain 50)
    state.lots.push({
      id: uuid(),
      merchantId: 'M1',
      customerId: 'C1',
      points: 100,
      consumedPoints: 20,
      earnedAt: new Date('2024-12-01T00:00:00Z'),
    });
    state.lots.push({
      id: uuid(),
      merchantId: 'M1',
      customerId: 'C2',
      points: 50,
      consumedPoints: 0,
      earnedAt: new Date('2024-11-01T00:00:00Z'),
    });
    // Burned events at same cutoff: C1 burned 60, C2 burned 10
    state.events.push({
      id: uuid(),
      merchantId: 'M1',
      eventType: 'loyalty.points_ttl.burned',
      payload: { cutoff: cutoff.toISOString(), customerId: 'C1', amount: 60 },
      createdAt: new Date('2025-01-01T00:01:00Z'),
    });
    state.events.push({
      id: uuid(),
      merchantId: 'M1',
      eventType: 'loyalty.points_ttl.burned',
      payload: { cutoff: cutoff.toISOString(), customerId: 'C2', amount: 10 },
      createdAt: new Date('2025-01-01T00:02:00Z'),
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

  it('GET /merchants/:id/ttl/reconciliation computes totals and diffs', async () => {
    const cutoffISO = '2025-01-01T00:00:00.000Z';
    const res = await request(app.getHttpServer())
      .get(
        `/merchants/M1/ttl/reconciliation?cutoff=${encodeURIComponent(cutoffISO)}`,
      )
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(res.body.merchantId).toBe('M1');
    const items = res.body.items as Array<any>;
    // For C1: expiredRemain=80, burned=60 => diff=20
    const c1 = items.find((i) => i.customerId === 'C1');
    expect(c1).toBeTruthy();
    expect(c1.expiredRemain).toBe(80);
    expect(c1.burned).toBe(60);
    expect(c1.diff).toBe(20);
    // For C2: 50 vs 10 => diff=40
    const c2 = items.find((i) => i.customerId === 'C2');
    expect(c2.expiredRemain).toBe(50);
    expect(c2.burned).toBe(10);
    expect(c2.diff).toBe(40);
  });

  it('GET /merchants/:id/ttl/reconciliation.csv returns CSV', async () => {
    const cutoffISO = '2025-01-01T00:00:00.000Z';
    const res = await request(app.getHttpServer())
      .get(
        `/merchants/M1/ttl/reconciliation.csv?cutoff=${encodeURIComponent(cutoffISO)}`,
      )
      .set('X-Admin-Key', 'test-admin-key')
      .expect(200);
    expect(typeof res.text).toBe('string');
    expect(res.text.split('\n')[0]).toContain(
      'merchantId,cutoff,customerId,expiredRemain,burned,diff',
    );
  });
});
