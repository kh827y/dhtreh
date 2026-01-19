import { BadRequestException } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import type { LoyaltyService } from './loyalty.service';
import type { LevelsService } from '../levels/levels.service';
import type { MerchantsService } from '../merchants/merchants.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PromoCodesService } from '../promocodes/promocodes.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { ReviewService } from '../reviews/review.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type MockPrisma = {
  $transaction: MockFn<
    Promise<unknown>,
    [(tx: MockPrisma) => Promise<unknown>]
  >;
  customer: MockModel;
  customerTelegram: MockModel;
  wallet: MockModel;
  transaction: MockModel;
  [key: string]: MockModel | MockFn | undefined;
};
type PrismaOverrides = Partial<MockPrisma>;
type CustomerFindUniqueArgs = {
  where?: { id?: string; merchantId_phone?: { phone?: string } };
};
type CustomerUpdateArgs = {
  where: { id: string };
  data: Partial<CustomerRecord> & Record<string, unknown>;
};
type SaveProfileResult = {
  customerId?: string | null;
  name?: string | null;
  gender?: string | null;
  birthDate?: string | null;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const mockFnWithImpl = <Return, Args extends unknown[]>(
  impl: (...args: Args) => Return,
) => mockFn<Return, Args>().mockImplementation(impl);
const asLoyaltyService = (stub: Record<string, unknown>) =>
  stub as unknown as LoyaltyService;
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asMetricsService = (stub: Record<string, unknown>) =>
  stub as unknown as MetricsService;
const asPromoCodesService = (stub: Record<string, unknown>) =>
  stub as unknown as PromoCodesService;
const asMerchantsService = (stub: Record<string, unknown>) =>
  stub as unknown as MerchantsService;
const asReviewService = (stub: Record<string, unknown>) =>
  stub as unknown as ReviewService;
const asLevelsService = (stub: Record<string, unknown>) =>
  stub as unknown as LevelsService;

type CustomerRecord = {
  id: string;
  merchantId: string;
  tgId?: string | null;
  phone?: string | null;
  name?: string | null;
  profileName?: string | null;
  gender?: string | null;
  birthday?: Date | null;
  profileGender?: string | null;
  profileBirthDate?: Date | null;
  profileCompletedAt?: Date | null;
};

function createPrismaMock(overrides: PrismaOverrides = {}): MockPrisma {
  const base: MockPrisma = {
    $transaction: mockFnWithImpl((fn: (tx: MockPrisma) => Promise<unknown>) =>
      fn(base),
    ),
    customer: {
      findUnique: mockFn().mockResolvedValue(null),
      findFirst: mockFn().mockResolvedValue(null),
      update: mockFn().mockResolvedValue(null),
    },
    customerTelegram: {
      upsert: mockFn().mockResolvedValue(null),
    },
    wallet: {
      upsert: mockFn().mockResolvedValue(null),
      findFirst: mockFn().mockResolvedValue(null),
    },
    transaction: {
      count: mockFn().mockResolvedValue(0),
    },
  };
  const merged: MockPrisma = { ...base, ...overrides };
  for (const key of Object.keys(overrides)) {
    const baseValue = base[key];
    const overrideValue = overrides[key];
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      merged[key] = { ...baseValue, ...overrideValue };
    }
  }
  merged.$transaction = mockFnWithImpl(
    (fn: (tx: MockPrisma) => Promise<unknown>) => fn(merged),
  );
  return merged;
}

function createController(prismaOverrides: PrismaOverrides = {}) {
  const prisma = createPrismaMock(prismaOverrides);
  const controller = new LoyaltyController(
    asLoyaltyService({}),
    asPrismaService(prisma),
    asMetricsService({}),
    asPromoCodesService({}),
    asMerchantsService({}),
    asReviewService({}),
    asLevelsService({}),
  );
  return { controller, prisma };
}

