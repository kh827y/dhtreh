import { OperationsLogService } from '../operations-log.service';
import type { LoyaltyService } from '../../../loyalty/services/loyalty.service';
import type { PrismaService } from '../../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../../core/config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockPrisma = {
  receipt: {
    count: MockFn;
    findMany: MockFn;
  };
  review: {
    findMany: MockFn;
  };
  transaction: {
    count: MockFn;
    findMany: MockFn;
    groupBy: MockFn;
  };
};
type LoyaltyStub = {
  refund: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asLoyaltyService = (stub: LoyaltyStub) =>
  stub as unknown as LoyaltyService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

describe('OperationsLogService', () => {
  const prisma: MockPrisma = {
    receipt: { count: mockFn(), findMany: mockFn() },
    review: { findMany: mockFn() },
    transaction: {
      count: mockFn(),
      findMany: mockFn(),
      groupBy: mockFn(),
    },
  };

  const loyalty: LoyaltyStub = {
    refund: mockFn(),
  };

  let service: OperationsLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsLogService(
      asPrismaService(prisma),
      asLoyaltyService(loyalty),
      new AppConfigService(),
    );
    prisma.receipt.count.mockResolvedValue(0);
    prisma.transaction.count.mockResolvedValue(0);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.groupBy.mockResolvedValue([]);
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
    prisma.review.findMany.mockResolvedValue([
      { orderId: 'order-1', rating: 4 },
    ]);

    const result = await service.list('m1', { direction: 'ALL' });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'r1',
      rating: 4,
      redeem: { amount: 100 },
      earn: { amount: 50 },
      carrier: { type: 'OUTLET', label: 'Главный зал', code: 'o1' },
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
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transaction.groupBy
      .mockResolvedValueOnce([]) // earn/redeem groups
      .mockResolvedValueOnce([{ orderId: 'order-1', _count: { _all: 2 } }]); // refund groups
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
      objectContaining({
        where: objectContaining({ redeemApplied: { gt: 0 } }),
      }),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({ amount: { lt: 0 } }),
      }),
    );
  });
});
