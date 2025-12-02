import { BadRequestException } from '@nestjs/common';
import { Mode } from './dto';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService.commit idempotency', () => {
  function mkPrisma(overrides: any = {}) {
    const base: any = {
      hold: { findUnique: jest.fn() },
      receipt: { findUnique: jest.fn(), create: jest.fn() },
      wallet: { findFirst: jest.fn() },
      transaction: { create: jest.fn() },
      eventOutbox: { create: jest.fn() },
      outlet: { findFirst: jest.fn(), update: jest.fn() },
      merchantCustomer: {
        findUnique: jest.fn(() => ({ id: 'MC-CTX' })),
        create: jest.fn(() => ({ id: 'MC-NEW' })),
      },
      customer: {
        findUnique: jest.fn(() => ({
          id: 'C-CTX',
          tgId: null,
          phone: null,
          email: null,
          name: null,
        })),
      },
      $transaction: jest.fn(async (fn: any) => fn(base)),
    };
    return Object.assign(base, overrides);
  }

  function mkStaffMotivation(overrides: any = {}) {
    return Object.assign(
      {
        getSettings: jest.fn().mockResolvedValue({
          enabled: false,
          pointsForNewCustomer: 30,
          pointsForExistingCustomer: 10,
          leaderboardPeriod: 'week',
          customDays: null,
          updatedAt: null,
        }),
        recordPurchase: jest.fn().mockResolvedValue({ pointsIssued: 0 }),
        recordRefund: jest.fn().mockResolvedValue({ pointsDeducted: 0 }),
        getLeaderboard: jest.fn(),
      },
      overrides,
    );
  }

  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  } as any;

  it('returns alreadyCommitted when receipt exists and hold not pending', async () => {
    const prisma = mkPrisma();
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H1',
      merchantId: 'M-1',
      customerId: 'C-1',
      status: 'COMMITTED',
    });
    prisma.receipt.findUnique.mockResolvedValue({
      id: 'R1',
      redeemApplied: 10,
      earnApplied: 5,
    });

    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    const r = await svc.commit('H1', 'O-1');
    expect(r.alreadyCommitted).toBe(true);
    expect(r.receiptId).toBe('R1');
  });

  it('returns alreadyCommitted when unique constraint triggers on create', async () => {
    const prisma = mkPrisma();
    const hold = {
      id: 'H1',
      merchantId: 'M-1',
      customerId: 'C-1',
      status: 'PENDING',
      mode: 'EARN',
      earnPoints: 10,
    };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W1',
      balance: 0,
      type: 'POINTS',
    });
    // emulate tx
    prisma.$transaction = jest.fn(async (fn: any) => {
      const tx = mkPrisma({
        receipt: {
          findUnique: jest.fn(),
          create: jest.fn(() => {
            const e: any = new Error('unique constraint');
            throw e;
          }),
        },
        wallet: {
          findUnique: jest.fn(() => ({ id: 'W1', balance: 0 })),
          update: jest.fn(),
        },
        transaction: { create: jest.fn() },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn() },
      });
      // when create fails, service should try findUnique again
      tx.receipt.findUnique.mockResolvedValue({
        id: 'R_EXIST',
        redeemApplied: 0,
        earnApplied: 10,
      });
      return fn(tx);
    });

    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    const r = await svc.commit('H1', 'O-1');
    expect(r.alreadyCommitted).toBe(true);
    expect(r.receiptId).toBe('R_EXIST');
  });

  it('commit EARN creates receipt and returns ok', async () => {
    const prisma = mkPrisma();
    const hold = {
      id: 'H2',
      merchantId: 'M-1',
      customerId: 'C-2',
      status: 'PENDING',
      mode: 'EARN',
      earnPoints: 5,
      outletId: null,
      staffId: null,
      total: 100,
      eligibleTotal: 100,
    };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W2',
      balance: 0,
      type: 'POINTS',
    });
    let txUsed: any;
    prisma.$transaction = jest.fn(async (fn: any) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: jest.fn(() => null),
          create: jest.fn(() => ({
            id: 'R2',
            redeemApplied: 0,
            earnApplied: 5,
          })),
        },
        wallet: {
          findUnique: jest.fn(() => ({ id: 'W2', balance: 0 })),
          update: jest.fn(),
        },
        transaction: { create: jest.fn() },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn() },
      });
      return fn(txUsed);
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    const r = await svc.commit('H2', 'O-2');
    expect(r.ok).toBe(true);
    expect(r.receiptId).toBe('R2');
    expect(txUsed.outlet.update).not.toHaveBeenCalled();
  });

  it('commit touches outlet when present', async () => {
    const prisma = mkPrisma();
    const hold = {
      id: 'H3',
      merchantId: 'M-1',
      customerId: 'C-3',
      status: 'PENDING',
      mode: 'EARN',
      earnPoints: 5,
      outletId: 'OUT-1',
      staffId: null,
      total: 100,
      eligibleTotal: 100,
    };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W3',
      balance: 0,
      type: 'POINTS',
    });
    let txUsed: any;
    prisma.$transaction = jest.fn(async (fn: any) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: jest.fn(() => null),
          create: jest.fn(() => ({
            id: 'R3',
            redeemApplied: 0,
            earnApplied: 5,
          })),
        },
        wallet: {
          findUnique: jest.fn(() => ({ id: 'W3', balance: 0 })),
          update: jest.fn(),
        },
        transaction: { create: jest.fn() },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn() },
        outlet: { findFirst: jest.fn(), update: jest.fn() },
      });
      return fn(txUsed);
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    await svc.commit('H3', 'ORDER-3');
    expect(txUsed.outlet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'OUT-1' } }),
    );
  });

  it('caches rules per outlet', () => {
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      {} as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    const base = { earnBps: 100, redeemLimitBps: 200 };
    const fn1 = (svc as any).compileRules('M-1', 'OUT-1', base, null, null);
    const fn2 = (svc as any).compileRules('M-1', 'OUT-1', base, null, null);
    const fn3 = (svc as any).compileRules('M-1', 'OUT-2', base, null, null);
    expect(fn1).toBe(fn2);
    expect(fn1).not.toBe(fn3);
  });
});

