import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import crypto from 'crypto';

describe('Evotor integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    process.env.EVOTOR_WEBHOOK_SECRET = 'evotor_secret';
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => { await app.close(); });

  it('webhook writes SyncLog and updates lastSync', async () => {
    const merchantId = 'M-evotor';
    const integrationId = 'INT-EVO-1';
    // ensure merchant exists
    try { await prisma.merchant.create({ data: { id: merchantId, name: 'Shop' } }); } catch {}
    // cleanup from previous runs (idempotent)
    try { await (prisma as any).syncLog.deleteMany({ where: { integrationId } }); } catch {}
    try { await (prisma as any).integration.delete({ where: { id: integrationId } }); } catch {}
    // create or update integration deterministically
    await (prisma as any).integration.upsert({
      where: { id: integrationId },
      create: { id: integrationId, merchantId, type: 'POS', provider: 'EVOTOR', config: {}, credentials: {}, isActive: true },
      update: { merchantId, isActive: true },
    });

    const webhook = {
      id: 'w1',
      timestamp: new Date().toISOString(),
      type: 'custom.event',
      data: { hello: 'world' },
      signature: '',
    };
    webhook.signature = crypto.createHmac('sha256', process.env.EVOTOR_WEBHOOK_SECRET as string)
      .update(JSON.stringify(webhook.data))
      .digest('hex');

    const res = await request(app.getHttpServer())
      .post(`/integrations/evotor/webhook/${integrationId}`)
      .send(webhook);

    expect([200,201]).toContain(res.status);
    expect(res.body).toEqual({ success: true });

    const logs = await (prisma as any).syncLog.findMany({ where: { integrationId }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].status).toBe('ok');
    expect(logs[0].provider).toBe('EVOTOR');

    const integration = await (prisma as any).integration.findUnique({ where: { id: integrationId } });
    expect(integration?.lastSync).toBeTruthy();

    const metrics = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(metrics.text).toContain('pos_webhooks_total{provider="EVOTOR"}');
  });
});
