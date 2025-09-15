import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('Notifications API (e2e)', () => {
  let app: INestApplication;
  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    eventOutbox: { create: jest.fn(async () => ({ id: 'E1' })) },
    adminAudit: { create: jest.fn(async () => ({ id: 'A1' })) },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('rejects without admin key', async () => {
    await request(app.getHttpServer())
      .post('/notifications/broadcast')
      .send({ merchantId: 'M1', channel: 'ALL', dryRun: true })
      .expect(401);
  });

  it('accepts with admin key (dry-run)', async () => {
    const res = await request(app.getHttpServer())
      .post('/notifications/broadcast')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ merchantId: 'M1', channel: 'ALL', dryRun: true, template: { subject: 'Hello', text: 'World' } });
    expect([200,201]).toContain(res.status);
    expect(typeof res.body).toBe('object');
    expect(res.body.ok).toBe(true);
    expect(res.body.dryRun).toBe(true);
    // AdminAudit should be attempted (controller wraps in try/catch, but with mock defined it should be called)
    expect(prismaMock.adminAudit.create).toHaveBeenCalled();
    const args = prismaMock.adminAudit.create.mock.calls[0]?.[0]?.data;
    expect(args?.path).toBe('/notifications/broadcast');
  });

  it('test endpoint enqueues', async () => {
    const res = await request(app.getHttpServer())
      .post('/notifications/test')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ merchantId: 'M1', channel: 'SMS', to: '+70000000000', template: { text: 'hi' } });
    expect([200,201]).toContain(res.status);
    expect(res.body.ok).toBe(true);
    expect(prismaMock.adminAudit.create).toHaveBeenCalled();
    const args = prismaMock.adminAudit.create.mock.calls.find((c:any[])=>c?.[0]?.data?.path==='/notifications/test')?.[0]?.data;
    expect(args?.path).toBe('/notifications/test');
  });

  it('broadcast non-dry-run enqueues with segment and template/variables', async () => {
    prismaMock.eventOutbox.create.mockClear();
    const payload = {
      merchantId: 'M1',
      channel: 'EMAIL',
      segmentId: 'SEG-1',
      template: { subject: 'Hello {{merchantName}}', text: 'Hi {{customerName}}' },
      variables: { merchantName: 'Shop' },
      dryRun: false,
    };
    const res = await request(app.getHttpServer())
      .post('/notifications/broadcast')
      .set('X-Admin-Key', 'test-admin-key')
      .send(payload);
    expect([200,201]).toContain(res.status);
    expect(res.body.ok).toBe(true);
    // Ensure outbox enqueue happened with expected payload bits
    expect(prismaMock.eventOutbox.create).toHaveBeenCalled();
    const callArg = prismaMock.eventOutbox.create.mock.calls[0]?.[0];
    const data = callArg?.data;
    expect(data?.eventType).toBe('notify.broadcast');
    expect(data?.payload?.merchantId).toBe('M1');
    expect(data?.payload?.channel).toBe('EMAIL');
    expect(data?.payload?.segmentId).toBe('SEG-1');
    expect(data?.payload?.template?.subject).toContain('Hello');
    expect(data?.payload?.variables?.merchantName).toBe('Shop');
  });
});
