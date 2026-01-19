import { StaffMotivationService } from '../staff-motivation.service';
import type { PrismaService } from '../../../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MerchantSettingsRecord = {
  staffMotivationEnabled: boolean;
  staffMotivationNewCustomerPoints: number;
  staffMotivationExistingCustomerPoints: number;
  staffMotivationLeaderboardPeriod: string;
  staffMotivationCustomDays: number | null;
  updatedAt: Date;
};
type PrismaStub = {
  merchantSettings: {
    findUnique: MockFn<Promise<MerchantSettingsRecord | null>, [unknown?]>;
    upsert: MockFn<Promise<MerchantSettingsRecord>, [unknown]>;
  };
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const anyValue = <T>(ctor: new (...args: never[]) => T) =>
  expect.any(ctor) as unknown as T;

describe('StaffMotivationService', () => {
  const prisma: PrismaStub = {
    merchantSettings: {
      findUnique: mockFn(),
      upsert: mockFn(),
    },
  };

  let service: StaffMotivationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaffMotivationService(asPrismaService(prisma));
    prisma.merchantSettings.findUnique.mockResolvedValue(null);
    prisma.merchantSettings.upsert.mockResolvedValue({
      staffMotivationEnabled: true,
      staffMotivationNewCustomerPoints: 5,
      staffMotivationExistingCustomerPoints: 3,
      staffMotivationLeaderboardPeriod: 'custom',
      staffMotivationCustomDays: 10,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
  });

  it('returns defaults when settings are not present', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue(null);
    const settings = await service.getSettings('m1');
    expect(settings).toMatchObject({
      enabled: false,
      pointsForNewCustomer: 30,
      pointsForExistingCustomer: 10,
      leaderboardPeriod: 'week',
    });
  });

  it('validates custom period days', async () => {
    await expect(
      service.updateSettings('m1', {
        enabled: true,
        pointsForNewCustomer: 5,
        pointsForExistingCustomer: 1,
        leaderboardPeriod: 'custom',
        customDays: 0,
      }),
    ).rejects.toThrow(
      'Для собственного периода укажите количество дней от 1 до 365',
    );
  });

  it('updates settings with normalization', async () => {
    const result = await service.updateSettings('m1', {
      enabled: true,
      pointsForNewCustomer: 5.2,
      pointsForExistingCustomer: 3.8,
      leaderboardPeriod: 'custom',
      customDays: 10,
    });

    expect(prisma.merchantSettings.upsert).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      create: anyValue(Object),
      update: anyValue(Object),
    });
    expect(result).toMatchObject({
      enabled: true,
      pointsForNewCustomer: 5,
      customDays: 10,
    });
  });
});
