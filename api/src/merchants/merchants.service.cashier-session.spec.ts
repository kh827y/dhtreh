import { MerchantsService } from './merchants.service';

describe('MerchantsService cashier sessions', () => {
  const fixedNow = new Date('2025-01-01T00:00:00.000Z');

  const makePrisma = () => {
    const staff = {
      id: 'S-1',
      merchantId: 'M-123',
      status: 'ACTIVE',
      login: 'alice',
      firstName: 'Алиса',
      lastName: 'Фриман',
      role: 'CASHIER',
    };

    const access = {
      id: 'A-1',
      outletId: 'O-1',
      pinCode: '1234',
      status: 'ACTIVE',
      staff,
      outlet: { id: 'O-1', name: 'Флагманский магазин' },
    };

    const prisma: any = {
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
      staffOutletAccess: {
        findMany: jest.fn().mockResolvedValue([access]),
      },
      cashierSession: {
        create: jest.fn().mockImplementation(async (args: any) => ({
          id: 'CS-1',
          merchantId: args.data.merchantId,
          staffId: args.data.staffId,
          outletId: args.data.outletId,
          startedAt: new Date(),
          lastSeenAt: new Date(),
          tokenHash: args.data.tokenHash,
          rememberPin: args.data.rememberPin,
          expiresAt: args.data.expiresAt,
          staff,
          outlet: { id: 'O-1', name: 'Флагманский магазин' },
        })),
      },
      staff: {
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    };

    return prisma;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets expiresAt for non-remembered sessions (12h)', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    const prisma = makePrisma();
    const svc = new MerchantsService(prisma);

    await svc.startCashierSessionByMerchantId('M-123', '1234', false);

    const createArgs = prisma.cashierSession.create.mock.calls[0]?.[0];
    expect(createArgs.data.rememberPin).toBe(false);
    expect(createArgs.data.expiresAt).toEqual(
      new Date('2025-01-01T12:00:00.000Z'),
    );
  });

  it('sets expiresAt for remembered sessions (~180 days)', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    const prisma = makePrisma();
    const svc = new MerchantsService(prisma);

    await svc.startCashierSessionByMerchantId('M-123', '1234', true);

    const createArgs = prisma.cashierSession.create.mock.calls[0]?.[0];
    expect(createArgs.data.rememberPin).toBe(true);
    expect(createArgs.data.expiresAt).toEqual(
      new Date('2025-06-30T00:00:00.000Z'),
    );
  });
});
