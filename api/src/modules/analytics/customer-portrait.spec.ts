import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  receipt: { findMany: MockFn<Promise<unknown[]>, [unknown]> };
  transaction: { findMany: MockFn<Promise<unknown[]>, [unknown]> };
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

describe('AnalyticsService — customer portrait', () => {
  it('запрашивает только чеки с customerId и учитывает отмены/возвраты', async () => {
    const receiptFindMany = mockFn<
      Promise<unknown[]>,
      [unknown]
    >().mockResolvedValue([]);
    const txnFindMany = mockFn<
      Promise<unknown[]>,
      [unknown]
    >().mockResolvedValue([]);

    const prisma: PrismaStub = {
      receipt: { findMany: receiptFindMany },
      transaction: { findMany: txnFindMany },
    };

    const service = new AnalyticsService(
      asPrismaService(prisma),
      {} as ConfigService,
    );

    const period = {
      from: new Date('2024-01-01T00:00:00.000Z'),
      to: new Date('2024-01-31T23:59:59.999Z'),
      type: 'month' as const,
    };

    await service.getCustomerPortrait('m-1', period);

    expect(receiptFindMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({
          merchantId: 'm-1',
          canceledAt: null,
          createdAt: { gte: period.from, lte: period.to },
        }),
      }),
    );
  });
});
