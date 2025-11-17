import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Subscription Controller (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TEST_MERCHANT_ID = 'TEST_SUB_MERCHANT_' + Date.now();
  const TEST_PLAN_ID = 'TEST_PLAN_' + Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);

    await app.init();

    // Создаем тестовый план
    await prisma.plan.create({
      data: {
        id: TEST_PLAN_ID,
        name: 'Test Plan',
        displayName: 'Test Plan',
        price: 1000,
        currency: 'RUB',
        interval: 'month',
        isActive: true,
        maxTransactions: 10000,
        maxCustomers: 1000,
        maxOutlets: 10,
        features: {
          webhooks: true,
          customBranding: false,
          prioritySupport: false,
          apiAccess: true,
        },
      },
    });

    // Создаем тестового мерчанта
    await prisma.merchant.create({
      data: {
        id: TEST_MERCHANT_ID,
        name: 'Test Subscription Merchant',
        initialName: 'Test Subscription Merchant',
        settings: {
          create: {
            earnBps: 500,
            redeemLimitBps: 5000,
            qrTtlSec: 120,
            requireStaffKey: false,
            requireBridgeSig: false,
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Очистка тестовых данных
    await prisma.subscription.deleteMany({
      where: { merchantId: TEST_MERCHANT_ID },
    });
    await prisma.payment.deleteMany({
      where: {
        subscription: {
          merchantId: TEST_MERCHANT_ID,
        },
      },
    });
    await prisma.merchantSettings.delete({
      where: { merchantId: TEST_MERCHANT_ID },
    });
    await prisma.merchant.delete({
      where: { id: TEST_MERCHANT_ID },
    });
    await prisma.plan.delete({
      where: { id: TEST_PLAN_ID },
    });

    await app.close();
  });

  describe('/subscription/plans (GET)', () => {
    it('should return available plans', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscription/plans')
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('price');
    });
  });

  describe('/subscription/create (POST)', () => {
    it('should create a new subscription', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscription/create')
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .send({
          merchantId: TEST_MERCHANT_ID,
          planId: TEST_PLAN_ID,
          trialDays: 7,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('merchantId', TEST_MERCHANT_ID);
      expect(response.body).toHaveProperty('planId', TEST_PLAN_ID);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('trialEnd');
    });

    it('should fail creating duplicate subscription', async () => {
      await request(app.getHttpServer())
        .post('/subscription/create')
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .send({
          merchantId: TEST_MERCHANT_ID,
          planId: TEST_PLAN_ID,
        })
        .expect(400);
    });
  });

  describe('/subscription/:merchantId (GET)', () => {
    it('should get subscription info', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscription/${TEST_MERCHANT_ID}`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('merchantId', TEST_MERCHANT_ID);
      expect(response.body).toHaveProperty('plan');
      expect(response.body.plan).toHaveProperty('name');
    });
  });

  describe('/subscription/:merchantId/feature/:feature (GET)', () => {
    it('should check feature access', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscription/${TEST_MERCHANT_ID}/feature/webhooks`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('feature', 'webhooks');
      expect(response.body).toHaveProperty('hasAccess', true);
    });

    it('should return false for unavailable feature', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscription/${TEST_MERCHANT_ID}/feature/custom_branding`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('feature', 'custom_branding');
      expect(response.body).toHaveProperty('hasAccess', false);
    });
  });

  describe('/subscription/:merchantId/usage (GET)', () => {
    it('should return usage statistics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscription/${TEST_MERCHANT_ID}/usage`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('plan');
      expect(response.body).toHaveProperty('usage');
      expect(response.body.usage).toHaveProperty('transactions');
      expect(response.body.usage).toHaveProperty('customers');
      expect(response.body.usage).toHaveProperty('outlets');
    });
  });

  describe('/subscription/:merchantId (PUT)', () => {
    it('should update subscription metadata', async () => {
      const response = await request(app.getHttpServer())
        .put(`/subscription/${TEST_MERCHANT_ID}`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .send({
          metadata: {
            notes: 'Updated metadata',
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty(
        'notes',
        'Updated metadata',
      );
    });
  });

  describe('/subscription/:merchantId/payments (GET)', () => {
    it('should return payment history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/subscription/${TEST_MERCHANT_ID}/payments`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('/subscription/:merchantId/validate-limits (POST)', () => {
    it('should validate plan limits', async () => {
      const response = await request(app.getHttpServer())
        .post(`/subscription/${TEST_MERCHANT_ID}/validate-limits`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('merchantId', TEST_MERCHANT_ID);
      expect(response.body).toHaveProperty('planId');
    });
  });

  describe('/subscription/:merchantId (DELETE)', () => {
    it('should cancel subscription at period end', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/subscription/${TEST_MERCHANT_ID}`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('cancelAt');
    });

    it('should fail canceling already canceled subscription', async () => {
      await request(app.getHttpServer())
        .delete(`/subscription/${TEST_MERCHANT_ID}`)
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .query({ immediately: true })
        .expect(400);
    });
  });
});
