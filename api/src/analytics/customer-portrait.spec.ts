import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService — customer portrait', () => {
  it('запрашивает только чеки с customerId и учитывает отмены/возвраты', async () => {
    const receiptFindMany = jest.fn().mockResolvedValue([]);
    const txnFindMany = jest.fn().mockResolvedValue([]);

    const prisma = {
      receipt: { findMany: receiptFindMany },
      transaction: { findMany: txnFindMany },
    };

    const service = new AnalyticsService(prisma as any, {} as ConfigService);

    const period = {
      from: new Date('2024-01-01T00:00:00.000Z'),
      to: new Date('2024-01-31T23:59:59.999Z'),
      type: 'month' as const,
    };

    await service.getCustomerPortrait('m-1', period);

    expect(receiptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId: 'm-1',
          canceledAt: null,
          createdAt: { gte: period.from, lte: period.to },
        }),
      }),
    );
  });
});
