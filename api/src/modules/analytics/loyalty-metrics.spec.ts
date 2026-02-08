import { AnalyticsLoyaltyService } from './services/analytics-loyalty.service';
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
  wallet: {
    aggregate: MockFn<Promise<{ _avg: { balance: number | null } }>, [unknown]>;
    count: MockFn<Promise<number>, [unknown]>;
  };
  transaction: {
    aggregate: MockFn<
      Promise<{ _sum: { amount: number | null } }>,
      [unknown]
    >;
  };
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

describe('AnalyticsService — loyalty metrics', () => {
  it('исключает refund/canceled чеки и не дублирует loyalty receipt query', async () => {
    const sqlCalls: string[] = [];
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown]>().mockResolvedValue({
          timezone: 'MSK+0',
        }),
      },
      wallet: {
        aggregate: mockFn<
          Promise<{ _avg: { balance: number | null } }>,
          [unknown]
        >().mockResolvedValue({ _avg: { balance: 57 } }),
        count: mockFn<Promise<number>, [unknown]>().mockResolvedValue(8),
      },
      transaction: {
        aggregate: mockFn<
          Promise<{ _sum: { amount: number | null } }>,
          [unknown]
        >().mockResolvedValue({ _sum: { amount: 300 } }),
      },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>().mockImplementation(
        (sql) => {
          sqlCalls.push(joinSql(sql));
          const call = sqlCalls.length;
          if (call === 1) return Promise.resolve([{ total: 1200 }]); // earned
          if (call === 2) return Promise.resolve([{ total: -300 }]); // redeemed
          if (call === 3) return Promise.resolve([]); // points series
          if (call === 4) return Promise.resolve([{ balance: 0 }]); // initial balance
          if (call === 5) {
            return Promise.resolve([
              { loyaltyRevenue: 1500, totalReceipts: 10, loyaltyReceipts: 4 },
            ]);
          }
          return Promise.resolve([]);
        },
      ),
    };

    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    const service = new AnalyticsLoyaltyService(
      asPrismaService(prisma),
      cache,
      timezone,
    );
    const period = {
      from: new Date('2024-02-01T00:00:00.000Z'),
      to: new Date('2024-02-29T23:59:59.999Z'),
      type: 'month' as const,
    };

    const metrics = await service.getLoyaltyMetrics(
      'm-1',
      period,
      'day',
      'MSK+0',
    );

    expect(metrics.totalPointsIssued).toBe(1200);
    expect(metrics.totalPointsRedeemed).toBe(300);
    expect(metrics.pointsRedemptionRate).toBe(25);
    expect(metrics.averageBalance).toBe(57);
    expect(metrics.activeWallets).toBe(8);
    expect(metrics.programROI).toBe(400);
    expect(metrics.conversionRate).toBe(40);

    expect(sqlCalls).toHaveLength(5);
    expect(sqlCalls[0]).toContain('t."type" = \'EARN\'');
    expect(sqlCalls[1]).toContain('t."type" = \'REDEEM\'');
    expect(sqlCalls[2]).toContain('t."type" <> \'REFUND\'');
    expect(sqlCalls[3]).toContain('t."type" <> \'REFUND\'');
    expect(sqlCalls[4]).toContain('AS "loyaltyRevenue"');
    expect(sqlCalls[4]).toContain('"total" > 0');
    expect(sqlCalls[4]).toContain('"canceledAt" IS NULL');
    expect(sqlCalls[4]).toContain('refund."type" = \'REFUND\'');

    const receiptQueries = sqlCalls.filter((text) =>
      text.includes('AS "loyaltyRevenue"'),
    );
    expect(receiptQueries).toHaveLength(1);
  });
});
