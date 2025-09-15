import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('ModulKassa integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => { await app.close(); });

  it('webhook creates SyncLog and exports pos_webhooks_total metric', async () => {
    await (prisma as any).syncLog.deleteMany({ where: { provider: 'MODULKASSA' } });

    const payload = { event: 'payment.succeeded', id: 'mk-1' };
    const res = await request(app.getHttpServer())
      .post('/integrations/modulkassa/webhook')
      .send(payload)
      .expect(201);
    expect(res.body).toEqual({ ok: true });

    const logs = await (prisma as any).syncLog.findMany({ where: { provider: 'MODULKASSA' }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].status).toBe('ok');

    const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(metrics.text).toContain('pos_webhooks_total{provider="MODULKASSA"}');
  });
});
