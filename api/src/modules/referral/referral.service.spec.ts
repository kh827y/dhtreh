import { BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { LoyaltyService } from '../loyalty/services/loyalty.service';
import type { EmailService } from '../notifications/email/email.service';
import { AppConfigService } from '../../core/config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type CreateArgs<T> = { data: T };
type ReferralProgramRecord = { id: string } & Record<string, unknown>;
type ReferralRecord = { id: string; createdAt: Date } & Record<string, unknown>;
type MerchantRecord = { id: string; name: string };
type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  email: string;
};
type PrismaStub = {
  referralProgram: {
    findFirst: MockFn<ReferralProgramRecord | null, [unknown?]>;
    create: MockFn<
      ReferralProgramRecord,
      [CreateArgs<Record<string, unknown>>]
    >;
    update: MockFn<Record<string, unknown>, [unknown?]>;
  };
  referral: {
    count: MockFn<number, [unknown?]>;
    findFirst: MockFn<ReferralRecord | null, [unknown?]>;
    create: MockFn<ReferralRecord, [CreateArgs<Record<string, unknown>>]>;
    update: MockFn<Record<string, unknown>, [unknown?]>;
    findMany: MockFn<ReferralRecord[], [unknown?]>;
  };
  merchant: {
    findUnique: MockFn<MerchantRecord | null, [unknown?]>;
  };
  personalReferralCode: {
    findFirst: MockFn<Record<string, unknown> | null, [unknown?]>;
    create: MockFn<Record<string, unknown>, [unknown?]>;
  };
  customer: {
    findUnique: MockFn<CustomerRecord | null, [unknown?]>;
  };
};
type PrismaOverrides = {
  referralProgram?: Partial<PrismaStub['referralProgram']>;
  referral?: Partial<PrismaStub['referral']>;
  merchant?: Partial<PrismaStub['merchant']>;
  personalReferralCode?: Partial<PrismaStub['personalReferralCode']>;
  customer?: Partial<PrismaStub['customer']>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asLoyaltyService = (stub: { earn: MockFn }) =>
  stub as unknown as LoyaltyService;
const asEmailService = (stub: { sendEmail: MockFn }) =>
  stub as unknown as EmailService;

describe('ReferralService (unit)', () => {
  const mkPrisma = (overrides: PrismaOverrides = {}): PrismaStub => {
    const base: PrismaStub = {
      referralProgram: {
        findFirst: mockFn<
          ReferralProgramRecord | null,
          [unknown?]
        >().mockReturnValue(null),
        create: mockFn<
          ReferralProgramRecord,
          [CreateArgs<Record<string, unknown>>]
        >().mockImplementation((args) => ({ id: 'P1', ...args.data })),
        update: mockFn<Record<string, unknown>, [unknown?]>().mockReturnValue(
          {},
        ),
      },
      referral: {
        count: mockFn<number, [unknown?]>().mockReturnValue(0),
        findFirst: mockFn<ReferralRecord | null, [unknown?]>().mockReturnValue(
          null,
        ),
        create: mockFn<
          ReferralRecord,
          [CreateArgs<Record<string, unknown>>]
        >().mockImplementation((args) => ({
          id: 'R1',
          ...args.data,
          createdAt: new Date(),
        })),
        update: mockFn<Record<string, unknown>, [unknown?]>().mockReturnValue(
          {},
        ),
        findMany: mockFn<ReferralRecord[], [unknown?]>().mockReturnValue([]),
      },
      merchant: {
        findUnique: mockFn<MerchantRecord | null, [unknown?]>().mockReturnValue(
          {
            id: 'M1',
            name: 'Shop',
          },
        ),
      },
      personalReferralCode: {
        findFirst: mockFn<
          Record<string, unknown> | null,
          [unknown?]
        >().mockReturnValue(null),
        create: mockFn<Record<string, unknown>, [unknown?]>().mockReturnValue(
          {},
        ),
      },
      customer: {
        findUnique: mockFn<CustomerRecord | null, [unknown?]>().mockReturnValue(
          {
            id: 'C1',
            name: 'John',
            phone: '+7123',
            email: 'john@example.com',
          },
        ),
      },
    };

    return {
      referralProgram: {
        ...base.referralProgram,
        ...overrides.referralProgram,
      },
      referral: { ...base.referral, ...overrides.referral },
      merchant: { ...base.merchant, ...overrides.merchant },
      personalReferralCode: {
        ...base.personalReferralCode,
        ...overrides.personalReferralCode,
      },
      customer: { ...base.customer, ...overrides.customer },
    };
  };

  const mkSvc = (prisma: PrismaStub) => {
    const loyaltyStub = {
      earn: mockFn<Promise<{ ok: boolean }>, [unknown]>().mockResolvedValue({
        ok: true,
      }),
    };
    const emailStub = {
      sendEmail: mockFn<Promise<unknown>, [unknown]>().mockResolvedValue({}),
    };
    return new ReferralService(
      asPrismaService(prisma),
      asLoyaltyService(loyaltyStub),
      asEmailService(emailStub),
      new AppConfigService(),
    );
  };

  it('createReferralProgram throws when active exists', async () => {
    const prisma = mkPrisma({
      referralProgram: { findFirst: jest.fn(() => ({ id: 'P-active' })) },
    });
    const svc = mkSvc(prisma);
    await expect(
      svc.createReferralProgram({
        merchantId: 'M1',
        name: 'Prog',
        referrerReward: 10,
        refereeReward: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activateReferral fails when code not found', async () => {
    const prisma = mkPrisma({
      personalReferralCode: { findFirst: jest.fn(() => null) },
    });
    const svc = mkSvc(prisma);
    await expect(svc.activateReferral('BADCODE', 'C1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('activateReferral throws on invalid/expired code', async () => {
    const prisma = mkPrisma({
      referral: { findFirst: jest.fn(() => null) },
    });
    const svc = mkSvc(prisma);
    await expect(svc.activateReferral('CODE', 'C2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('completeReferral returns null when no activated referral found', async () => {
    const prisma = mkPrisma({
      referral: { findFirst: jest.fn(() => null) },
    });
    const svc = mkSvc(prisma);
    const res = await svc.completeReferral('C2', 'M1', 1000);
    expect(res).toBeNull();
  });

  it('getActiveProgram returns null when no active program', async () => {
    const prisma = mkPrisma({
      referralProgram: { findFirst: jest.fn(() => null) },
    });
    const svc = mkSvc(prisma);
    const res = await svc.getActiveProgram('M1');
    expect(res).toBeNull();
  });
});
