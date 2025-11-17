import { AnalyticsService, DashboardPeriod } from '../analytics.service';

describe('AnalyticsService.getBirthdayMechanicMetrics', () => {
  const prisma: any = {
    merchantSettings: { findUnique: jest.fn() },
    transaction: { findMany: jest.fn() },
    receipt: { findMany: jest.fn() },
    birthdayGreeting: { findMany: jest.fn() },
  };

  const config: any = { get: jest.fn() };

  const period: DashboardPeriod = {
    from: new Date('2025-11-01T00:00:00.000Z'),
    to: new Date('2025-11-05T23:59:59.999Z'),
    type: 'custom',
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prisma, config);
  });

  it('считает поздравления, покупки по подарочным баллам и чистую выручку', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: { birthday: { daysBefore: 5, giftPoints: 400, giftTtlDays: 10 } },
    });

    prisma.transaction.findMany.mockResolvedValue([{ orderId: 'ref-order' }]);

    const greetingsInPeriod = [
      { customerId: 'c1', sendDate: new Date('2025-11-02T00:00:00.000Z') },
      { customerId: 'c3', sendDate: new Date('2025-11-04T00:00:00.000Z') },
    ];
    const giftSources = [
      {
        customerId: 'c1',
        giftPoints: 500,
        giftExpiresAt: new Date('2025-11-30T00:00:00.000Z'),
        sendDate: new Date('2025-11-02T00:00:00.000Z'),
      },
    ];
    prisma.birthdayGreeting.findMany.mockImplementation((params: any) => {
      if (params?.where?.giftPoints) return giftSources;
      return greetingsInPeriod;
    });

    const receiptsInPeriod = [
      {
        id: 'r1',
        customerId: 'c1',
        orderId: 'order-1',
        total: 2000,
        redeemApplied: 200,
        createdAt: new Date('2025-11-03T10:00:00.000Z'),
      },
      {
        id: 'r3',
        customerId: 'c1',
        orderId: 'ref-order',
        total: 1000,
        redeemApplied: 50,
        createdAt: new Date('2025-11-01T09:00:00.000Z'),
      },
    ];
    const receiptsForConsumption = [...receiptsInPeriod];

    prisma.receipt.findMany.mockImplementation((params: any) => {
      if (params?.where?.customerId) {
        return receiptsForConsumption;
      }
      return receiptsInPeriod;
    });

    const result = await service.getBirthdayMechanicMetrics('m1', period);

    expect(result.summary.greetings).toBe(2);
    expect(result.summary.giftPurchasers).toBe(1);
    expect(result.summary.giftPointsSpent).toBe(200);
    expect(result.summary.revenueNet).toBe(1800);
    expect(result.summary.averageCheck).toBe(2000);

    expect(result.timeline).toEqual([
      { date: '2025-11-02', greetings: 1, purchases: 0 },
      { date: '2025-11-03', greetings: 0, purchases: 1 },
      { date: '2025-11-04', greetings: 1, purchases: 0 },
    ]);
    expect(result.revenue).toEqual([
      { date: '2025-11-03', revenue: 1800 },
    ]);
  });
});
