import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication;
  const envBak = { ...process.env };

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.EARN_LOTS_FEATURE = '1';
    process.env.POINTS_TTL_FEATURE = '1';
    process.env.POINTS_TTL_BURN = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(async () => {}),
        $disconnect: jest.fn(async () => {}),
        $queryRaw: jest.fn(async () => 1),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = { ...envBak };
  });

  it('GET /healthz returns flags reflecting env', async () => {
    const res = await request(app.getHttpServer()).get('/healthz').expect(200);
    expect(res.body.flags).toEqual(
      expect.objectContaining({
        EARN_LOTS_FEATURE: true,
        POINTS_TTL_FEATURE: true,
        POINTS_TTL_BURN: false,
      }),
    );
    expect(res.body).toHaveProperty('workers');
  });
});
