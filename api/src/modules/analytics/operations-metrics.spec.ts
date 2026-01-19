import { ConfigService } from '@nestjs/config';
import { AnalyticsService, DashboardPeriod } from './analytics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type OutletRecord = { id: string; name: string | null };
type StaffRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  login: string | null;
  email: string | null;
};
type MotivationRecord = {
  staffId: string;
  outletId: string | null;
  _sum: { points: number | null };
};
type PrismaStub = {
  outlet?: { findMany: MockFn<Promise<OutletRecord[]>, [unknown?]> };
  staff?: { findMany: MockFn<Promise<StaffRecord[]>, [unknown?]> };
  staffMotivationEntry?: {
    groupBy: MockFn<Promise<MotivationRecord[]>, [unknown?]>;
  };
  $queryRaw: MockFn<Promise<unknown>, [unknown]>;
};
type AnalyticsServicePrivate = {
  getOutletMetrics: (
    merchantId: string,
    period: DashboardPeriod,
  ) => Promise<unknown[]>;
  getStaffMetrics: (
    merchantId: string,
    period: DashboardPeriod,
  ) => Promise<unknown[]>;
};
type SqlTag = { strings: string[] };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateService = (service: AnalyticsService) =>
  service as unknown as AnalyticsServicePrivate;
const isSqlTag = (value: unknown): value is SqlTag =>
  typeof value === 'object' &&
  value !== null &&
  'strings' in value &&
  Array.isArray((value as SqlTag).strings);

const period: DashboardPeriod = {
  from: new Date('2024-01-01T00:00:00.000Z'),
  to: new Date('2024-01-31T23:59:59.999Z'),
  type: 'month' as const,
};

const joinSql = (query: unknown) => {
  if (isSqlTag(query)) return query.strings.join(' ');
  if (typeof query === 'string') return query;
  if (query == null) return '';
  return JSON.stringify(query);
};

describe('AnalyticsService — operational metrics', () => {
  it('агрегирует метрики точек и исключает возвраты/отмены', async () => {
    const sqlCalls: unknown[] = [];
    const prisma: PrismaStub = {
      outlet: {
        findMany: mockFn<
          Promise<OutletRecord[]>,
          [unknown?]
        >().mockResolvedValue([{ id: 'o-1', name: 'Флагман' }]),
      },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>()
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            {
              outletId: 'o-1',
              revenue: 12500,
              transactions: 5,
              customers: 4,
              pointsIssued: 300,
              pointsRedeemed: 120,
            },
          ]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([{ outletId: 'o-1', newCustomers: 2 }]);
        }),
    };

    const service = new AnalyticsService(
      asPrismaService(prisma),
      {} as ConfigService,
    );
    const metrics = await asPrivateService(service).getOutletMetrics(
      'm-1',
      period,
    );

    expect(metrics).toEqual([
      expect.objectContaining({
        id: 'o-1',
        name: 'Флагман',
        revenue: 12500,
        transactions: 5,
        averageCheck: 2500,
        pointsIssued: 300,
        pointsRedeemed: 120,
        customers: 4,
        newCustomers: 2,
      }),
    ]);

    const sqlStrings = sqlCalls.map((sql) => joinSql(sql));
    sqlStrings.forEach((text) => {
      expect(text).toContain('"canceledAt" IS NULL');
      expect(text).toContain('refund."type" = \'REFUND\'');
    });
    expect(
      sqlStrings.some((text) => text.includes('"customerId" IS NOT NULL')),
    ).toBe(true);
  });

  it('агрегирует метрики сотрудников, учитывает очки и фильтрует возвраты', async () => {
    const sqlCalls: unknown[] = [];
    const prisma: PrismaStub = {
      staff: {
        findMany: mockFn<
          Promise<StaffRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          {
            id: 's-1',
            firstName: 'Алиса',
            lastName: 'Фриман',
            login: 'alice',
            email: 'alice@example.com',
          },
        ]),
      },
      outlet: {
        findMany: mockFn<
          Promise<OutletRecord[]>,
          [unknown?]
        >().mockResolvedValue([{ id: 'o-1', name: 'Флагман' }]),
      },
      staffMotivationEntry: {
        groupBy: mockFn<
          Promise<MotivationRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          { staffId: 's-1', outletId: 'o-1', _sum: { points: 18 } },
        ]),
      },
      $queryRaw: mockFn<Promise<unknown>, [unknown]>()
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            {
              staffId: 's-1',
              outletId: 'o-1',
              revenue: 10000,
              transactions: 4,
              pointsIssued: 500,
              pointsRedeemed: 150,
              customers: 3,
            },
          ]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            { staffId: 's-1', outletId: 'o-1', newCustomers: 2 },
          ]);
        })
        .mockImplementationOnce((sql) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            {
              staffId: 's-1',
              outletId: 'o-1',
              avgRating: 4.5,
              reviewsCount: 3,
            },
          ]);
        }),
    };

    const service = new AnalyticsService(
      asPrismaService(prisma),
      {} as ConfigService,
    );
    const metrics = await asPrivateService(service).getStaffMetrics(
      'm-1',
      period,
    );

    expect(metrics).toEqual([
      expect.objectContaining({
        id: 's-1',
        outletId: 'o-1',
        outletName: 'Флагман',
        name: 'Алиса Фриман',
        revenue: 10000,
        transactions: 4,
        averageCheck: 2500,
        pointsIssued: 500,
        pointsRedeemed: 150,
        newCustomers: 2,
        performanceScore: 18,
        averageRating: 4.5,
        reviewsCount: 3,
      }),
    ]);

    const sqlStrings = sqlCalls.map((sql) => joinSql(sql));
    expect(sqlStrings[0]).toContain('"canceledAt" IS NULL');
    expect(sqlStrings[0]).toContain('refund."type" = \'REFUND\'');
    expect(sqlStrings[0]).toContain('"customerId" IS NOT NULL');
    expect(sqlStrings[1]).toContain('"canceledAt" IS NULL');
    expect(sqlStrings[1]).toContain('refund."type" = \'REFUND\'');
    expect(sqlStrings[1]).toContain('"customerId" IS NOT NULL');
  });
});
