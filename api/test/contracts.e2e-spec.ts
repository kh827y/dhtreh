import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpErrorFilter } from '../src/core/filters/http-error.filter';
import { CashierGuard } from '../src/core/guards/cashier.guard';
import { SubscriptionGuard } from '../src/core/guards/subscription.guard';
import { AntiFraudGuard } from '../src/core/guards/antifraud.guard';
import { PortalGuard } from '../src/modules/portal-auth/portal.guard';
import { PortalCustomersController } from '../src/modules/portal/controllers/portal-customers.controller';
import { PortalPromocodesController } from '../src/modules/portal/controllers/portal-promocodes.controller';
import { PortalSettingsController } from '../src/modules/portal/controllers/portal-settings.controller';
import { LoyaltyTransactionsController } from '../src/modules/loyalty/controllers/loyalty-transactions.controller';
import { PortalCustomersUseCase } from '../src/modules/portal/use-cases/portal-customers.use-case';
import { PortalPromocodesUseCase } from '../src/modules/portal/use-cases/portal-promocodes.use-case';
import { PortalSettingsUseCase } from '../src/modules/portal/use-cases/portal-settings.use-case';
import { LoyaltyTransactionsUseCase } from '../src/modules/loyalty/use-cases/loyalty-transactions.use-case';

type HttpServer = Parameters<typeof request>[0];
type PortalRequest = { portalMerchantId?: string };
type ErrorBody = {
  error: string;
  code: string;
  message: string;
  statusCode: number;
  path: string;
  timestamp: string;
  requestId: string;
  details?: unknown;
};

const allowGuard = { canActivate: () => true };

const allowPortalGuard = {
  canActivate: (ctx: {
    switchToHttp: () => { getRequest: () => PortalRequest };
  }) => {
    const req = ctx.switchToHttp().getRequest();
    req.portalMerchantId = 'merchant_test';
    return true;
  },
};

const getServer = (app: INestApplication): HttpServer =>
  app.getHttpServer() as unknown as HttpServer;

const makeErrorExpectations = (
  body: unknown,
  path: string,
  requestId: string,
) => {
  const errorBody = body as Partial<ErrorBody>;
  const anyString = expect.any(String) as unknown as string;
  const anyNumber = expect.any(Number) as unknown as number;
  expect(errorBody).toEqual(
    expect.objectContaining({
      error: anyString,
      code: anyString,
      message: anyString,
      statusCode: anyNumber,
      path,
      timestamp: anyString,
      requestId,
    }),
  );
  expect(Array.isArray(errorBody.details)).toBe(true);
};

