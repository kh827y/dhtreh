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
});
