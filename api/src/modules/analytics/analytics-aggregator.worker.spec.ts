import { AnalyticsAggregatorWorker } from './analytics-aggregator.worker';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { fetchReceiptAggregates } from '../../shared/common/receipt-aggregates.util';

jest.mock('../../shared/common/receipt-aggregates.util', () => ({
  fetchReceiptAggregates: jest.fn(),
}));

type ReceiptAggregateRow = Awaited<
  ReturnType<typeof fetchReceiptAggregates>
>[number];

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type CustomerStatsUpsertPayload = {
  where: { merchantId_customerId?: { customerId?: string } };
  update: Record<string, unknown> & { lastSeenAt?: Date };
  create: Record<string, unknown> & {
    firstSeenAt?: Date | null;
    lastSeenAt?: Date;
  };
};
type MockPrisma = {
  merchantSettings: { findUnique: MockFn<Promise<unknown>, [unknown?]> };
  wallet: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
  customerStats: { upsert: MockFn<unknown, [CustomerStatsUpsertPayload]> };
};
type Quantiles = {
  q20: number;
  q40: number;
  q60: number;
  q80: number;
};
type AnalyticsAggregatorWorkerPrivate = {
  scoreRecency: (days: number, horizon: number) => number;
  computeRecencyDaysBounded: (
    lastOrderAt: Date | null | undefined,
    horizon: number,
    now: Date,
  ) => number;
  computeRecencyDaysRaw: (
    lastOrderAt: Date | null | undefined,
    now: Date,
  ) => number;
  scoreDescending: (
    value: number,
    threshold: number | null,
    quantiles?: Quantiles | null,
  ) => number;
  computeQuantiles: (values: number[]) => Quantiles | null;
  suggestUpperQuantile: (
    values: number[],
    options?: { minimum?: number },
  ) => number | null;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asWorkerPrivate = (worker: AnalyticsAggregatorWorker) =>
  worker as unknown as AnalyticsAggregatorWorkerPrivate;

function createPrismaMock(): MockPrisma {
  return {
    merchantSettings: { findUnique: mockFn<Promise<unknown>, [unknown?]>() },
    wallet: { findMany: mockFn<Promise<unknown[]>, [unknown?]>() },
    customerStats: { upsert: mockFn() },
  };
}

describe('AnalyticsAggregatorWorker — RFM helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps recency into buckets 1–5 and clamps values to the horizon', () => {
    const worker = new AnalyticsAggregatorWorker(
      asPrismaService(createPrismaMock()),
    );
    const workerPrivate = asWorkerPrivate(worker);
    const { scoreRecency, computeRecencyDaysBounded, computeRecencyDaysRaw } =
      workerPrivate;
    const now = new Date('2024-01-15T00:00:00.000Z');
    expect(scoreRecency(0, 100)).toBe(5);
    expect(scoreRecency(20, 100)).toBe(4);
    expect(scoreRecency(40, 100)).toBe(3);
    expect(scoreRecency(75, 100)).toBe(2);
    expect(scoreRecency(150, 100)).toBe(1);

    expect(
      computeRecencyDaysBounded(new Date('2023-12-31T00:00:00.000Z'), 100, now),
    ).toBe(15);
    expect(
      computeRecencyDaysBounded(new Date('2024-03-01T00:00:00.000Z'), 100, now),
    ).toBe(0);
    expect(computeRecencyDaysBounded(null, 100, now)).toBe(100);
    expect(computeRecencyDaysRaw(null, now)).toBe(Number.POSITIVE_INFINITY);
  });

  it('segments descending metrics by threshold or quantiles', () => {
    const worker = new AnalyticsAggregatorWorker(
      asPrismaService(createPrismaMock()),
    );
    const workerPrivate = asWorkerPrivate(worker);
    const { scoreDescending, computeQuantiles } = workerPrivate;

    expect(scoreDescending(120, 100, null)).toBe(5);
    expect(scoreDescending(80, 100, null)).toBe(4);
    expect(scoreDescending(55, 100, null)).toBe(3);
    expect(scoreDescending(26, 100, null)).toBe(2);
    expect(scoreDescending(10, 100, null)).toBe(1);

    const quantiles = computeQuantiles([10, 20, 30, 40, 50]);
    expect(scoreDescending(5, null, quantiles)).toBe(1);
    expect(scoreDescending(15, null, quantiles)).toBe(2);
    expect(scoreDescending(25, null, quantiles)).toBe(3);
    expect(scoreDescending(35, null, quantiles)).toBe(4);
    expect(scoreDescending(60, null, quantiles)).toBe(5);

    const flatZeroQuantiles = computeQuantiles([0, 0, 0]);
    expect(scoreDescending(0, null, flatZeroQuantiles)).toBe(1);
    expect(scoreDescending(10, null, flatZeroQuantiles)).toBe(5);
    expect(scoreDescending(-1, null, flatZeroQuantiles)).toBe(1);

    const flatQuantiles = computeQuantiles([5, 5, 5]);
    expect(scoreDescending(5, null, flatQuantiles)).toBe(3);
    expect(scoreDescending(7, null, flatQuantiles)).toBe(5);
    expect(scoreDescending(3, null, flatQuantiles)).toBe(1);
  });

  it('picks upper quantiles for auto-thresholds and respects minimums', () => {
    const worker = new AnalyticsAggregatorWorker(
      asPrismaService(createPrismaMock()),
    );
    const workerPrivate = asWorkerPrivate(worker);
    const { computeQuantiles } = workerPrivate;

    const values = [1, 2, 3, 100];
    expect(computeQuantiles(values)).toEqual({
      q20: 1,
      q40: 2,
      q60: 2,
      q80: 3,
    });
    expect(workerPrivate.suggestUpperQuantile(values)).toBe(3);
    expect(workerPrivate.suggestUpperQuantile(values, { minimum: 10 })).toBe(
      10,
    );
    expect(workerPrivate.suggestUpperQuantile([], { minimum: 5 })).toBeNull();
  });
});

