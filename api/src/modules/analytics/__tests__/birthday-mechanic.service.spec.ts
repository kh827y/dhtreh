import { AnalyticsService, DashboardPeriod } from '../analytics.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type BirthdayGreetingRecord = {
  customerId: string;
  sendDate: Date;
  giftPoints?: number;
  giftExpiresAt?: Date | null;
};
type ReceiptRecord = {
  id: string;
  customerId: string;
  orderId: string;
  total: number;
  redeemApplied: number;
  createdAt: Date;
};
type BirthdayGreetingFindManyArgs = { where?: { giftPoints?: unknown } };
type ReceiptFindManyArgs = { where?: { customerId?: string } };
type PrismaStub = {
  merchantSettings: {
    findUnique: MockFn<Promise<{ rulesJson: unknown } | null>, [unknown?]>;
  };
  transaction: {
    findMany: MockFn<Promise<Array<{ orderId: string }>>, [unknown?]>;
  };
  receipt: {
    findMany: MockFn<Promise<ReceiptRecord[]>, [ReceiptFindManyArgs]>;
  };
  birthdayGreeting: {
    findMany: MockFn<
      Promise<BirthdayGreetingRecord[]>,
      [BirthdayGreetingFindManyArgs]
    >;
  };
};
type ConfigStub = { get: MockFn };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asConfigService = (stub: ConfigStub) => stub as unknown as ConfigService;

describe('AnalyticsService.getBirthdayMechanicMetrics', () => {
  const prisma: PrismaStub = {
    merchantSettings: {
      findUnique: mockFn<Promise<{ rulesJson: unknown } | null>, [unknown?]>(),
    },
    transaction: {
      findMany: mockFn<Promise<Array<{ orderId: string }>>, [unknown?]>(),
    },
    receipt: {
      findMany: mockFn<Promise<ReceiptRecord[]>, [ReceiptFindManyArgs]>(),
    },
    birthdayGreeting: {
      findMany: mockFn<
        Promise<BirthdayGreetingRecord[]>,
        [BirthdayGreetingFindManyArgs]
      >(),
    },
  };

  const config: ConfigStub = { get: mockFn() };

  const period: DashboardPeriod = {
    from: new Date('2025-11-01T00:00:00.000Z'),
    to: new Date('2025-11-05T23:59:59.999Z'),
    type: 'custom',
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(
      asPrismaService(prisma),
      asConfigService(config),
    );
  });

  it('считает поздравления, покупки по подарочным баллам и чистую выручку', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        birthday: { daysBefore: 5, giftPoints: 400, giftTtlDays: 10 },
      },
    });

    prisma.transaction.findMany.mockResolvedValue([{ orderId: 'ref-order' }]);

    const greetingsInPeriod: BirthdayGreetingRecord[] = [
      { customerId: 'c1', sendDate: new Date('2025-11-02T00:00:00.000Z') },
      { customerId: 'c3', sendDate: new Date('2025-11-04T00:00:00.000Z') },
    ];
    const giftSources: BirthdayGreetingRecord[] = [
      {
        customerId: 'c1',
        giftPoints: 500,
        giftExpiresAt: new Date('2025-11-30T00:00:00.000Z'),
        sendDate: new Date('2025-11-02T00:00:00.000Z'),
      },
    ];
    prisma.birthdayGreeting.findMany.mockImplementation(
      (params: BirthdayGreetingFindManyArgs) => {
        if (params?.where?.giftPoints) {
          return Promise.resolve(giftSources);
        }
        return Promise.resolve(greetingsInPeriod);
      },
    );

    const receiptsInPeriod: ReceiptRecord[] = [
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

    prisma.receipt.findMany.mockImplementation(
      (params: ReceiptFindManyArgs) => {
        if (params?.where?.customerId) {
          return Promise.resolve(receiptsForConsumption);
        }
        return Promise.resolve(receiptsInPeriod);
      },
    );

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
    expect(result.revenue).toEqual([{ date: '2025-11-03', revenue: 1800 }]);
  });

  it('не учитывает покупки после истечения подарочных баллов', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        birthday: { daysBefore: 5, giftPoints: 200, giftTtlDays: 2 },
      },
    });

    prisma.transaction.findMany.mockResolvedValue([]);

    const greetingsInPeriod: BirthdayGreetingRecord[] = [
      { customerId: 'c10', sendDate: new Date('2025-11-01T00:00:00.000Z') },
    ];
    const giftSources: BirthdayGreetingRecord[] = [
      {
        customerId: 'c10',
        giftPoints: 200,
        giftExpiresAt: new Date('2025-11-02T00:00:00.000Z'),
        sendDate: new Date('2025-11-01T00:00:00.000Z'),
      },
    ];
    prisma.birthdayGreeting.findMany.mockImplementation(
      (params: BirthdayGreetingFindManyArgs) => {
        if (params?.where?.giftPoints) return Promise.resolve(giftSources);
        return Promise.resolve(greetingsInPeriod);
      },
    );

    const receiptsInPeriod = [
      {
        id: 'r10',
        customerId: 'c10',
        orderId: 'order-expired',
        total: 1500,
        redeemApplied: 100,
        createdAt: new Date('2025-11-04T10:00:00.000Z'),
      },
    ];

    prisma.receipt.findMany.mockImplementation(
      (params: ReceiptFindManyArgs) => {
        if (params?.where?.customerId) return Promise.resolve(receiptsInPeriod);
        return Promise.resolve(receiptsInPeriod);
      },
    );

    const result = await service.getBirthdayMechanicMetrics('m1', period);

    expect(result.summary.greetings).toBe(1);
    expect(result.summary.giftPurchasers).toBe(0);
    expect(result.summary.giftPointsSpent).toBe(0);
    expect(result.summary.revenueNet).toBe(0);
    expect(result.timeline).toEqual([
      { date: '2025-11-01', greetings: 1, purchases: 0 },
    ]);
    expect(result.revenue).toEqual([]);
  });
});
