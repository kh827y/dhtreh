import { BadRequestException } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';

type PrismaMock = Record<string, any>;

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

function createPrismaMock(overrides: PrismaMock = {}) {
  const prisma: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma),
    customer: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
    },
    customerTelegram: {
      upsert: jest.fn().mockResolvedValue(null),
    },
    wallet: {
      upsert: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    transaction: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return Object.assign(prisma, overrides);
}

function createController(prismaOverrides: PrismaMock = {}) {
  const prisma = createPrismaMock(prismaOverrides) as any;
  const controller = new LoyaltyController(
    {} as any,
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
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

    const prismaOverrides: PrismaMock = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(current),
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(({ where, data }) => {
          if (where.id === existing.id) return { ...existing, ...data };
          if (where.id === current.id) return { ...current, ...data };
          return { id: where.id, ...data };
        }),
      },
    };

    const { controller, prisma } = createController(prismaOverrides);

    const result = await controller.saveProfile({
      merchantId: 'm-1',
      customerId: 'cust-new',
      name: 'Пользователь',
      gender: 'male',
      birthDate: '1990-01-01',
      phone: '+7 (900) 123-45-67',
    });

    expect(result.customerId).toBe('cust-existing');
    expect(result.name).toBe('Пользователь');
    expect(result.gender).toBe('female');
    expect(result.birthDate).toBe('1980-01-01');

    const existingUpdates = prisma.customer.update.mock.calls
      .map((call: any[]) => call[0])
      .filter((args: any) => args.where?.id === existing.id);
    const profileUpdate = existingUpdates.find((args: any) =>
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
        findUnique: jest.fn().mockResolvedValue(current),
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn(),
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
        findUnique: jest.fn().mockResolvedValue(current),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ where, data }) => ({
          ...current,
          ...data,
          id: where.id,
          merchantId: current.merchantId,
        })),
      },
    });

    const result = await controller.saveProfile({
      merchantId: 'm-1',
      customerId: 'cust-new',
      name: 'Пользователь',
      gender: 'male',
      birthDate: '1990-01-01',
      phone: '+7 (900) 123-45-67',
    });

    expect(result.customerId ?? null).toBeNull();
    expect(result.name).toBe('Пользователь');
    expect(result.gender).toBe('male');
    expect(result.birthDate).toBe('1990-01-01');

    const updateArgs = prisma.customer.update.mock.calls[0][0];
    expect(updateArgs.data.profileName).toBe('Пользователь');
    expect(updateArgs.data.name).toBe('Пользователь');
    expect(updateArgs.data.gender).toBe('male');
    expect(updateArgs.data.birthday).toBeInstanceOf(Date);
  });
});
