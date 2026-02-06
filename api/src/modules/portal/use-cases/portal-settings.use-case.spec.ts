import { PortalSettingsUseCase } from './portal-settings.use-case';
import type { MerchantsService } from '../../merchants/merchants.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { StaffMotivationService } from '../services/staff-motivation.service';
import type { ReferralService } from '../../referral/referral.service';
import type { PortalRequestHelper } from '../helpers/portal-request.helper';
import type { PortalSettingsHelper } from '../helpers/portal-settings.helper';
import type { PortalRequest } from '../portal.types';

type MockedService = {
  validateRules: jest.Mock;
};
type MockedPrisma = {
  merchantSettings: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  merchant: {
    upsert: jest.Mock;
  };
};
type MockedRequestHelper = {
  getMerchantId: jest.Mock;
};

function createUseCase() {
  const service: MockedService = {
    validateRules: jest.fn(),
  };
  const prisma: MockedPrisma = {
    merchantSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    merchant: {
      upsert: jest.fn(),
    },
  };
  const requestHelper: MockedRequestHelper = {
    getMerchantId: jest.fn().mockReturnValue('m-1'),
  };

  const useCase = new PortalSettingsUseCase(
    service as unknown as MerchantsService,
    prisma as unknown as PrismaService,
    {} as StaffMotivationService,
    {} as ReferralService,
    requestHelper as unknown as PortalRequestHelper,
    {} as PortalSettingsHelper,
  );

  return { useCase, service, prisma, requestHelper };
}

describe('PortalSettingsUseCase support setting', () => {
  it('returns trimmed supportTelegram from rulesJson', async () => {
    const { useCase, prisma } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        miniapp: {
          supportTelegram: '  @support_bot  ',
        },
      },
    });

    const result = await useCase.getSupportSetting({} as PortalRequest);

    expect(result).toEqual({ supportTelegram: '@support_bot' });
  });

  it('stores supportTelegram in rules and validates updated rules', async () => {
    const { useCase, service, prisma } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        reviews: { enabled: true },
      },
    });
    prisma.merchant.upsert.mockResolvedValue({ id: 'm-1' });
    prisma.merchantSettings.upsert.mockResolvedValue({ merchantId: 'm-1' });

    const result = await useCase.updateSupportSetting(
      {} as PortalRequest,
      { supportTelegram: '  @new_support  ' },
    );

    expect(result).toEqual({ supportTelegram: '@new_support' });
    expect(service.validateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        reviews: { enabled: true },
        miniapp: { supportTelegram: '@new_support' },
      }),
    );
    expect(prisma.merchantSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId: 'm-1' },
        update: {
          rulesJson: expect.objectContaining({
            reviews: { enabled: true },
            miniapp: { supportTelegram: '@new_support' },
          }),
        },
      }),
    );
  });

  it('stores null supportTelegram when value is blank', async () => {
    const { useCase, prisma } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        miniapp: { supportTelegram: '@old' },
      },
    });
    prisma.merchant.upsert.mockResolvedValue({ id: 'm-1' });
    prisma.merchantSettings.upsert.mockResolvedValue({ merchantId: 'm-1' });

    const result = await useCase.updateSupportSetting(
      {} as PortalRequest,
      { supportTelegram: '   ' },
    );

    expect(result).toEqual({ supportTelegram: null });
    expect(prisma.merchantSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          rulesJson: expect.objectContaining({
            miniapp: { supportTelegram: null },
          }),
        },
      }),
    );
  });
});
