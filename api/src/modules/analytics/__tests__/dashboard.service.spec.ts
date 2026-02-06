import { AnalyticsDashboardService } from '../services/analytics-dashboard.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import { AnalyticsRevenueService } from '../services/analytics-revenue.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  $queryRaw: MockFn<Promise<unknown>, [unknown]>;
  merchantSettings: { findUnique: MockFn<Promise<unknown>, [unknown]> };
};
type AnalyticsServicePrivate = {
  getDashboardAggregates: MockFn<
    Promise<{
      revenue: number;
      orders: number;
      buyers: number;
      pointsRedeemed: number;
    }>
  >;
  getRegistrationsByDay: MockFn<Promise<Map<string, number>>>;
  calculateVisitFrequencyDays: MockFn<Promise<number>>;
  getRetentionBases: MockFn<
    Promise<{ current: Set<string>; previous: Set<string> }>
  >;
  getCompositionStats: MockFn<
    Promise<{ newChecks: number; repeatChecks: number }>
  >;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateService = (service: AnalyticsDashboardService) =>
  service as unknown as AnalyticsServicePrivate;

describe('AnalyticsService — dashboard summary', () => {
  it('собирает метрики текущего и прошлого периода и считает удержание', async () => {
    const prisma: PrismaStub = {
      $queryRaw: mockFn(),
      merchantSettings: { findUnique: mockFn() },
    };
    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    const revenue = new AnalyticsRevenueService(
      asPrismaService(prisma),
      cache,
      timezone,
    );
    jest.spyOn(timezone, 'getTimezoneInfo').mockResolvedValue({
      code: 'UTC',
      iana: 'UTC',
      label: 'UTC',
      city: 'UTC',
      description: 'UTC',
      mskOffset: 0,
      utcOffsetMinutes: 0,
    });
    jest.spyOn(revenue, 'getDailyRevenue').mockResolvedValue([
      {
        date: '2024-01-01',
        revenue: 500,
        transactions: 5,
        customers: 3,
        averageCheck: 100,
      },
      {
        date: '2024-01-02',
        revenue: 500,
        transactions: 5,
        customers: 2,
        averageCheck: 100,
      },
    ]);
    const service = new AnalyticsDashboardService(
      asPrismaService(prisma),
      cache,
      revenue,
      timezone,
    );
    const servicePrivate = asPrivateService(service);
    servicePrivate.getDashboardAggregates = mockFn<
      Promise<{
        revenue: number;
        orders: number;
        buyers: number;
        pointsRedeemed: number;
      }>,
      [unknown, unknown]
    >()
      .mockResolvedValueOnce({
        revenue: 1000,
        orders: 10,
        buyers: 5,
        pointsRedeemed: 50,
      })
      .mockResolvedValueOnce({
        revenue: 800,
        orders: 8,
        buyers: 4,
        pointsRedeemed: 40,
      });
    servicePrivate.getRegistrationsByDay = mockFn<
      Promise<Map<string, number>>,
      [unknown, unknown]
    >().mockResolvedValue(
      new Map([
        ['2024-01-01', 2],
        ['2024-01-02', 1],
      ]),
    );
    servicePrivate.calculateVisitFrequencyDays = mockFn<
      Promise<number>,
      [unknown, unknown]
    >()
      .mockResolvedValueOnce(4.5)
      .mockResolvedValueOnce(5.5);
    servicePrivate.getRetentionBases = mockFn<
      Promise<{ current: Set<string>; previous: Set<string> }>,
      [unknown]
    >().mockResolvedValue({
      current: new Set(['c1', 'c2']),
      previous: new Set(['c1', 'c3']),
    });
    servicePrivate.getCompositionStats = mockFn<
      Promise<{ newChecks: number; repeatChecks: number }>,
      [unknown]
    >().mockResolvedValue({
      newChecks: 3,
      repeatChecks: 7,
    });

    const period = {
      from: new Date('2024-01-01T00:00:00Z'),
      to: new Date('2024-01-02T23:59:59Z'),
      type: 'month' as const,
    };

    const result = await service.getDashboard('m-1', period, 'UTC');

    expect(result.metrics.orders).toBe(10);
    expect(result.metrics.salesAmount).toBe(1000);
    expect(result.previousMetrics.salesAmount).toBe(800);
    expect(result.metrics.pointsBurned).toBe(50);
    expect(result.metrics.visitFrequencyDays).toBe(4.5);
    expect(result.previousMetrics.visitFrequencyDays).toBe(5.5);
    expect(result.timeline.current[0].registrations).toBe(2);
    expect(result.timeline.previous.length).toBe(2);
    expect(result.retention.activeCurrent).toBe(2);
    expect(result.retention.activePrevious).toBe(2);
    expect(result.retention.retentionRate).toBe(50);
    expect(result.composition.newChecks).toBe(3);
    expect(result.composition.repeatChecks).toBe(7);
  });
});
