import { AnalyticsCustomersService } from './services/analytics-customers.service';
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
  customer: { count: MockFn<Promise<number>, [unknown]> };
  wallet: { findMany: MockFn<Promise<unknown[]>, [unknown]> };
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

describe('AnalyticsService — customer metrics', () => {
  it('считает LTV и топ-клиентов по валидным чекам (без EARN-агрегации)', async () => {
    const sqlCalls: unknown[] = [];
    const prisma: PrismaStub = {
      customer: {
        count: mockFn<Promise<number>, [unknown]>()
          .mockResolvedValueOnce(20)
          .mockResolvedValueOnce(3),
      },
      wallet: {
        findMany: mockFn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
          { customerId: 'c-1', balance: 230 },
        ]),
      },
      merchantSettings: { findUnique: mockFn() },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>()
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([{ count: 5 }]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([{ visits: 3 }, { visits: 2 }]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([{ totalSpent: 4000, customers: 4 }]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            {
              customerId: 'c-1',
              name: 'Иван',
              phone: '+79990000000',
              totalSpent: 2100,
              visits: 3,
              lastVisit: new Date('2024-01-20T10:00:00.000Z'),
            },
          ]);
        }),
    };

    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    const service = new AnalyticsCustomersService(
      asPrismaService(prisma),
      cache,
      timezone,
    );

    const period = {
      from: new Date('2024-01-01T00:00:00.000Z'),
      to: new Date('2024-01-31T23:59:59.999Z'),
      type: 'month' as const,
    };

    const metrics = await service.getCustomerMetrics('m-1', period);

    expect(metrics.customerLifetimeValue).toBe(1000);
    expect(metrics.topCustomers).toEqual([
      expect.objectContaining({
        id: 'c-1',
        totalSpent: 2100,
        visits: 3,
        loyaltyPoints: 230,
      }),
    ]);

    const sqlText = sqlCalls.map((sql) => joinSql(sql)).join('\n');
    expect(sqlText).toContain('FROM "Receipt" r');
    expect(sqlText).toContain('"total" > 0');
    expect(sqlText).toContain('refund."type" = \'REFUND\'');
    expect(sqlText).not.toContain('"type" = \'EARN\'');
  });

  it('метрики активности по времени исключают нулевые чеки и возвраты', async () => {
    const sqlCalls: unknown[] = [];
    const prisma: PrismaStub = {
      customer: { count: mockFn<Promise<number>, [unknown]>() },
      wallet: { findMany: mockFn<Promise<unknown[]>, [unknown]>() },
      merchantSettings: { findUnique: mockFn() },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>().mockImplementation(
        (sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([]);
        },
      ),
    };

    const cache = new AnalyticsCacheService(new AppConfigService());
    const timezone = new AnalyticsTimezoneService(asPrismaService(prisma));
    const service = new AnalyticsCustomersService(
      asPrismaService(prisma),
      cache,
      timezone,
    );

    const period = {
      from: new Date('2024-01-01T00:00:00.000Z'),
      to: new Date('2024-01-31T23:59:59.999Z'),
      type: 'month' as const,
    };

    await service.getTimeActivityMetrics('m-1', period, 'UTC');

    const sqlText = sqlCalls.map((sql) => joinSql(sql)).join('\n');
    expect(sqlText).toContain('"total" > 0');
    expect(sqlText).toContain('refund."type" = \'REFUND\'');
    expect(sqlText).toContain('"canceledAt" IS NULL');
  });
});