describe('Contracts (critical endpoints)', () => {
  let app: INestApplication;

  const loyaltyTransactionsUseCase = {
    quote: jest.fn().mockResolvedValue({
      canRedeem: true,
      discountToApply: 0,
      pointsToBurn: 0,
      finalPayable: 100,
    }),
    commit: jest.fn().mockResolvedValue({
      ok: true,
      receiptId: 'receipt_1',
      redeemApplied: 0,
      earnApplied: 10,
    }),
    refund: jest.fn().mockResolvedValue({
      ok: true,
      share: 1,
      pointsRestored: 10,
      pointsRevoked: 0,
    }),
  };

  const portalCustomersUseCase = {
    createCustomer: jest.fn().mockResolvedValue({
      id: 'cust_1',
      phone: '+79990001122',
      email: null,
      name: null,
      firstName: null,
      lastName: null,
      birthday: null,
      gender: null,
      tags: [],
      balance: 0,
      pendingBalance: 0,
      visits: 0,
      averageCheck: 0,
      daysSinceLastVisit: null,
      visitFrequencyDays: null,
      age: null,
      spendPreviousMonth: 0,
      spendCurrentMonth: 0,
      spendTotal: 0,
      registeredAt: null,
      createdAt: null,
      erasedAt: null,
      comment: null,
      accrualsBlocked: false,
      redemptionsBlocked: false,
    }),
  };

  const portalPromocodesUseCase = {
    promocodesIssue: jest.fn().mockResolvedValue({
      ok: true,
      promoCodeId: 'promo_1',
    }),
  };

  const portalSettingsUseCase = {
    getSettings: jest.fn().mockResolvedValue({
      merchantId: 'merchant_test',
      earnBps: 300,
      redeemLimitBps: 5000,
      qrTtlSec: 300,
      webhookUrl: null,
      webhookSecret: null,
      webhookKeyId: null,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      maxOutlets: null,
      requireJwtForQuote: false,
      rulesJson: null,
      pointsTtlDays: null,
      earnDelayDays: null,
      telegramBotToken: null,
      telegramBotUsername: null,
      telegramStartParamRequired: false,
      miniappBaseUrl: null,
      miniappThemePrimary: null,
      miniappThemeBg: null,
      miniappLogoUrl: null,
      outboxPausedUntil: null,
      timezone: 'МСК+0',
    }),
    updateSettings: jest.fn().mockResolvedValue({
      merchantId: 'merchant_test',
      earnBps: 400,
      redeemLimitBps: 5000,
      qrTtlSec: 300,
      webhookUrl: null,
      webhookSecret: null,
      webhookKeyId: null,
      redeemCooldownSec: 0,
      earnCooldownSec: 0,
      redeemDailyCap: null,
      earnDailyCap: null,
      maxOutlets: null,
      requireJwtForQuote: false,
      rulesJson: null,
      pointsTtlDays: null,
      earnDelayDays: null,
      telegramBotToken: null,
      telegramBotUsername: null,
      telegramStartParamRequired: false,
      miniappBaseUrl: null,
      miniappThemePrimary: null,
      miniappThemeBg: null,
      miniappLogoUrl: null,
      outboxPausedUntil: null,
      timezone: 'МСК+0',
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PortalCustomersController,
        PortalPromocodesController,
        PortalSettingsController,
        LoyaltyTransactionsController,
      ],
      providers: [
        { provide: PortalCustomersUseCase, useValue: portalCustomersUseCase },
        { provide: PortalPromocodesUseCase, useValue: portalPromocodesUseCase },
        { provide: PortalSettingsUseCase, useValue: portalSettingsUseCase },
        {
          provide: LoyaltyTransactionsUseCase,
          useValue: loyaltyTransactionsUseCase,
        },
      ],
    })
      .overrideGuard(PortalGuard)
      .useValue(allowPortalGuard)
      .overrideGuard(CashierGuard)
      .useValue(allowGuard)
      .overrideGuard(SubscriptionGuard)
      .useValue(allowGuard)
      .overrideGuard(AntiFraudGuard)
      .useValue(allowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loyalty quote: success contract', async () => {
    const res = await request(getServer(app)).post('/loyalty/quote').send({
      mode: 'redeem',
      merchantId: 'm1',
      userToken: 'c1',
      orderId: 'o1',
      total: 100,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        canRedeem: true,
        discountToApply: 0,
        pointsToBurn: 0,
        finalPayable: 100,
      }),
    );
  });

  it('loyalty quote: validation error format', async () => {
    const requestId = 'req-loyalty-1';
    const res = await request(getServer(app))
      .post('/loyalty/quote')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/loyalty/quote', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });

  it('portal customers: success contract', async () => {
    const res = await request(getServer(app))
      .post('/portal/customers')
      .send({ phone: '+79990001122' });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: 'cust_1',
        phone: '+79990001122',
        balance: 0,
      }),
    );
  });

  it('portal customers: validation error format', async () => {
    const requestId = 'req-portal-customers-1';
    const res = await request(getServer(app))
      .post('/portal/customers')
      .set('x-request-id', requestId)
      .send({ email: 123 });
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/portal/customers', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });

  it('portal promocodes: success contract', async () => {
    const res = await request(getServer(app))
      .post('/portal/promocodes/issue')
      .send({ code: 'WELCOME', points: 100 });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({ ok: true, promoCodeId: 'promo_1' }),
    );
  });

  it('portal promocodes: validation error format', async () => {
    const requestId = 'req-portal-promos-1';
    const res = await request(getServer(app))
      .post('/portal/promocodes/issue')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/portal/promocodes/issue', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });

  it('loyalty commit: success contract', async () => {
    const res = await request(getServer(app)).post('/loyalty/commit').send({
      merchantId: 'm1',
      holdId: 'hold_1',
      orderId: 'order_1',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        receiptId: 'receipt_1',
        redeemApplied: 0,
        earnApplied: 10,
      }),
    );
  });

  it('loyalty commit: validation error format', async () => {
    const requestId = 'req-loyalty-commit-1';
    const res = await request(getServer(app))
      .post('/loyalty/commit')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/loyalty/commit', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });

  it('loyalty refund: success contract', async () => {
    const res = await request(getServer(app)).post('/loyalty/refund').send({
      merchantId: 'm1',
      invoice_num: 'inv_1',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        share: 1,
        pointsRestored: 10,
        pointsRevoked: 0,
      }),
    );
  });

  it('loyalty refund: validation error format', async () => {
    const requestId = 'req-loyalty-refund-1';
    const res = await request(getServer(app))
      .post('/loyalty/refund')
      .set('x-request-id', requestId)
      .send({});
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/loyalty/refund', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });

  it('portal settings: update success contract', async () => {
    const res = await request(getServer(app))
      .put('/portal/settings')
      .send({ earnBps: 400 });
    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        merchantId: 'merchant_test',
        earnBps: 400,
        redeemLimitBps: 5000,
      }),
    );
  });

  it('portal settings: validation error format', async () => {
    const requestId = 'req-portal-settings-1';
    const res = await request(getServer(app))
      .put('/portal/settings')
      .set('x-request-id', requestId)
      .send({ earnBps: -1 });
    expect(res.status).toBe(400);
    makeErrorExpectations(res.body, '/portal/settings', requestId);
    const body = res.body as ErrorBody;
    expect(body.code).toBe('BadRequest');
  });
});
