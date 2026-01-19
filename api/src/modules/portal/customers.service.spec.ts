import { PortalCustomersService } from './customers.service';
import type { CustomerAudiencesService } from '../customer-audiences/customer-audiences.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type CustomerFindManyArgs = { where?: { AND?: unknown[] } };
type LoyaltyTierFindFirstArgs = { where?: { id?: string } };
type MockPrisma = {
  customer: {
    findUnique: MockFn;
    findFirst: MockFn;
    findMany: MockFn<unknown[], [CustomerFindManyArgs]>;
    create: MockFn;
  };
  wallet: {
    create: MockFn;
  };
  loyaltyTier: {
    findFirst: MockFn<unknown, [LoyaltyTierFindFirstArgs?]>;
  };
  loyaltyTierAssignment: {
    upsert: MockFn;
  };
};
type PrismaOverrides = {
  customer?: Partial<MockPrisma['customer']>;
  wallet?: Partial<MockPrisma['wallet']>;
  loyaltyTier?: Partial<MockPrisma['loyaltyTier']>;
  loyaltyTierAssignment?: Partial<MockPrisma['loyaltyTierAssignment']>;
};
type AudiencesStub = {
  evaluateCustomerSegments: MockFn;
};
type AggregatesStub = {
  pendingBalance: Map<string, number>;
  spendCurrentMonth: Map<string, number>;
  spendPreviousMonth: Map<string, number>;
  totalSpent: Map<string, number>;
  visitCount: Map<string, number>;
  firstPurchaseAt: Map<string, Date>;
  lastPurchaseAt: Map<string, Date>;
};
type PortalCustomersServicePrivate = {
  ensureOperationAllowed: (
    merchantId: string,
    customerId: string,
    operation: 'earn' | 'redeem',
  ) => Promise<void>;
  computeAggregates: (
    merchantId: string,
    ids: string[],
  ) => Promise<AggregatesStub>;
  buildBaseDto: (
    customer: unknown,
    aggregates: AggregatesStub,
  ) => Record<string, unknown>;
};
type CustomerGetResult = Awaited<ReturnType<PortalCustomersService['get']>>;

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asAudiencesService = (stub: AudiencesStub) =>
  stub as unknown as CustomerAudiencesService;
const asPrivateService = (service: PortalCustomersService) =>
  service as unknown as PortalCustomersServicePrivate;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const arrayContaining = <T>(value: T[]) =>
  expect.arrayContaining(value) as unknown as T[];
const buildAudiences = (): AudiencesStub => ({
  evaluateCustomerSegments: mockFn().mockResolvedValue(null),
});

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

function buildPrisma(overrides: PrismaOverrides = {}): MockPrisma {
  const base: MockPrisma = {
    customer: {
      findUnique: mockFn().mockResolvedValue(null),
      findFirst: mockFn().mockResolvedValue(null),
      findMany: mockFn<unknown[], [CustomerFindManyArgs]>().mockResolvedValue(
        [],
      ),
      create: mockFn().mockResolvedValue({ id: 'cust-1', merchantId: 'M1' }),
    },
    wallet: {
      create: mockFn().mockResolvedValue({ id: 'wallet-1' }),
    },
    loyaltyTier: {
      findFirst: mockFn<
        unknown,
        [LoyaltyTierFindFirstArgs?]
      >().mockResolvedValue({
        ...baseTier,
      }),
    },
    loyaltyTierAssignment: {
      upsert: mockFn().mockResolvedValue({}),
    },
  };

  return {
    customer: { ...base.customer, ...overrides.customer },
    wallet: { ...base.wallet, ...overrides.wallet },
    loyaltyTier: { ...base.loyaltyTier, ...overrides.loyaltyTier },
    loyaltyTierAssignment: {
      ...base.loyaltyTierAssignment,
      ...overrides.loyaltyTierAssignment,
    },
  };
}

