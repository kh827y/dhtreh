import { LoyaltyCashierUseCase } from '../use-cases/loyalty-cashier.use-case';
import type { LoyaltyService } from '../services/loyalty.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { MerchantsService } from '../../merchants/merchants.service';
import type { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import type { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import type { CashierRequest } from '../controllers/loyalty-controller.types';

type MockedService = {
  outletTransactions: jest.Mock<
    Promise<unknown>,
    [string, string, number, Date | undefined]
  >;
};

function createUseCase() {
  const service: MockedService = {
    outletTransactions: jest.fn<
      Promise<unknown>,
      [string, string, number, Date | undefined]
    >(),
  };
  const prisma = {} as PrismaService;
  const merchants = {} as MerchantsService;
  const cache = {} as LookupCacheService;
  const support = {} as LoyaltyControllerSupportService;

  const useCase = new LoyaltyCashierUseCase(
    service as unknown as LoyaltyService,
    prisma,
    merchants,
    cache,
    support,
  );

  return { useCase, service };
}

describe('LoyaltyCashierUseCase', () => {
  it('requires merchantId for outlet transactions without session', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.cashierOutletTransactions({} as CashierRequest),
    ).rejects.toThrow('merchantId required');
  });

  it('requires outletId for outlet transactions without outlet in session', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.cashierOutletTransactions({
        cashierSession: { merchantId: 'm-1' },
      } as CashierRequest),
    ).rejects.toThrow('outletId required');
  });

  it('delegates outlet transactions with bounded limit', async () => {
    const { useCase, service } = createUseCase();
    service.outletTransactions.mockResolvedValue({ ok: true });

    const req = {
      cashierSession: { merchantId: 'm-1', outletId: 'o-1' },
    } as CashierRequest;
    const beforeStr = '2024-01-01T00:00:00.000Z';

    const result = await useCase.cashierOutletTransactions(
      req,
      undefined,
      undefined,
      '500',
      beforeStr,
    );

    const [, , limit, before] = service.outletTransactions.mock.calls[0] as [
      string,
      string,
      number,
      Date | undefined,
    ];
    expect(limit).toBe(100);
    expect((before as Date).toISOString()).toBe(
      new Date(beforeStr).toISOString(),
    );
    expect(result).toEqual({ ok: true });
  });
});