describe('AnalyticsAggregatorWorker — recalculateCustomerStatsForMerchant', () => {
  const fetchAggregatesMock = fetchReceiptAggregates as jest.MockedFunction<
    typeof fetchReceiptAggregates
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds RFM scores with auto thresholds (including recency), merges wallets and receipts, and keeps earliest firstSeenAt', async () => {
    const now = new Date('2024-02-01T00:00:00.000Z');
    jest.setSystemTime(now);

    const prisma = createPrismaMock();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        rfm: { frequency: { mode: 'auto' }, monetary: { mode: 'auto' } },
      },
    });
    prisma.wallet.findMany.mockResolvedValue([
      {
        merchantId: 'm-1',
        customerId: 'fresh',
        createdAt: new Date('2023-01-10T00:00:00.000Z'),
      },
      {
        merchantId: 'm-1',
        customerId: 'fresh',
        createdAt: new Date('2023-01-15T00:00:00.000Z'),
      },
      {
        merchantId: 'm-1',
        customerId: 'mid',
        createdAt: new Date('2023-07-01T00:00:00.000Z'),
      },
      {
        merchantId: 'm-1',
        customerId: 'lost',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
      },
      {
        merchantId: 'm-1',
        customerId: 'dormant',
        createdAt: new Date('2023-12-01T00:00:00.000Z'),
      },
    ]);

    const receipts: ReceiptAggregateRow[] = [
      {
        customerId: 'fresh',
        visits: 12,
        totalSpent: 1200,
        firstPurchaseAt: new Date('2023-06-10T00:00:00.000Z'),
        lastPurchaseAt: new Date('2024-01-31T00:00:00.000Z'),
      },
      {
        customerId: 'mid',
        visits: 6,
        totalSpent: 600,
        firstPurchaseAt: new Date('2023-08-05T00:00:00.000Z'),
        lastPurchaseAt: new Date('2023-10-01T00:00:00.000Z'),
      },
      {
        customerId: 'lost',
        visits: 1,
        totalSpent: 50,
        firstPurchaseAt: new Date('2023-02-01T00:00:00.000Z'),
        lastPurchaseAt: new Date('2023-02-01T00:00:00.000Z'),
      },
    ];
    fetchAggregatesMock.mockResolvedValue(receipts);

    const worker = new AnalyticsAggregatorWorker(asPrismaService(prisma));
    await worker.recalculateCustomerStatsForMerchant('m-1');

    expect(fetchAggregatesMock).toHaveBeenCalledWith(prisma, {
      merchantId: 'm-1',
      includeImportedBase: true,
    });
    expect(prisma.customerStats.upsert).toHaveBeenCalledTimes(4);

    const upserts = prisma.customerStats.upsert.mock.calls.map(
      ([payload]) => payload,
    ) as CustomerStatsUpsertPayload[];

    const find = (id: string) =>
      upserts.find(
        (call) => call.where.merchantId_customerId?.customerId === id,
      );

    const fresh = find('fresh');
    expect(fresh?.update).toEqual(
      expect.objectContaining({
        visits: 12,
        totalSpent: 1200,
        avgCheck: 100,
        rfmR: 5,
        rfmF: 5,
        rfmM: 5,
        rfmScore: 555,
        rfmClass: '5-5-5',
        lastOrderAt: receipts[0].lastPurchaseAt,
      }),
    );
    expect(fresh?.create.firstSeenAt?.toISOString()).toBe(
      '2023-01-10T00:00:00.000Z',
    );

    const mid = find('mid');
    expect(mid?.update).toEqual(
      expect.objectContaining({
        visits: 6,
        totalSpent: 600,
        avgCheck: 100,
        rfmR: 3,
        rfmF: 3,
        rfmM: 3,
        rfmScore: 333,
        rfmClass: '3-3-3',
      }),
    );

    const lost = find('lost');
    expect(lost?.update).toEqual(
      expect.objectContaining({
        visits: 1,
        totalSpent: 50,
        avgCheck: 50,
        rfmR: 1,
        rfmF: 1,
        rfmM: 1,
        rfmScore: 111,
        rfmClass: '1-1-1',
      }),
    );

    const dormant = find('dormant');
    expect(dormant?.update).toEqual(
      expect.objectContaining({
        visits: 0,
        totalSpent: 0,
        avgCheck: 0,
        rfmR: 1,
        rfmF: 1,
        rfmM: 1,
        rfmScore: 111,
        rfmClass: '1-1-1',
        lastOrderAt: null,
      }),
    );
    expect(dormant?.create.firstSeenAt?.toISOString()).toBe(
      '2023-12-01T00:00:00.000Z',
    );

    for (const call of upserts) {
      expect(call.update.lastSeenAt).toEqual(now);
      expect(call.create.lastSeenAt).toEqual(now);
    }
  });

  it('uses manual thresholds, rounds them, and applies custom recency horizon', async () => {
    const now = new Date('2024-03-01T00:00:00.000Z');
    jest.setSystemTime(now);

    const prisma = createPrismaMock();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        rfm: {
          recency: { mode: 'manual', days: 90.4 },
          frequency: { mode: 'manual', threshold: 8.4 },
          monetary: { mode: 'manual', threshold: 2000 },
        },
      },
    });
    prisma.wallet.findMany.mockResolvedValue([
      {
        merchantId: 'm-2',
        customerId: 'manual-a',
        createdAt: new Date('2024-01-10T00:00:00.000Z'),
      },
      {
        merchantId: 'm-2',
        customerId: 'manual-b',
        createdAt: new Date('2023-12-01T00:00:00.000Z'),
      },
      {
        merchantId: 'm-2',
        customerId: 'manual-c',
        createdAt: new Date('2024-02-20T00:00:00.000Z'),
      },
    ]);

    const receipts: ReceiptAggregateRow[] = [
      {
        customerId: 'manual-a',
        visits: 9,
        totalSpent: 2100,
        firstPurchaseAt: new Date('2024-01-15T00:00:00.000Z'),
        lastPurchaseAt: new Date('2024-02-15T00:00:00.000Z'),
      },
      {
        customerId: 'manual-b',
        visits: 4,
        totalSpent: 600,
        firstPurchaseAt: new Date('2023-12-05T00:00:00.000Z'),
        lastPurchaseAt: new Date('2023-12-31T00:00:00.000Z'),
      },
    ];
    fetchAggregatesMock.mockResolvedValue(receipts);

    const worker = new AnalyticsAggregatorWorker(asPrismaService(prisma));
    await worker.recalculateCustomerStatsForMerchant('m-2');

    const upserts = prisma.customerStats.upsert.mock.calls.map(
      ([payload]) => payload,
    ) as CustomerStatsUpsertPayload[];
    expect(upserts).toHaveLength(3);

    const find = (id: string) =>
      upserts.find(
        (call) => call.where.merchantId_customerId?.customerId === id,
      );

    const manualA = find('manual-a');
    expect(manualA?.update).toEqual(
      expect.objectContaining({
        rfmR: 5,
        rfmF: 5,
        rfmM: 5,
        rfmClass: '5-5-5',
        rfmScore: 555,
      }),
    );

    const manualB = find('manual-b');
    expect(manualB?.update).toEqual(
      expect.objectContaining({
        rfmR: 2,
        rfmF: 3,
        rfmM: 2,
        rfmClass: '2-3-2',
        rfmScore: 232,
      }),
    );

    const manualC = find('manual-c');
    expect(manualC?.update).toEqual(
      expect.objectContaining({
        rfmR: 1,
        rfmF: 1,
        rfmM: 1,
        rfmClass: '1-1-1',
        rfmScore: 111,
        lastOrderAt: null,
      }),
    );

    for (const call of upserts) {
      expect(call.update.lastSeenAt).toEqual(now);
    }
  });
});
