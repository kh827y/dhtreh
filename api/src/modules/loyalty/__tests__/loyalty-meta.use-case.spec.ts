import { LoyaltyMetaUseCase } from '../use-cases/loyalty-meta.use-case';
import type { LoyaltyService } from '../services/loyalty.service';
import type { LevelsService } from '../../levels/levels.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';

type MockedPrisma = {
  consent: {
    upsert: jest.Mock;
    delete: jest.Mock;
  };
};
type MockedSupport = {
  ensureCustomer: jest.Mock;
};

function createUseCase() {
  const service = {} as LoyaltyService;
  const levelsService = {} as LevelsService;
  const prisma: MockedPrisma = {
    consent: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
  const support: MockedSupport = {
    ensureCustomer: jest.fn(),
  };

  const useCase = new LoyaltyMetaUseCase(
    service,
    prisma as unknown as PrismaService,
    levelsService,
    support as unknown as LoyaltyControllerSupportService,
  );

  return { useCase, prisma, support };
}

describe('LoyaltyMetaUseCase', () => {
  it('requires merchantId and customerId for consent updates', async () => {
    const { useCase } = createUseCase();

    await expect(useCase.setConsent({})).rejects.toThrow(
      'merchantId and customerId required',
    );
  });

  it('upserts consent when granted', async () => {
    const { useCase, prisma, support } = createUseCase();
    support.ensureCustomer.mockResolvedValue({ id: 'cust-1' });

    const result = await useCase.setConsent({
      merchantId: ' m-1 ',
      customerId: ' c-1 ',
      granted: true,
    });

    expect(support.ensureCustomer).toHaveBeenCalledWith('m-1', 'c-1');
    expect(prisma.consent.upsert).toHaveBeenCalledWith({
      where: {
        merchantId_customerId: { merchantId: 'm-1', customerId: 'cust-1' },
      },
      update: { consentAt: expect.any(Date) },
      create: {
        merchantId: 'm-1',
        customerId: 'cust-1',
        consentAt: expect.any(Date),
      },
    });
    expect(result).toEqual({ ok: true });
  });
});
