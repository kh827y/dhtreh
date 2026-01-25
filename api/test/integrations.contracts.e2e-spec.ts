import {
  INestApplication,
  ValidationPipe,
  ConflictException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpErrorFilter } from '../src/core/filters/http-error.filter';
import { IntegrationsLoyaltyController } from '../src/modules/integrations/integrations-loyalty.controller';
import { IntegrationApiKeyGuard } from '../src/modules/integrations/integration-api-key.guard';
import { LoyaltyService } from '../src/modules/loyalty/services/loyalty.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { LookupCacheService } from '../src/core/cache/lookup-cache.service';
import { AppConfigService } from '../src/core/config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

const allowIntegrationGuard = {
  canActivate: (ctx: { switchToHttp: () => { getRequest: () => any } }) => {
    const req = ctx.switchToHttp().getRequest();
    req.integrationMerchantId = 'merchant_int';
    req.integrationId = 'integration_1';
    return true;
  },
};

const makeErrorExpectations = (
  body: any,
  path: string,
  requestId: string,
  opts?: { requireDetails?: boolean },
) => {
  const requireDetails = opts?.requireDetails ?? true;
  expect(body).toEqual(
    expect.objectContaining({
      error: expect.any(String),
      code: expect.any(String),
      message: expect.any(String),
      statusCode: expect.any(Number),
      path,
      timestamp: expect.any(String),
      requestId,
    }),
  );
  if (requireDetails) {
    expect(Array.isArray(body.details)).toBe(true);
  }
};

