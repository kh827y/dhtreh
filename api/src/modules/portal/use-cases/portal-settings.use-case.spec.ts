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
  getTimezone: jest.Mock;
  updateTimezone: jest.Mock;
};
type MockedPrisma = {
  merchantSettings: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
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
    getTimezone: jest.fn(),
    updateTimezone: jest.fn(),
  };
  const prisma: MockedPrisma = {
    merchantSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
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
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.merchantSettings.updateMany.mockResolvedValue({ count: 1 });

    const result = await useCase.updateSupportSetting({} as PortalRequest, {
      supportTelegram: '  @new_support  ',
    });

    expect(result).toEqual({ supportTelegram: '@new_support' });
    expect(service.validateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        reviews: { enabled: true },
        miniapp: { supportTelegram: '@new_support' },
      }),
    );
    expect(prisma.merchantSettings.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId: 'm-1' }),
        data: expect.objectContaining({
          rulesJson: expect.objectContaining({
            reviews: { enabled: true },
            miniapp: { supportTelegram: '@new_support' },
          }),
        }),
      }),
    );
  });

  it('stores null supportTelegram when value is blank', async () => {
    const { useCase, prisma } = createUseCase();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: {
        miniapp: { supportTelegram: '@old' },
      },
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.merchantSettings.updateMany.mockResolvedValue({ count: 1 });

    const result = await useCase.updateSupportSetting({} as PortalRequest, {
      supportTelegram: '   ',
    });

    expect(result).toEqual({ supportTelegram: null });
    expect(prisma.merchantSettings.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rulesJson: expect.objectContaining({
            miniapp: { supportTelegram: null },
          }),
        }),
      }),
    );
  });

  it('returns timezone payload with available options', async () => {
    const { useCase, service } = createUseCase();
    service.getTimezone.mockResolvedValue({
      code: 'MSK+3',
      label: 'МСК+3',
      city: 'Екатеринбург',
      description: 'Урал',
      mskOffset: 3,
      utcOffsetMinutes: 360,
      iana: 'Asia/Yekaterinburg',
    });

    const result = await useCase.getTimezoneSetting({} as PortalRequest);

    expect(service.getTimezone).toHaveBeenCalledWith('m-1');
    expect(result.timezone).toEqual(
      expect.objectContaining({
        code: 'MSK+3',
        iana: 'Asia/Yekaterinburg',
      }),
    );
    expect(Array.isArray(result.options)).toBe(true);
    expect(result.options.length).toBeGreaterThan(0);
    expect(
      result.options.some((item: { code?: string }) => item.code === 'MSK+3'),
    ).toBe(true);
  });

  it('updates timezone via service and returns normalized response', async () => {
    const { useCase, service } = createUseCase();
    service.updateTimezone.mockResolvedValue({
      code: 'MSK+4',
      label: 'МСК+4',
      city: 'Новосибирск',
      description: 'Сибирь',
      mskOffset: 4,
      utcOffsetMinutes: 420,
      iana: 'Asia/Novosibirsk',
    });

    const result = await useCase.updateTimezoneSetting({} as PortalRequest, {
      code: 'MSK+4',
    });

    expect(service.updateTimezone).toHaveBeenCalledWith('m-1', 'MSK+4');
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        timezone: expect.objectContaining({
          code: 'MSK+4',
          iana: 'Asia/Novosibirsk',
        }),
      }),
    );
    expect(Array.isArray(result.options)).toBe(true);
    expect(result.options.length).toBeGreaterThan(0);
  });
});
