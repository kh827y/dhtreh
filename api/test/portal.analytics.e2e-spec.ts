jest.mock('@prisma/client', () => {
  const makeEnum = (values: string[]) =>
    values.reduce((acc, key) => {
      acc[key] = key;
      return acc;
    }, {} as Record<string, string>);

  return {
    PrismaClient: class {},
    StaffStatus: makeEnum(['ACTIVE', 'PENDING']),
    StaffRole: makeEnum(['MANAGER', 'CASHIER']),
    AccessScope: makeEnum(['PORTAL', 'CASHIER']),
    StaffOutletAccessStatus: makeEnum(['ACTIVE', 'REVOKED']),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { getJose } from './../src/loyalty/token.util';
import { AnalyticsService } from './../src/analytics/analytics.service';
import { PrismaService } from './../src/prisma.service';

/**
 * Smoke-тест портальных аналитических эндпоинтов через PortalGuard
 */
describe('Portal Analytics (e2e smoke)', () => {
  let app: INestApplication;
  let token: string;

  const analyticsStub: Partial<AnalyticsService> = {
    async getBirthdays() { return []; },
    async getDashboard() {
      return {
        revenue: { totalRevenue: 0, averageCheck: 0, transactionCount: 0, revenueGrowth: 0, hourlyDistribution: [], dailyRevenue: [] },
        customers: { totalCustomers: 0, newCustomers: 0, activeCustomers: 0, churnRate: 0, retentionRate: 100, customerLifetimeValue: 0, averageVisitsPerCustomer: 0, topCustomers: [] },
        loyalty: { totalPointsIssued: 0, totalPointsRedeemed: 0, pointsRedemptionRate: 0, averageBalance: 0, activeWallets: 0, programROI: 0, conversionRate: 0 },
        campaigns: { activeCampaigns: 0, campaignROI: 0, totalRewardsIssued: 0, campaignConversion: 0, topCampaigns: [] },
        operations: { topOutlets: [], topStaff: [], peakHours: [], outletUsage: [] },
      };
    },
  } as any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.WORKERS_ENABLED = '0';
    process.env.METRICS_DEFAULTS = '0';
    process.env.PORTAL_JWT_SECRET = 'test-portal-secret';

    const prismaMock: any = {
      $connect: jest.fn(async () => {}),
      $disconnect: jest.fn(async () => {}),
      transaction: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _sum: { amount: 0 }, _count: 0 })) },
      wallet: { count: jest.fn(async () => 0), aggregate: jest.fn(async () => ({ _avg: { balance: 0 } })) },
      receipt: { groupBy: jest.fn(async () => []) },
      customerStats: { findMany: jest.fn(async () => []) },
      loyaltyPromotion: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
      segmentCustomer: { count: jest.fn(async () => 0) },
      outlet: { findMany: jest.fn(async () => []) },
      customer: { findMany: jest.fn(async () => []) },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnalyticsService)
      .useValue(analyticsStub)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const { SignJWT } = await getJose();
    const now = Math.floor(Date.now() / 1000);
    token = await new SignJWT({ sub: 'M-ana', role: 'MERCHANT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(process.env.PORTAL_JWT_SECRET!));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /portal/analytics/birthdays returns 200 and array', async () => {
    const res = await request(app.getHttpServer())
      .get('/portal/analytics/birthdays?withinDays=30&limit=10')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /portal/analytics/dashboard returns structure', async () => {
    const res = await request(app.getHttpServer())
      .get('/portal/analytics/dashboard?period=month')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('revenue');
    expect(res.body).toHaveProperty('customers');
    expect(res.body).toHaveProperty('loyalty');
    expect(res.body).toHaveProperty('operations');
  });
});
