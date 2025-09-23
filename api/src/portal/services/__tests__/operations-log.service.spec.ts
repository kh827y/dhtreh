import { OperationsLogService } from '../operations-log.service';

describe('OperationsLogService', () => {
  const prisma = {
    receipt: { count: jest.fn(), findMany: jest.fn() },
    review: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  let service: OperationsLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsLogService(prisma);
  });

  it('maps receipts to log DTO', async () => {
    const createdAt = new Date('2025-01-01T10:00:00.000Z');
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: 'r1',
          merchantId: 'm1',
          customer: { id: 'c1', name: 'Иван', phone: '+79990001122' },
          staff: { id: 's1', firstName: 'Анна', lastName: 'Смирнова', status: 'ACTIVE' },
          outlet: { id: 'o1', name: 'Главный зал' },
          device: { id: 'd1', type: 'SMART', label: 'Касса 1' },
          redeemApplied: 100,
          earnApplied: 50,
          total: 1200,
          receiptNumber: '0001',
          orderId: 'order-1',
          createdAt,
        },
      ],
    ]);
    prisma.review.findMany.mockResolvedValue([{ orderId: 'order-1', rating: 4 }]);

    const result = await service.list('m1', { direction: 'ALL' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'r1',
      rating: 4,
      redeem: { amount: 100 },
      earn: { amount: 50 },
      carrier: { type: 'SMART', label: 'Касса 1' },
    });
  });
});
