import { OperationsLogService } from '../operations-log.service';

describe('OperationsLogService', () => {
  const prisma = {
    receipt: { count: jest.fn(), findMany: jest.fn() },
    review: { findMany: jest.fn() },
    transaction: { count: jest.fn(), findMany: jest.fn() },
  } as any;

  const loyalty = {
    refund: jest.fn(),
  } as any;

  let service: OperationsLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsLogService(prisma, loyalty);
    prisma.receipt.count.mockResolvedValue(0);
    prisma.transaction.count.mockResolvedValue(0);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.review.findMany.mockResolvedValue([]);
  });

  it('maps receipts to log DTO', async () => {
    const createdAt = new Date('2025-01-01T10:00:00.000Z');
    prisma.receipt.count.mockResolvedValue(1);
    prisma.receipt.findMany.mockResolvedValue([
      {
        id: 'r1',
        merchantId: 'm1',
        customer: { id: 'c1', name: 'Иван', phone: '+79990001122' },
        staff: {
          id: 's1',
          firstName: 'Анна',
          lastName: 'Смирнова',
          status: 'ACTIVE',
          login: null,
          email: null,
        },
        outlet: {
          id: 'o1',
          name: 'Главный зал',
          posType: 'SMART',
          code: 'POS-1',
          externalId: null,
        },
        device: null,
        canceledBy: null,
        canceledAt: null,
        redeemApplied: 100,
        earnApplied: 50,
        total: 1200,
        receiptNumber: '0001',
        orderId: 'order-1',
        createdAt,
      },
    ]);
    prisma.review.findMany.mockResolvedValue([{ orderId: 'order-1', rating: 4 }]);

    const result = await service.list('m1', { direction: 'ALL' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'r1',
      rating: 4,
      redeem: { amount: 100 },
      earn: { amount: 50 },
      carrier: { type: 'SMART', label: 'Главный зал', code: 'POS-1' },
    });
  });

  it('falls back to receipt id when orderId is missing', async () => {
    const createdAt = new Date('2025-01-02T11:00:00.000Z');
    prisma.receipt.count.mockResolvedValue(1);
    prisma.receipt.findMany.mockResolvedValue([
      {
        id: 'r2',
        merchantId: 'm1',
        customer: { id: 'c2', name: 'Мария', phone: null },
        staff: null,
        outlet: null,
        device: null,
        canceledBy: null,
        canceledAt: null,
        redeemApplied: 0,
        earnApplied: 10,
        total: 500,
        receiptNumber: null,
        orderId: null,
        createdAt,
      },
    ]);

    const result = await service.list('m1', { direction: 'ALL' });

    expect(result.items[0].orderId).toBe('r2');
  });

  it('merges refund transactions by orderId and keeps latest date', async () => {
    prisma.transaction.count.mockResolvedValue(2);
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 't1',
        merchantId: 'm1',
        customer: { id: 'c1', name: 'Иван', phone: null },
        staff: null,
        outlet: null,
        device: null,
        canceledBy: null,
        canceledAt: null,
        orderId: 'order-1',
        amount: -100,
        type: 'REFUND',
        createdAt: new Date('2025-01-01T09:00:00.000Z'),
        metadata: { receiptNumber: '0001' },
      },
      {
        id: 't2',
        merchantId: 'm1',
        customer: { id: 'c1', name: 'Иван', phone: null },
        staff: null,
        outlet: null,
        device: null,
        canceledBy: null,
        canceledAt: null,
        orderId: 'order-1',
        amount: 50,
        type: 'REFUND',
        createdAt: new Date('2025-01-02T10:00:00.000Z'),
        metadata: { receiptNumber: '0001' },
      },
    ]);

    const result = await service.list('m1', { direction: 'ALL' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      kind: 'REFUND',
      orderId: 'order-1',
      earn: { amount: 50 },
      redeem: { amount: 100 },
      change: -50,
      occurredAt: '2025-01-02T10:00:00.000Z',
    });
  });

  it('applies redeem direction filters to receipts and transactions', async () => {
    await service.list('m1', { direction: 'REDEEM' });

    expect(prisma.receipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ redeemApplied: { gt: 0 } }),
      }),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ amount: { lt: 0 } }),
      }),
    );
  });
});