describe('LoyaltyService.processIntegrationBonus', () => {
  function mkPrisma(overrides: any = {}) {
    const base: any = {
      customer: { findUnique: jest.fn(), create: jest.fn() },
      merchant: { upsert: jest.fn() },
      receipt: { findUnique: jest.fn() },
      hold: { findFirst: jest.fn(), create: jest.fn() },
      wallet: { findFirst: jest.fn(), create: jest.fn() },
      merchantSettings: { findUnique: jest.fn() },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return Object.assign(base, overrides);
  }

  function mkStaffMotivation(overrides: any = {}) {
    return Object.assign(
      {
        getSettings: jest.fn().mockResolvedValue({ enabled: false }),
        recordPurchase: jest.fn(),
        recordRefund: jest.fn(),
      },
      overrides,
    );
  }

  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  } as any;

  it('returns stored result for repeated order without creating new hold', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({ id: 'C-1' });
    prisma.receipt.findUnique.mockResolvedValue({
      id: 'RCPT-1',
      customerId: 'C-1',
      redeemApplied: 15,
      earnApplied: 3,
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation as any,
    );
    svc.balance = jest.fn().mockResolvedValue({ balance: 250 }) as any;
    svc.commit = jest.fn() as any;

    const res = await svc.processIntegrationBonus({
      merchantId: 'M-1',
      merchantCustomerId: 'MC-1',
      customerId: 'C-1',
      userToken: 'token',
      mode: Mode.EARN,
      orderId: 'ORDER-1',
      total: 100,
      eligibleTotal: 100,
    });

    expect(res.alreadyProcessed).toBe(true);
    expect(res.receiptId).toBe('RCPT-1');
    expect(res.balanceBefore).toBeNull();
    expect(prisma.hold.findFirst).not.toHaveBeenCalled();
    expect(svc.commit).not.toHaveBeenCalled();
  });

  it('processes manual redeem when balance is sufficient', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({ id: 'C-2' });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-1',
      balance: 120,
      type: 'POINTS',
    });
    prisma.hold.create.mockResolvedValue({ id: 'H-MANUAL' });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation as any,
    );
    svc.commit = jest.fn().mockResolvedValue({
      receiptId: 'RCPT-M',
      redeemApplied: 50,
      earnApplied: 0,
    }) as any;
    svc.balance = jest.fn().mockResolvedValue({ balance: 70 }) as any;

    const res = await svc.processIntegrationBonus({
      merchantId: 'M-2',
      merchantCustomerId: 'MC-2',
      customerId: 'C-2',
      userToken: 'token',
      mode: Mode.REDEEM,
      orderId: 'ORDER-2',
      total: 200,
      eligibleTotal: 200,
      paidBonus: 50,
      outletId: 'OUT-1',
      resolvedDeviceId: 'DEV-1',
    });

    expect(res.receiptId).toBe('RCPT-M');
    expect(res.balanceBefore).toBe(120);
    expect(res.redeemApplied).toBe(50);
    expect(svc.commit).toHaveBeenCalledWith(
      'H-MANUAL',
      'ORDER-2',
      undefined,
      undefined,
      expect.objectContaining({
        manualRedeemAmount: 50,
        manualEarnPoints: null,
      }),
    );
  });

  it('rejects manual redeem that exceeds balance', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({ id: 'C-3' });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-3',
      balance: 10,
      type: 'POINTS',
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation as any,
    );
    await expect(
      svc.processIntegrationBonus({
        merchantId: 'M-3',
        merchantCustomerId: 'MC-3',
        customerId: 'C-3',
        userToken: 'token',
        mode: Mode.REDEEM,
        orderId: 'ORDER-3',
        total: 100,
        eligibleTotal: 100,
        paidBonus: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hold.create).not.toHaveBeenCalled();
  });

  it('checks manual earn against daily safety cap', async () => {
    const prisma = mkPrisma({
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ earnDailyCap: 100 }),
      },
    });
    prisma.customer.findUnique.mockResolvedValue({ id: 'C-4' });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-4',
      balance: 0,
      type: 'POINTS',
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation as any,
    );

    await expect(
      svc.processIntegrationBonus({
        merchantId: 'M-4',
        merchantCustomerId: 'MC-4',
        customerId: 'C-4',
        userToken: 'token',
        mode: Mode.EARN,
        orderId: 'ORDER-4',
        total: 100,
        eligibleTotal: 100,
        bonusValue: 150,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hold.create).not.toHaveBeenCalled();
  });

  it('passes operationDate into hold creation and commit', async () => {
    const operationDate = new Date('2024-01-01T10:00:00Z');
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({ id: 'C-5' });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-5',
      balance: 80,
      type: 'POINTS',
    });
    prisma.hold.create.mockResolvedValue({ id: 'H-5' });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma as any,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation as any,
    );
    svc.commit = jest.fn().mockResolvedValue({
      receiptId: 'RCPT-5',
      redeemApplied: 20,
      earnApplied: 0,
    }) as any;
    svc.balance = jest.fn().mockResolvedValue({ balance: 60 }) as any;

    await svc.processIntegrationBonus({
      merchantId: 'M-5',
      merchantCustomerId: 'MC-5',
      customerId: 'C-5',
      userToken: 'token',
      mode: Mode.REDEEM,
      orderId: 'ORDER-5',
      total: 150,
      eligibleTotal: 150,
      paidBonus: 20,
      operationDate,
      resolvedDeviceId: 'DEV-5',
    });

    expect(prisma.hold.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdAt: operationDate,
        }),
      }),
    );
    expect(svc.commit).toHaveBeenCalledWith(
      'H-5',
      'ORDER-5',
      undefined,
      undefined,
      expect.objectContaining({ operationDate }),
    );
  });
});
