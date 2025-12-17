import { PromoCodeStatus, PromoCodeUsageLimitType } from '@prisma/client';
import { PromoCodesService } from './promocodes.service';

describe('PromoCodesService — portal payload mapping', () => {
  const metrics: any = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  };

  it('creates LIMITED_PER_CUSTOMER when perCustomerLimit задан и usageLimit = none', async () => {
    const createMock = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pc_1', status: data.status }),
    );
    const prisma: any = {
      promoCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createMock,
      },
    };

    const service = new PromoCodesService(prisma, metrics);
    await service.createFromPortal('mrc_1', {
      code: 'WELCOME',
      description: 'test',
      awardPoints: true,
      points: 100,
      usageLimit: 'none',
      perCustomerLimit: 3,
      usagePeriodEnabled: true,
      usagePeriodDays: 7,
      recentVisitEnabled: true,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe(PromoCodeStatus.ACTIVE);
    expect(data.usageLimitType).toBe(PromoCodeUsageLimitType.LIMITED_PER_CUSTOMER);
    expect(data.perCustomerLimit).toBe(3);
    expect(data.usageLimitValue).toBeNull();
    expect(data.cooldownDays).toBe(7);
    expect(data.requireVisit).toBe(true);
    expect(data.visitLookbackHours).toBe(0);
  });

  it('creates ONCE_TOTAL with perCustomerLimit when usageLimit = once_total', async () => {
    const createMock = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pc_2', status: data.status }),
    );
    const prisma: any = {
      promoCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createMock,
      },
    };

    const service = new PromoCodesService(prisma, metrics);
    await service.createFromPortal('mrc_1', {
      code: 'LIMITED',
      awardPoints: true,
      points: 50,
      usageLimit: 'once_total',
      usageLimitValue: 100,
      perCustomerLimit: 2,
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.usageLimitType).toBe(PromoCodeUsageLimitType.ONCE_TOTAL);
    expect(data.usageLimitValue).toBe(100);
    expect(data.perCustomerLimit).toBe(2);
  });

  it('keeps UNLIMITED when perCustomerLimit не задан и usageLimit = none', async () => {
    const createMock = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'pc_3', status: data.status }),
    );
    const prisma: any = {
      promoCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createMock,
      },
    };

    const service = new PromoCodesService(prisma, metrics);
    await service.createFromPortal('mrc_1', {
      code: 'OPEN',
      awardPoints: false,
      points: 0,
      usageLimit: 'none',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.usageLimitType).toBe(PromoCodeUsageLimitType.UNLIMITED);
    expect(data.perCustomerLimit).toBeNull();
    expect(data.usageLimitValue).toBeNull();
  });
});

