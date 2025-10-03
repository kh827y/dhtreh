import { BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';

describe('ReferralService (unit)', () => {
  const mkPrisma = (overrides: any = {}) => Object.assign({
    referralProgram: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'P1', ...args.data })),
      update: jest.fn(async (_args: any) => ({})),
    },
    referral: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'R1', ...args.data, createdAt: new Date() })),
      update: jest.fn(async (_args: any) => ({})),
      findMany: jest.fn(async () => []),
    },
    merchant: {
      findUnique: jest.fn(async () => ({ id: 'M1', name: 'Shop' })),
    },
    personalReferralCode: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (_args: any) => ({})),
    },
    customer: { findUnique: jest.fn(async () => ({ id: 'C1', name: 'John', phone: '+7123', email: 'john@example.com' })) },
  }, overrides);

  const mkSvc = (prisma: any) =>
    new ReferralService(
      prisma as any,
      { earn: jest.fn(async () => ({ ok: true })) } as any,
      { sendEmail: jest.fn(async () => ({})) } as any,
    );

  it('createReferralProgram throws when active exists', async () => {
    const prisma = mkPrisma({ referralProgram: { findFirst: jest.fn(async () => ({ id: 'P-active' })) } });
    const svc = mkSvc(prisma);
    await expect(svc.createReferralProgram({ merchantId: 'M1', name: 'Prog', referrerReward: 10, refereeReward: 5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createReferral fails when no active program', async () => {
    const prisma = mkPrisma({ referralProgram: { findFirst: jest.fn(async () => null) } });
    const svc = mkSvc(prisma);
    await expect(svc.createReferral({ merchantId: 'M1', referrerId: 'C1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activateReferral throws on invalid/expired code', async () => {
    const prisma = mkPrisma({ referral: { findFirst: jest.fn(async () => null) } });
    const svc = mkSvc(prisma);
    await expect(svc.activateReferral('CODE', 'C2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completeReferral returns null when no activated referral found', async () => {
    const prisma = mkPrisma({ referral: { findFirst: jest.fn(async () => null) } });
    const svc = mkSvc(prisma);
    const res = await svc.completeReferral('C2', 'M1', 1000);
    expect(res).toBeNull();
  });

  it('checkReferralCode returns valid=false when not found', async () => {
    const prisma = mkPrisma({ referral: { findFirst: jest.fn(async () => null) }, personalReferralCode: { findFirst: jest.fn(async () => null) } });
    const svc = mkSvc(prisma);
    const res = await svc.checkReferralCode('BAD');
    expect(res.valid).toBe(false);
  });
});
