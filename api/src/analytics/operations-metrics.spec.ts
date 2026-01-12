import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';

const period = {
  from: new Date('2024-01-01T00:00:00.000Z'),
  to: new Date('2024-01-31T23:59:59.999Z'),
  type: 'month' as const,
};

const joinSql = (query: any) =>
  Array.isArray(query?.strings) ? query.strings.join(' ') : String(query ?? '');

describe('AnalyticsService — operational metrics', () => {
  it('агрегирует метрики точек и исключает возвраты/отмены', async () => {
    const sqlCalls: any[] = [];
    const prisma = {
      outlet: {
        findMany: jest.fn().mockResolvedValue([{ id: 'o-1', name: 'Флагман' }]),
      },
      $queryRaw: jest
        .fn()
        .mockImplementationOnce((sql: any) => {
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
        .mockImplementationOnce((sql: any) => {
          sqlCalls.push(sql);
          return Promise.resolve([{ outletId: 'o-1', newCustomers: 2 }]);
        }),
    };

    const service = new AnalyticsService(prisma as any, {} as ConfigService);
    const metrics = await (service as any).getOutletMetrics('m-1', period);

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
    expect(sqlStrings.some((text) => text.includes('"customerId" IS NOT NULL'))).toBe(true);
  });

  it('агрегирует метрики сотрудников, учитывает очки и фильтрует возвраты', async () => {
    const sqlCalls: any[] = [];
    const prisma = {
      staff: {
        findMany: jest.fn().mockResolvedValue([
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
        findMany: jest.fn().mockResolvedValue([{ id: 'o-1', name: 'Флагман' }]),
      },
      staffMotivationEntry: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { staffId: 's-1', outletId: 'o-1', _sum: { points: 18 } },
          ]),
      },
      $queryRaw: jest
        .fn()
        .mockImplementationOnce((sql: any) => {
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
        .mockImplementationOnce((sql: any) => {
          sqlCalls.push(sql);
          return Promise.resolve([
            { staffId: 's-1', outletId: 'o-1', newCustomers: 2 },
          ]);
        })
        .mockImplementationOnce((sql: any) => {
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

    const service = new AnalyticsService(prisma as any, {} as ConfigService);
    const metrics = await (service as any).getStaffMetrics('m-1', period);

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
