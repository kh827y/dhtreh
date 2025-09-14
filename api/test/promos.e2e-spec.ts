import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('Promos (e2e)', () => {
  let app: INestApplication;

  const state = {
    settings: new Map<string, any>(),
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchantSettings: {
      findUnique: async (args: any) => state.settings.get(args.where.merchantId) || null,
    },
  };

  beforeAll(async () => {
    // Configure promo rules
    state.settings.set('M1', { merchantId: 'M1', rulesJson: {
      promos: [
        { name: 'WELCOME10', if: { minEligible: 1000 }, then: { discountFixed: 100 } },
        { name: 'CAT-ELECTRO-5', if: { categoryIn: ['electronics'], minEligible: 500 }, then: { discountPct: 5 } },
      ]
    }});

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('preview applies best discount among rules', async () => {
    // eligibleTotal 2000: fixed 100 vs pct 5% (category electronics)
    const r = await request(app.getHttpServer())
      .post('/promos/preview')
      .send({ merchantId: 'M1', customerId: 'C1', eligibleTotal: 2000, category: 'electronics' })
      .expect(201);
    // 5% of 2000 = 100 => tie with fixed 100; best = 100
    expect(r.body.canApply).toBe(true);
    expect(r.body.discount).toBe(100);
  });

  it('preview returns no match when below thresholds', async () => {
    const r = await request(app.getHttpServer())
      .post('/promos/preview')
      .send({ merchantId: 'M1', customerId: 'C1', eligibleTotal: 400, category: 'grocery' })
      .expect(201);
    expect(r.body.canApply).toBe(false);
    expect(r.body.discount).toBe(0);
  });
});
