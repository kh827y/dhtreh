import { AnalyticsRevenueService } from './services/analytics-revenue.service';
import { AnalyticsTimezoneService } from './analytics-timezone.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AppConfigService } from '../../core/config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type SqlTag = { strings: string[] };
type PrismaStub = {
  merchantSettings: { findUnique: MockFn<Promise<unknown>, [unknown]> };
  $queryRaw: MockFn<Promise<unknown>, [unknown]>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const isSqlTag = (value: unknown): value is SqlTag =>
  typeof value === 'object' &&
  value !== null &&
  'strings' in value &&
  Array.isArray((value as SqlTag).strings);
const joinSql = (query: unknown) => {
  if (isSqlTag(query)) return query.strings.join(' ');
  if (typeof query === 'string') return query;
  if (query == null) return '';
  return JSON.stringify(query);
};

describe('AnalyticsService — revenue metrics', () => {
  it('считает выручку только по валидным чекам (без refund/canceled/zero-total)', async () => {
    const sqlCalls: string[] = [];
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown]>().mockResolvedValue({
          timezone: 'MSK+0',
        }),
      },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>().mockImplementation(
        (sql) => {
          sqlCalls.push(joinSql(sql));
          const call = sqlCalls.length;
          if (call === 1) {
            return Promise.resolve([{ revenue: 12000, orders: 6 }]);
          }
          if (call === 2) {
            return Promise.resolve([{ revenue: 10000 }]);
          }
          if (call === 3) {
            return Promise.resolve([
              { hour: 10, revenue: 7000, transactions: 4 },
              { hour: 18, revenue: 5000, transactions: 2 },
            ]);
          }
          if (call === 4) {
            return Promise.resolve([
              {
                bucket: new Date('2024-02-01T00:00:00.000Z'),
                revenue: 12000,
                orders: 6,
                customers: 5,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    };

    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    const service = new AnalyticsRevenueService(
      asPrismaService(prisma),
      cache,
      timezone,
    );
    const period = {
      from: new Date('2024-02-01T00:00:00.000Z'),
      to: new Date('2024-02-29T23:59:59.999Z'),
      type: 'month' as const,
    };

    const metrics = await service.getRevenueMetrics(
      'm-1',
      period,
      'day',
      'MSK+0',
    );

    expect(metrics.totalRevenue).toBe(12000);
    expect(metrics.transactionCount).toBe(6);
    expect(metrics.averageCheck).toBe(2000);
    expect(metrics.revenueGrowth).toBe(20);
    expect(metrics.hourlyDistribution[10]).toEqual({
      hour: 10,
      revenue: 7000,
      transactions: 4,
    });
    expect(metrics.hourlyDistribution[18]).toEqual({
      hour: 18,
      revenue: 5000,
      transactions: 2,
    });
    expect(metrics.dailyRevenue.length).toBeGreaterThan(0);
    expect(metrics.dailyRevenue[0]).toEqual({
      date: '2024-02-01',
      revenue: 12000,
      transactions: 6,
      customers: 5,
      averageCheck: 2000,
    });

    expect(sqlCalls).toHaveLength(4);
    sqlCalls.forEach((text) => {
      expect(text).toContain('"canceledAt" IS NULL');
      expect(text).toContain('"total" > 0');
      expect(text).toContain('refund."type" = \'REFUND\'');
    });
  });
});
