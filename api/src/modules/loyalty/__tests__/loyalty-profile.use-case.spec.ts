import { LoyaltyProfileUseCase } from '../use-cases/loyalty-profile.use-case';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import type { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';

type MockedSupport = {
  ensureCustomer: jest.Mock;
  toProfileDto: jest.Mock;
};

function createUseCase() {
  const prisma = {} as PrismaService;
  const cache = {} as LookupCacheService;
  const support: MockedSupport = {
    ensureCustomer: jest.fn(),
    toProfileDto: jest.fn(),
  };

  const useCase = new LoyaltyProfileUseCase(
    prisma,
    cache,
    support as unknown as LoyaltyControllerSupportService,
  );

  return { useCase, support };
}

describe('LoyaltyProfileUseCase', () => {
  it('returns phone status from customer', async () => {
    const { useCase, support } = createUseCase();
    support.ensureCustomer.mockResolvedValue({ phone: null });

    const result = await useCase.getProfilePhoneStatus('m-1', 'c-1');

    expect(result).toEqual({ hasPhone: false });
  });

  it('returns profile dto from support', async () => {
    const { useCase, support } = createUseCase();
    const customer = { id: 'c-1', phone: '+7' };
    support.ensureCustomer.mockResolvedValue(customer);
    support.toProfileDto.mockReturnValue({ customerId: 'c-1', name: 'User' });

    const result = await useCase.getProfile('m-1', 'c-1');

    expect(support.ensureCustomer).toHaveBeenCalledWith('m-1', 'c-1');
    expect(support.toProfileDto).toHaveBeenCalledWith(customer);
    expect(result).toEqual({ customerId: 'c-1', name: 'User' });
  });
});
