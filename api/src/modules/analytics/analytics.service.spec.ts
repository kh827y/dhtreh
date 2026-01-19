import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../core/prisma/prisma.service';

function createPrismaMock() {
  return {
    merchantSettings: { findUnique: jest.fn() },
    customerStats: { findMany: jest.fn() },
  } as unknown as {
    merchantSettings: { findUnique: jest.Mock };
    customerStats: { findMany: jest.Mock };
  };
}

describe('AnalyticsService — RFM segmentation', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AnalyticsService;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = createPrismaMock();
    service = new AnalyticsService(
      prisma as unknown as PrismaService,
      {} as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('recomputes missing RFM scores with manual thresholds instead of auto quantiles', async () => {
    const now = new Date('2024-04-01T00:00:00.000Z');
    jest.setSystemTime(now);

    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        rfm: {
          recency: { mode: 'manual', days: 365 },
          frequency: { mode: 'manual', threshold: 10 },
          monetary: { mode: 'manual', threshold: 1000 },
        },
      },
    });
    prisma.customerStats.findMany.mockResolvedValue([
      {
        rfmClass: null,
        rfmR: null,
        rfmF: null,
        rfmM: null,
        lastOrderAt: new Date('2024-03-25T00:00:00.000Z'),
        visits: 8,
        totalSpent: 800,
      },
      {
        rfmClass: null,
        rfmR: null,
        rfmF: null,
        rfmM: null,
        lastOrderAt: new Date('2023-09-13T00:00:00.000Z'),
        visits: 2,
        totalSpent: 100,
      },
      {
        rfmClass: null,
        rfmR: null,
        rfmF: null,
        rfmM: null,
        lastOrderAt: null,
        visits: 0,
        totalSpent: 0,
      },
      {
        rfmClass: null,
        rfmR: null,
        rfmF: null,
        rfmM: null,
        lastOrderAt: new Date('2024-03-20T00:00:00.000Z'),
        visits: 2,
        totalSpent: 0,
      },
    ]);

    const result = await service.getRfmGroupsAnalytics('m-1');

    expect(result.settings.frequencyThreshold).toBe(10);
    expect(result.settings.moneyThreshold).toBe(1000);

    const distribution = Object.fromEntries(
      result.distribution.map((row) => [row.class, row.customers]),
    );
    expect(distribution['5-4-4']).toBe(1);
    expect(distribution['3-1-1']).toBe(1);

    expect(result.totals.customers).toBe(2);

    const freq1 = result.groups.find((group) => group.score === 1)?.frequency;
    const freq4 = result.groups.find((group) => group.score === 4)?.frequency;
    expect(freq1).toEqual({ min: 2, max: 2, count: 1 });
    expect(freq4).toEqual({ min: 8, max: 8, count: 1 });
  });
});