describe('LoyaltyController.saveProfile', () => {
  it('мерджит клиента по телефону и возвращает существующий customerId', async () => {
    const current: CustomerRecord = {
      id: 'cust-new',
      merchantId: 'm-1',
      tgId: 'tg-1',
      phone: null,
      name: null,
      profileName: null,
      gender: null,
      birthday: null,
      profileCompletedAt: null,
    };
    const existing: CustomerRecord = {
      id: 'cust-existing',
      merchantId: 'm-1',
      tgId: null,
      phone: '+79001234567',
      name: 'Импортное имя',
      profileName: null,
      gender: 'female',
      birthday: new Date('1980-01-01T00:00:00.000Z'),
      profileCompletedAt: null,
    };

    const prismaOverrides: PrismaOverrides = {
      customer: {
        findUnique: mockFnWithImpl(({ where }: CustomerFindUniqueArgs) => {
          if (where?.id === current.id) return current;
          const phone = where?.merchantId_phone?.phone;
          if (phone === existing.phone || phone === '79001234567')
            return existing;
          return null;
        }),
        update: mockFnWithImpl(({ where, data }: CustomerUpdateArgs) => {
          if (where.id === existing.id) return { ...existing, ...data };
          if (where.id === current.id) return { ...current, ...data };
          return { id: where.id, ...data };
        }),
      },
    };

    const { controller, prisma } = createController(prismaOverrides);

    const result = (await controller.saveProfile({
      merchantId: 'm-1',
      customerId: 'cust-new',
      name: 'Пользователь',
      gender: 'male',
      birthDate: '1990-01-01',
      phone: '+7 (900) 123-45-67',
    })) as SaveProfileResult;

    expect(result.customerId).toBe('cust-existing');
    expect(result.name).toBe('Пользователь');
    expect(result.gender).toBe('female');
    expect(result.birthDate).toBe('1980-01-01');

    const existingUpdates = prisma.customer.update.mock.calls
      .map(([args]) => args as CustomerUpdateArgs)
      .filter((args) => args.where?.id === existing.id);
    const profileUpdate = existingUpdates.find((args) =>
      Object.prototype.hasOwnProperty.call(args.data, 'profileName'),
    );
    expect(profileUpdate?.data?.name).toBeUndefined();
    expect(profileUpdate?.data?.gender).toBeUndefined();
    expect(profileUpdate?.data?.birthday).toBeUndefined();
    expect(prisma.customerTelegram.upsert).toHaveBeenCalled();
  });

  it('ошибается при конфликте телефона с другим tgId', async () => {
    const current: CustomerRecord = {
      id: 'cust-new',
      merchantId: 'm-1',
      tgId: 'tg-1',
      phone: null,
      name: null,
      profileName: null,
      gender: null,
      birthday: null,
      profileCompletedAt: null,
    };
    const existing: CustomerRecord = {
      id: 'cust-existing',
      merchantId: 'm-1',
      tgId: 'tg-other',
      phone: '+79001234567',
      name: 'Импортное имя',
      profileName: null,
      gender: 'female',
      birthday: new Date('1980-01-01T00:00:00.000Z'),
      profileCompletedAt: null,
    };

    const { controller } = createController({
      customer: {
        findUnique: mockFnWithImpl(({ where }: CustomerFindUniqueArgs) => {
          if (where?.id === current.id) return current;
          const phone = where?.merchantId_phone?.phone;
          if (phone === existing.phone || phone === '79001234567')
            return existing;
          return null;
        }),
        update: mockFn(),
      },
    });

    await expect(
      controller.saveProfile({
        merchantId: 'm-1',
        customerId: 'cust-new',
        name: 'Пользователь',
        gender: 'male',
        birthDate: '1990-01-01',
        phone: '+7 (900) 123-45-67',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('записывает имя и профиль, если импортных данных нет', async () => {
    const current: CustomerRecord = {
      id: 'cust-new',
      merchantId: 'm-1',
      tgId: 'tg-1',
      phone: null,
      name: null,
      profileName: null,
      gender: null,
      birthday: null,
      profileCompletedAt: null,
    };

    const { controller, prisma } = createController({
      customer: {
        findUnique: mockFnWithImpl(({ where }: CustomerFindUniqueArgs) => {
          if (where?.id === current.id) return current;
          return null;
        }),
        update: mockFnWithImpl(({ where, data }: CustomerUpdateArgs) => ({
          ...current,
          ...data,
          id: where.id,
          merchantId: current.merchantId,
        })),
      },
    });

    const result = (await controller.saveProfile({
      merchantId: 'm-1',
      customerId: 'cust-new',
      name: 'Пользователь',
      gender: 'male',
      birthDate: '1990-01-01',
      phone: '+7 (900) 123-45-67',
    })) as SaveProfileResult;

    expect(result.customerId ?? null).toBeNull();
    expect(result.name).toBe('Пользователь');
    expect(result.gender).toBe('male');
    expect(result.birthDate).toBe('1990-01-01');

    const updateArgs = prisma.customer.update.mock
      .calls[0][0] as CustomerUpdateArgs;
    expect(updateArgs.data.profileName).toBe('Пользователь');
    expect(updateArgs.data.name).toBe('Пользователь');
    expect(updateArgs.data.gender).toBe('male');
    expect(updateArgs.data.birthday).toBeInstanceOf(Date);
  });
});
