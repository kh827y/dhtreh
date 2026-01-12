import { PortalCustomersService } from './customers.service';

const baseTier = {
  id: 'tier-base',
  name: 'Base',
  isInitial: true,
  thresholdAmount: 0,
};

const vipTier = {
  id: 'tier-vip',
  name: 'VIP',
  isInitial: false,
  thresholdAmount: 1000,
};

function buildPrisma() {
  return {
    customer: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'cust-1', merchantId: 'M1' })),
    },
    wallet: {
      create: jest.fn(async () => ({ id: 'wallet-1' })),
    },
    loyaltyTier: {
      findFirst: jest.fn(async () => ({ ...baseTier })),
    },
    loyaltyTierAssignment: {
      upsert: jest.fn(async () => ({})),
    },
  } as any;
}

describe('PortalCustomersService.create', () => {
  const audiences = {
    evaluateCustomerSegments: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assigns initial tier when payload has no levelId', async () => {
    const prisma = buildPrisma();
    prisma.loyaltyTier.findFirst
      .mockResolvedValueOnce({ ...baseTier })
      .mockResolvedValueOnce({ ...baseTier });
    const service = new PortalCustomersService(prisma, audiences as any);
    jest.spyOn(service as any, 'get').mockResolvedValue({});

    await service.create('M1', { phone: '+79991234567' });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tierId: 'tier-base' }),
        update: expect.objectContaining({ tierId: 'tier-base' }),
      }),
    );
  });

  it('respects explicit levelId and assigns requested tier', async () => {
    const prisma = buildPrisma();
    prisma.loyaltyTier.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.id === vipTier.id) {
        return { ...vipTier };
      }
      return { ...baseTier };
    });
    const service = new PortalCustomersService(prisma, audiences as any);
    jest.spyOn(service as any, 'get').mockResolvedValue({});

    await service.create('M1', { phone: '+79991234567', levelId: vipTier.id });

    expect(prisma.loyaltyTier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'M1', id: vipTier.id } }),
    );
    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tierId: vipTier.id }),
        update: expect.objectContaining({ tierId: vipTier.id }),
      }),
    );
  });

  it('returns existing customer when phone already exists', async () => {
    const prisma = buildPrisma();
    prisma.customer.findUnique.mockResolvedValueOnce({ id: 'cust-existing', merchantId: 'M1' });
    const service = new PortalCustomersService(prisma, audiences as any);
    const getSpy = jest.spyOn(service as any, 'get').mockResolvedValue({ id: 'cust-existing' });

    const result = await service.create('M1', { phone: '+79991234567' });

    expect(result).toEqual({ id: 'cust-existing' });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledWith('M1', 'cust-existing');
  });
});

describe('PortalCustomersService.ensureOperationAllowed', () => {
  const audiences = {
    evaluateCustomerSegments: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks accruals when accrualsBlocked is true', async () => {
    const prisma = buildPrisma();
    prisma.customer.findFirst.mockResolvedValueOnce({
      merchantId: 'M1',
      accrualsBlocked: true,
      redemptionsBlocked: false,
    });
    const service = new PortalCustomersService(prisma, audiences as any);

    await expect((service as any).ensureOperationAllowed('M1', 'cust-1', 'earn')).rejects.toThrow(
      'Начисления заблокированы администратором',
    );
  });

  it('blocks redemptions when redemptionsBlocked is true', async () => {
    const prisma = buildPrisma();
    prisma.customer.findFirst.mockResolvedValueOnce({
      merchantId: 'M1',
      accrualsBlocked: false,
      redemptionsBlocked: true,
    });
    const service = new PortalCustomersService(prisma, audiences as any);

    await expect((service as any).ensureOperationAllowed('M1', 'cust-1', 'redeem')).rejects.toThrow(
      'Списания заблокированы администратором',
    );
  });
});

describe('PortalCustomersService.list', () => {
  const audiences = {
    evaluateCustomerSegments: jest.fn().mockResolvedValue(null),
  };

  it('excludes telegram-only customers when excludeMiniapp is true', async () => {
    const prisma = {
      customer: { findMany: jest.fn(async () => []) },
    } as any;
    const service = new PortalCustomersService(prisma, audiences as any);
    const emptyAggregates = {
      pendingBalance: new Map(),
      spendCurrentMonth: new Map(),
      spendPreviousMonth: new Map(),
      totalSpent: new Map(),
      visitCount: new Map(),
      firstPurchaseAt: new Map(),
      lastPurchaseAt: new Map(),
    };
    jest.spyOn(service as any, 'computeAggregates').mockResolvedValue(emptyAggregates);
    jest.spyOn(service as any, 'buildBaseDto').mockReturnValue({} as any);

    await service.list('M1', { registeredOnly: false, excludeMiniapp: true });

    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          NOT: expect.objectContaining({
            AND: expect.arrayContaining([
              { tgId: { not: null } },
              { phone: null },
              { email: null },
              { name: null },
              { profileName: null },
              { externalId: null },
            ]),
          }),
        }),
      ]),
    );
  });
});
