import { DashboardPeriod } from '../analytics.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../../../shared/timezone/russia-timezones';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AnalyticsMechanicsService } from '../services/analytics-mechanics.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  merchantSettings: { findUnique: MockFn<Promise<unknown>, [unknown?]> };
  transaction: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
  receipt: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
  autoReturnAttempt: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
  customerStats: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
};
type AnalyticsServicePrivate = {
  getTimezoneInfo: (merchantId: string) => Promise<unknown>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateService = (service: AnalyticsTimezoneService) =>
  service as unknown as AnalyticsServicePrivate;

describe('AnalyticsService.getAutoReturnMetrics', () => {
  const prisma: PrismaStub = {
    merchantSettings: { findUnique: mockFn() },
    transaction: { findMany: mockFn() },
    receipt: { findMany: mockFn() },
    autoReturnAttempt: { findMany: mockFn() },
    customerStats: { findMany: mockFn() },
  };

  const period: DashboardPeriod = {
    from: new Date('2025-01-01T00:00:00.000Z'),
    to: new Date('2025-01-05T23:59:59.999Z'),
    type: 'custom',
  };

  let service: AnalyticsMechanicsService;

  beforeEach(() => {
    jest.clearAllMocks();
    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    service = new AnalyticsMechanicsService(
      asPrismaService(prisma),
      cache,
      timezone,
    );
    jest
      .spyOn(asPrivateService(timezone), 'getTimezoneInfo')
      .mockResolvedValue(findTimezone(DEFAULT_TIMEZONE_CODE));
  });

  it('считает приглашения, возвраты, баллы и выручку с учетом сгорания', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        autoReturn: {
          days: 30,
          giftPoints: 100,
          giftTtlDays: 7,
          giftBurnEnabled: true,
        },
      },
    });

    prisma.transaction.findMany.mockResolvedValue([]);

    prisma.autoReturnAttempt.findMany.mockResolvedValue([
      {
        id: 'a1',
        customerId: 'c1',
        invitedAt: new Date('2025-01-02T00:00:00.000Z'),
        status: 'SENT',
        giftPoints: 100,
        giftExpiresAt: null,
        lastPurchaseAt: new Date('2024-12-01T00:00:00.000Z'),
      },
      {
        id: 'a2',
        customerId: 'c2',
        invitedAt: new Date('2025-01-03T00:00:00.000Z'),
        status: 'SENT',
        giftPoints: 100,
        giftExpiresAt: new Date('2025-01-04T00:00:00.000Z'),
        lastPurchaseAt: new Date('2024-11-01T00:00:00.000Z'),
      },
    ]);

    prisma.customerStats.findMany.mockResolvedValue([
      { customerId: 'c1', rfmClass: 'A' },
      { customerId: 'c2', rfmClass: null },
    ]);

    prisma.receipt.findMany.mockResolvedValue([
      {
        id: 'r1',
        customerId: 'c1',
        createdAt: new Date('2025-01-03T10:00:00.000Z'),
        total: 1000,
        redeemApplied: 80,
        orderId: 'o1',
      },
      {
        id: 'r2',
        customerId: 'c1',
        createdAt: new Date('2025-01-04T10:00:00.000Z'),
        total: 500,
        redeemApplied: 40,
        orderId: 'o2',
      },
      {
        id: 'r3',
        customerId: 'c2',
        createdAt: new Date('2025-01-05T10:00:00.000Z'),
        total: 700,
        redeemApplied: 50,
        orderId: 'o3',
      },
    ]);

    const result = await service.getAutoReturnMetrics('m1', period);

    expect(result.summary.invitations).toBe(2);
    expect(result.summary.returned).toBe(1);
    expect(result.summary.conversion).toBe(50);
    expect(result.summary.pointsCost).toBe(100);
    expect(result.summary.firstPurchaseRevenue).toBe(920);

    expect(result.distance).toEqual({
      customers: 1,
      purchasesPerCustomer: 1,
      purchasesCount: 1,
      totalAmount: 500,
      averageCheck: 500,
    });

    expect(result.rfm).toEqual(
      expect.arrayContaining([
        { segment: 'A', invitations: 1, returned: 1 },
        { segment: 'Не рассчитано', invitations: 1, returned: 0 },
      ]),
    );

    const dayInvites = result.trends.attempts.find(
      (row) => row.date === '2025-01-02',
    );
    const dayReturns = result.trends.attempts.find(
      (row) => row.date === '2025-01-03',
    );

    expect(dayInvites).toEqual({
      date: '2025-01-02',
      invitations: 1,
      returns: 0,
    });
    expect(dayReturns).toEqual({
      date: '2025-01-03',
      invitations: 1,
      returns: 1,
    });
  });
});
