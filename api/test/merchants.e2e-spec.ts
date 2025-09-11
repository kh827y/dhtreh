import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';

describe('Merchants (e2e)', () => {
  let app: INestApplication;

  const state: Record<string, any> = {};
  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchant: {
      upsert: jest.fn(async (args: any) => ({ id: args.create.id ?? args.where.id, name: args.create?.name || args.where?.id || 'M' })),
      findUnique: jest.fn(async (args: any) => {
        const id = args.where.id;
        const s = state[id]?.settings ?? null;
        return { id, name: id, settings: s };
      }),
    },
    merchantSettings: {
      upsert: jest.fn(async (args: any) => {
        const mId = args.where.merchantId;
        const u = args.update || {};
        const c = args.create || {};
        const res = {
          merchantId: mId,
          earnBps: (u.earnBps ?? c.earnBps) ?? 500,
          redeemLimitBps: (u.redeemLimitBps ?? c.redeemLimitBps) ?? 5000,
          qrTtlSec: (u.qrTtlSec ?? c.qrTtlSec) ?? 120,
          webhookUrl: (u.webhookUrl ?? c.webhookUrl) ?? null,
          webhookSecret: (u.webhookSecret ?? c.webhookSecret) ?? null,
          webhookKeyId: (u.webhookKeyId ?? c.webhookKeyId) ?? null,
          requireBridgeSig: (u.requireBridgeSig ?? c.requireBridgeSig) ?? false,
          bridgeSecret: (u.bridgeSecret ?? c.bridgeSecret) ?? null,
          redeemCooldownSec: (u.redeemCooldownSec ?? c.redeemCooldownSec) ?? 0,
          earnCooldownSec: (u.earnCooldownSec ?? c.earnCooldownSec) ?? 0,
          redeemDailyCap: (u.redeemDailyCap ?? c.redeemDailyCap) ?? null,
          earnDailyCap: (u.earnDailyCap ?? c.earnDailyCap) ?? null,
          requireJwtForQuote: (u.requireJwtForQuote ?? c.requireJwtForQuote) ?? false,
          rulesJson: (u.rulesJson ?? c.rulesJson) ?? null,
          requireStaffKey: (u.requireStaffKey ?? c.requireStaffKey) ?? false,
        } as any;
        state[mId] = { settings: res };
        return res;
      }),
    },
    adminAudit: {
      create: jest.fn(async () => ({})),
    },
  };

  beforeAll(async () => {
    process.env.ADMIN_KEY = 'test-admin-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('PUT /merchants/:id/settings requires admin key (401)', async () => {
    await request(app.getHttpServer())
      .put('/merchants/M-unauth/settings')
      .send({ earnBps: 500, redeemLimitBps: 5000 })
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT /merchants/:id/settings rejects invalid rules with 400', async () => {
    const badRules = [{ if: { weekdayIn: 'not-array' as any }, then: { earnBps: 700 } }];
    await request(app.getHttpServer())
      .put('/merchants/M-1/settings')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ earnBps: 500, redeemLimitBps: 5000, rulesJson: badRules })
      .expect(400);
  });

  it('PUT /merchants/:id/settings accepts valid rules and echoes back', async () => {
    const okRules = [{ if: { channelIn: ['SMART'] }, then: { earnBps: 700 } }];
    const res = await request(app.getHttpServer())
      .put('/merchants/M-1/settings')
      .set('X-Admin-Key', 'test-admin-key')
      .send({ earnBps: 500, redeemLimitBps: 5000, rulesJson: okRules })
      .expect(200);
    expect(res.body.earnBps).toBe(500);
    expect(res.body.rulesJson).toEqual(okRules);
  });

  it('GET /merchants/:id/rules/preview computes server-side values', async () => {
    const rules = [
      { if: { channelIn: ['SMART'] }, then: { earnBps: 700 } },
      { if: { minEligible: 2000 }, then: { redeemLimitBps: 4000 } },
    ];
    // seed in mocked state
    state['M-2'] = { settings: { earnBps: 500, redeemLimitBps: 5000, qrTtlSec: 120, rulesJson: rules } };

    const res = await request(app.getHttpServer())
      .get('/merchants/M-2/rules/preview')
      .set('X-Admin-Key', 'test-admin-key')
      .query({ channel: 'SMART', weekday: '2', eligibleTotal: '1000' })
      .expect(200);
    expect(res.body).toEqual({ earnBps: 700, redeemLimitBps: 5000 });
  });
});