describe('Integrations contracts', () => {
  let app: INestApplication;
  let prisma: {
    customer: { findUnique: MockFn };
    qrNonce: { findUnique: MockFn; delete: MockFn };
    device: { findFirst: MockFn };
    receipt: { findFirst: MockFn; findMany: MockFn };
    syncLog: { create: MockFn };
  };
  let cache: {
    getMerchantSettings: MockFn;
    getOutlet: MockFn;
    getStaff: MockFn;
  };
  let loyalty: {
    calculateAction: MockFn;
    calculateBonusPreview: MockFn;
    processIntegrationBonus: MockFn;
    refund: MockFn;
    balance: MockFn;
    getBaseRatesForCustomer: MockFn;
    getCustomerAnalytics: MockFn;
  };

  beforeAll(async () => {
    prisma = {
      customer: { findUnique: jest.fn() },
      qrNonce: { findUnique: jest.fn(), delete: jest.fn() },
      device: { findFirst: jest.fn() },
      receipt: { findFirst: jest.fn(), findMany: jest.fn() },
      syncLog: { create: jest.fn() },
    };
    cache = {
      getMerchantSettings: jest.fn(),
      getOutlet: jest.fn(),
      getStaff: jest.fn(),
    };
    loyalty = {
      calculateAction: jest.fn(),
      calculateBonusPreview: jest.fn(),
      processIntegrationBonus: jest.fn(),
      refund: jest.fn(),
      balance: jest.fn(),
      getBaseRatesForCustomer: jest.fn(),
      getCustomerAnalytics: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [IntegrationsLoyaltyController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: LookupCacheService, useValue: cache },
        { provide: LoyaltyService, useValue: loyalty },
        AppConfigService,
      ],
    })
      .overrideGuard(IntegrationApiKeyGuard)
      .useValue(allowIntegrationGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    const baseCustomer = {
      id: 'cust-1',
      merchantId: 'merchant_int',
      externalId: 'ext-1',
      name: 'Test Customer',
      phone: '+79990000000',
      email: null,
      birthday: null,
      profileBirthDate: null,
      accrualsBlocked: false,
      redemptionsBlocked: false,
    };
    const altCustomer = { ...baseCustomer, id: 'cust-2' };

    prisma.customer.findUnique.mockImplementation(({ where }) => {
      if (where?.id === 'cust-1') return baseCustomer;
      if (where?.id === 'cust-2') return altCustomer;
      if (where?.merchantId_phone) return baseCustomer;
      return null;
    });
    prisma.qrNonce.findUnique.mockImplementation(({ where }) => {
      if (where?.jti !== '123456789') return null;
      return {
        jti: '123456789',
        customerId: 'cust-1',
        merchantId: 'merchant_int',
        issuedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      };
    });
    prisma.device.findFirst.mockResolvedValue({
      id: 'dev-1',
      outletId: 'out-1',
    });
    prisma.receipt.findFirst.mockResolvedValue({
      id: 'receipt-1',
      orderId: 'inv-1',
      outletId: 'out-1',
      customerId: 'cust-1',
      merchantId: 'merchant_int',
    });
    prisma.receipt.findMany.mockResolvedValue([
      {
        id: 'receipt-1',
        orderId: 'inv-1',
        outletId: 'out-1',
        customerId: 'cust-1',
        merchantId: 'merchant_int',
      },
    ]);

    cache.getMerchantSettings.mockResolvedValue({ requireJwtForQuote: false });
    cache.getOutlet.mockResolvedValue({ id: 'out-1' });
    cache.getStaff.mockResolvedValue({
      id: 'staff-1',
      allowedOutletId: 'out-1',
      accessOutletIds: ['out-1'],
    });

    loyalty.calculateAction.mockResolvedValue({ points_to_award: 10 });
    loyalty.calculateBonusPreview.mockResolvedValue({
      canRedeem: true,
      discountToApply: 10,
      pointsToBurn: 20,
      finalPayable: 90,
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      invoiceNum: 'inv-1',
      orderId: 'order-1',
      redeemApplied: 0,
      earnApplied: 10,
    });
    loyalty.refund.mockResolvedValue({
      pointsRestored: 10,
      pointsRevoked: 0,
      customerId: 'cust-1',
    });
    loyalty.balance.mockResolvedValue({ balance: 50 });
    loyalty.getBaseRatesForCustomer.mockResolvedValue({
      earnPercent: 5,
      redeemLimitPercent: 20,
    });
    loyalty.getCustomerAnalytics.mockResolvedValue({
      avgBill: 100,
      visitFrequencyDays: 30,
      visitCount: 2,
      totalAmount: 200,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('integrations code: success contract', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/integrations/code')
      .send({ user_token: '123456789' });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        type: 'bonus',
        client: expect.objectContaining({
          id_client: 'cust-1',
          id_ext: 'ext-1',
          balance: 50,
        }),
      }),
    );
  });

  it('integrations code: validation error format', async () => {
    const requestId = 'req-int-code-1';
    const res = await request(app.getHttpServer())
      .post('/api/integrations/code')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/api/integrations/code', requestId);
    expect(res.body.code).toBe('BadRequest');
  });

  it('integrations calculate action: success contract', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/integrations/calculate/action')
      .send({
        id_client: 'cust-1',
        items: [{ id_product: 'prod-1', qty: 1, price: 100 }],
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'ok', points_to_award: 10 }),
    );
  });

  it('integrations calculate action: validation error format', async () => {
    const requestId = 'req-int-action-1';
    const res = await request(app.getHttpServer())
      .post('/api/integrations/calculate/action')
      .set('x-request-id', requestId)
      .send({ items: [] });
    expect(res.status).toBe(400);
    makeErrorExpectations(
      res.body,
      '/api/integrations/calculate/action',
      requestId,
    );
    expect(res.body.code).toBe('BadRequest');
  });

  it('integrations calculate bonus: success contract', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/integrations/calculate/bonus')
      .send({ id_client: 'cust-1', total: 200 });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        canRedeem: true,
        finalPayable: 90,
      }),
    );
  });

  it('integrations calculate bonus: validation error format', async () => {
    const requestId = 'req-int-bonus-1';
    const res = await request(app.getHttpServer())
      .post('/api/integrations/calculate/bonus')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(
      res.body,
      '/api/integrations/calculate/bonus',
      requestId,
    );
    expect(res.body.code).toBe('BadRequest');
  });

  it('integrations bonus: success contract', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .send({
        id_client: 'cust-1',
        idempotency_key: 'idem-1',
        total: 100,
        device_id: 'dev-1',
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        result: 'ok',
        invoice_num: 'inv-1',
        order_id: 'order-1',
        redeem_applied: 0,
        earn_applied: 10,
      }),
    );
  });

  it('integrations bonus: idempotency repeat same customer', async () => {
    const seen = new Map<string, { customerId: string; orderId: string }>();
    loyalty.processIntegrationBonus.mockImplementation(async (payload) => {
      const key = payload.idempotencyKey;
      const existing = seen.get(key);
      if (existing) {
        return {
          invoiceNum: 'inv-1',
          orderId: existing.orderId,
          redeemApplied: 0,
          earnApplied: 10,
        };
      }
      const orderId = `order-${key}`;
      seen.set(key, { customerId: payload.customerId, orderId });
      return {
        invoiceNum: 'inv-1',
        orderId,
        redeemApplied: 0,
        earnApplied: 10,
      };
    });

    const first = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .send({
        id_client: 'cust-1',
        idempotency_key: 'idem-repeat',
        total: 100,
        device_id: 'dev-1',
      });
    const second = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .send({
        id_client: 'cust-1',
        idempotency_key: 'idem-repeat',
        total: 100,
        device_id: 'dev-1',
      });

    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    expect(second.body.order_id).toBe(first.body.order_id);
  });

  it('integrations bonus: idempotency conflict', async () => {
    const seen = new Map<string, { customerId: string; orderId: string }>();
    loyalty.processIntegrationBonus.mockImplementation(async (payload) => {
      const key = payload.idempotencyKey;
      const existing = seen.get(key);
      if (existing && existing.customerId !== payload.customerId) {
        throw new ConflictException('idempotency_key conflict');
      }
      if (existing) {
        return {
          invoiceNum: 'inv-1',
          orderId: existing.orderId,
          redeemApplied: 0,
          earnApplied: 10,
        };
      }
      const orderId = `order-${key}`;
      seen.set(key, { customerId: payload.customerId, orderId });
      return {
        invoiceNum: 'inv-1',
        orderId,
        redeemApplied: 0,
        earnApplied: 10,
      };
    });

    const first = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .send({
        id_client: 'cust-1',
        idempotency_key: 'idem-conflict',
        total: 100,
        device_id: 'dev-1',
      });
    expect([200, 201]).toContain(first.status);

    const requestId = 'req-int-idem-conflict';
    const second = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .set('x-request-id', requestId)
      .send({
        id_client: 'cust-2',
        idempotency_key: 'idem-conflict',
        total: 100,
        device_id: 'dev-1',
      });
    expect(second.status).toBe(409);
    makeErrorExpectations(second.body, '/api/integrations/bonus', requestId, {
      requireDetails: false,
    });
    expect(second.body.code).toBe('Conflict');
  });

  it('integrations bonus: validation error format', async () => {
    const requestId = 'req-int-bonus-2';
    const res = await request(app.getHttpServer())
      .post('/api/integrations/bonus')
      .set('x-request-id', requestId)
      .send({ id_client: 'cust-1', device_id: 'dev-1' });
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/api/integrations/bonus', requestId);
    expect(res.body.code).toBe('BadRequest');
  });

  it('integrations refund: success contract', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/integrations/refund')
      .send({ order_id: 'receipt-1', device_id: 'dev-1' });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        result: 'ok',
        invoice_num: 'inv-1',
        order_id: 'receipt-1',
        points_restored: 10,
        points_revoked: 0,
        balance_after: 50,
      }),
    );
  });

  it('integrations refund: validation error format', async () => {
    const requestId = 'req-int-refund-1';
    const res = await request(app.getHttpServer())
      .post('/api/integrations/refund')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/api/integrations/refund', requestId, {
      requireDetails: false,
    });
    expect(res.body.code).toBe('BadRequest');
  });
});
