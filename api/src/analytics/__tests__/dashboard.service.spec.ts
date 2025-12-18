import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../analytics.service';

describe('AnalyticsService — dashboard summary', () => {
  it('собирает метрики текущего и прошлого периода и считает удержание', async () => {
    const prisma = {
      $queryRaw: jest.fn(),
      merchantSettings: { findUnique: jest.fn() },
    };
    const service = new AnalyticsService(prisma as any, {} as ConfigService);

    (service as any).getTimezoneInfo = jest
      .fn()
      .mockResolvedValue({ utcOffsetMinutes: 0, iana: 'UTC' });
    (service as any).resolveGrouping = jest.fn().mockReturnValue('day');
    (service as any).getDashboardAggregates = jest
      .fn()
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
    (service as any).getDailyRevenue = jest.fn().mockImplementation(() =>
      Promise.resolve([
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
      ]),
    );
    (service as any).getRegistrationsByDay = jest.fn().mockResolvedValue(
      new Map([
        ['2024-01-01', 2],
        ['2024-01-02', 1],
      ]),
    );
    (service as any).calculateVisitFrequencyDays = jest
      .fn()
      .mockResolvedValueOnce(4.5)
      .mockResolvedValueOnce(5.5);
    (service as any).getRetentionBases = jest.fn().mockResolvedValue({
      current: new Set(['c1', 'c2']),
      previous: new Set(['c1', 'c3']),
    });
    (service as any).getCompositionStats = jest
      .fn()
      .mockResolvedValue({ newChecks: 3, repeatChecks: 7 });

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