describe('PortalCustomersService.create', () => {
  const audiences = buildAudiences();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assigns initial tier when payload has no levelId', async () => {
    const prisma = buildPrisma();
    prisma.loyaltyTier.findFirst
      .mockResolvedValueOnce({ ...baseTier })
      .mockResolvedValueOnce({ ...baseTier });
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as CustomerGetResult);

    await service.create('M1', { phone: '+79991234567' });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      objectContaining({
        create: objectContaining({ tierId: 'tier-base' }),
        update: objectContaining({ tierId: 'tier-base' }),
      }),
    );
  });

  it('respects explicit levelId and assigns requested tier', async () => {
    const prisma = buildPrisma();
    prisma.loyaltyTier.findFirst.mockImplementation(
      (args?: LoyaltyTierFindFirstArgs) => {
        if (args?.where?.id === vipTier.id) {
          return { ...vipTier };
        }
        return { ...baseTier };
      },
    );
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as CustomerGetResult);

    await service.create('M1', { phone: '+79991234567', levelId: vipTier.id });

    expect(prisma.loyaltyTier.findFirst).toHaveBeenCalledWith(
      objectContaining({ where: { merchantId: 'M1', id: vipTier.id } }),
    );
    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      objectContaining({
        create: objectContaining({ tierId: vipTier.id }),
        update: objectContaining({ tierId: vipTier.id }),
      }),
    );
  });

  it('returns existing customer when phone already exists', async () => {
    const prisma = buildPrisma();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'cust-existing',
      merchantId: 'M1',
    });
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    const getSpy = jest.spyOn(service, 'get').mockResolvedValue({
      id: 'cust-existing',
    } as CustomerGetResult);

    const result = await service.create('M1', { phone: '+79991234567' });

    expect(result).toEqual({ id: 'cust-existing' });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledWith('M1', 'cust-existing');
  });
});

describe('PortalCustomersService.ensureOperationAllowed', () => {
  const audiences = buildAudiences();

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
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    const servicePrivate = asPrivateService(service);

    await expect(
      servicePrivate.ensureOperationAllowed('M1', 'cust-1', 'earn'),
    ).rejects.toThrow('Начисления заблокированы администратором');
  });

  it('blocks redemptions when redemptionsBlocked is true', async () => {
    const prisma = buildPrisma();
    prisma.customer.findFirst.mockResolvedValueOnce({
      merchantId: 'M1',
      accrualsBlocked: false,
      redemptionsBlocked: true,
    });
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    const servicePrivate = asPrivateService(service);

    await expect(
      servicePrivate.ensureOperationAllowed('M1', 'cust-1', 'redeem'),
    ).rejects.toThrow('Списания заблокированы администратором');
  });
});

describe('PortalCustomersService.list', () => {
  const audiences = buildAudiences();

  it('excludes telegram-only customers when excludeMiniapp is true', async () => {
    const prisma = buildPrisma({
      customer: {
        findMany: mockFn<unknown[], [CustomerFindManyArgs]>().mockResolvedValue(
          [],
        ),
      },
    });
    const service = new PortalCustomersService(
      asPrismaService(prisma),
      asAudiencesService(audiences),
    );
    const servicePrivate = asPrivateService(service);
    const emptyAggregates: AggregatesStub = {
      pendingBalance: new Map(),
      spendCurrentMonth: new Map(),
      spendPreviousMonth: new Map(),
      totalSpent: new Map(),
      visitCount: new Map(),
      firstPurchaseAt: new Map(),
      lastPurchaseAt: new Map(),
    };
    jest
      .spyOn(servicePrivate, 'computeAggregates')
      .mockResolvedValue(emptyAggregates);
    jest.spyOn(servicePrivate, 'buildBaseDto').mockReturnValue({});

    await service.list('M1', { registeredOnly: false, excludeMiniapp: true });

    const where = prisma.customer.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.AND).toEqual(
      arrayContaining([
        objectContaining({
          NOT: objectContaining({
            AND: arrayContaining([
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
