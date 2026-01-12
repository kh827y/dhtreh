import { BadRequestException } from '@nestjs/common';
import { Mode } from './dto';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService.commit idempotency', () => {
  function mkPrisma(overrides: any = {}) {
    const base: any = {
      hold: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      receipt: { findUnique: jest.fn(), create: jest.fn() },
      wallet: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transaction: { create: jest.fn(() => ({ id: 'TXN' })) },
      eventOutbox: { create: jest.fn() },
      outlet: { findFirst: jest.fn(), update: jest.fn() },
      customer: {
        findUnique: jest.fn(() => ({
          id: 'C-CTX',
          merchantId: 'M-1',
          tgId: null,
          phone: null,
          email: null,
          name: null,
          accrualsBlocked: false,
          redemptionsBlocked: false,
        })),
        create: jest.fn(() => ({ id: 'C-NEW', merchantId: 'M-CTX' })),
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
    jest.spyOn(svc, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
      earnPercent: 0,
      redeemLimitPercent: 100,
      tierMinPayment: null,
    });
    const r = await svc.commit('H1', 'O-1', undefined, undefined, undefined);
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
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: jest.fn() },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    const r = await svc.commit('H1', 'O-1', undefined, undefined, undefined);
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
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: jest.fn(() => ({ id: 'TX' })) },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    const r = await svc.commit('H2', 'O-2', undefined, undefined, undefined);
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
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: jest.fn(() => ({ id: 'TX' })) },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    await svc.commit('H3', 'ORDER-3', undefined, undefined, undefined);
    expect(txUsed.outlet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'OUT-1' } }),
    );
  });

  it('blocks earn commit when accruals are blocked', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-B1',
      merchantId: 'M-1',
      accrualsBlocked: true,
      redemptionsBlocked: false,
    });
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-B1',
      merchantId: 'M-1',
      customerId: 'C-B1',
      status: 'PENDING',
      mode: 'EARN',
      earnPoints: 10,
    });

    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );

    await expect(
      svc.commit('H-B1', 'ORDER-B1', undefined, undefined, undefined),
    ).rejects.toThrow('Начисления заблокированы администратором');
  });

  it('blocks redeem commit when redemptions are blocked', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-B2',
      merchantId: 'M-1',
      accrualsBlocked: false,
      redemptionsBlocked: true,
    });
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-B2',
      merchantId: 'M-1',
      customerId: 'C-B2',
      status: 'PENDING',
      mode: 'REDEEM',
      redeemAmount: 10,
      earnPoints: 0,
    });

    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );

    await expect(
      svc.commit('H-B2', 'ORDER-B2', undefined, undefined, undefined),
    ).rejects.toThrow('Списания заблокированы администратором');
  });

  it('allows redeem but skips earn when accruals are blocked', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-R1',
      merchantId: 'M-1',
      accrualsBlocked: true,
      redemptionsBlocked: false,
    });
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-R1',
      merchantId: 'M-1',
      customerId: 'C-R1',
      status: 'PENDING',
      mode: 'REDEEM',
      redeemAmount: 20,
      earnPoints: 15,
      total: 100,
      eligibleTotal: 100,
      outletId: null,
      staffId: null,
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-R1',
      balance: 100,
      type: 'POINTS',
    });

    let txUsed: any;
    prisma.$transaction = jest.fn(async (fn: any) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: jest.fn(() => null),
          create: jest.fn(() => ({
            id: 'R-R1',
            redeemApplied: 20,
            earnApplied: 0,
          })),
        },
        wallet: {
          findUnique: jest.fn(() => ({ id: 'W-R1', balance: 100 })),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: jest.fn(() => ({ id: 'TX-R1' })) },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

    const res = await svc.commit(
      'H-R1',
      'ORDER-R1',
      undefined,
      undefined,
      undefined,
    );
    expect(res.ok).toBe(true);
    expect(res.redeemApplied).toBe(20);
    expect(res.earnApplied).toBe(0);
    expect(txUsed.transaction.create).toHaveBeenCalledTimes(1);
    expect(txUsed.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REDEEM' }),
      }),
    );
    expect(txUsed.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ earnApplied: 0 }),
      }),
    );
  });

});

describe('LoyaltyService.processIntegrationBonus', () => {
  function mkPrisma(overrides: any = {}) {
    const base: any = {
      customer: { findUnique: jest.fn(), create: jest.fn() },
      merchant: { upsert: jest.fn() },
      receipt: { findUnique: jest.fn() },
      hold: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      holdItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      wallet: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-1',
      merchantId: 'M-1',
    });
    prisma.receipt.findUnique.mockResolvedValue({
      id: 'RCPT-1',
      customerId: 'C-1',
      redeemApplied: 15,
      earnApplied: 3,
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    svc.balance = jest.fn().mockResolvedValue({ balance: 250 }) as any;
    svc.commit = jest.fn() as any;

    const res = await svc.processIntegrationBonus({
      merchantId: 'M-1',
      customerId: 'C-1',
      userToken: 'token',
      idempotencyKey: 'IDEMP-1',
      invoiceNum: 'ORDER-1',
      total: 100,
    });

    expect(res.alreadyProcessed).toBe(true);
    expect(res.receiptId).toBe('RCPT-1');
    expect(res.balanceBefore).toBeNull();
    expect(prisma.hold.findFirst).not.toHaveBeenCalled();
    expect(svc.commit).not.toHaveBeenCalled();
  });

  it('processes manual redeem when balance is sufficient', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-2',
      merchantId: 'M-2',
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-1',
      balance: 120,
      type: 'POINTS',
    });
    prisma.hold.create.mockResolvedValue({ id: 'H-MANUAL' });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    jest.spyOn(svc, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
      earnPercent: 0,
      redeemLimitPercent: 100,
      tierMinPayment: null,
    });
    svc.commit = jest.fn().mockResolvedValue({
      receiptId: 'RCPT-M',
      redeemApplied: 50,
      earnApplied: 0,
    }) as any;
    svc.balance = jest.fn().mockResolvedValue({ balance: 70 }) as any;

    const res = await svc.processIntegrationBonus({
      merchantId: 'M-2',
      customerId: 'C-2',
      userToken: 'token',
      idempotencyKey: 'IDEMP-2',
      invoiceNum: 'ORDER-2',
      total: 200,
      paidBonus: 50,
      outletId: 'OUT-1',
      resolvedDeviceId: 'DEV-1',
    });

    expect(res.receiptId).toBe('RCPT-M');
    expect(res.balanceBefore).toBe(120);
    expect(res.redeemApplied).toBe(50);
    expect(svc.commit).toHaveBeenCalledWith(
      'H-MANUAL',
      'IDEMP-2',
      'ORDER-2',
      undefined,
      expect.objectContaining({
        manualRedeemAmount: 50,
        manualEarnPoints: null,
      }),
    );
  });

  it('rejects manual redeem that exceeds balance', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-3',
      merchantId: 'M-3',
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-3',
      balance: 10,
      type: 'POINTS',
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    await expect(
      svc.processIntegrationBonus({
        merchantId: 'M-3',
        customerId: 'C-3',
        userToken: 'token',
        idempotencyKey: 'IDEMP-3',
        invoiceNum: 'ORDER-3',
        total: 100,
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
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-4',
      merchantId: 'M-4',
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-4',
      balance: 0,
      type: 'POINTS',
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );

    await expect(
      svc.processIntegrationBonus({
        merchantId: 'M-4',
        customerId: 'C-4',
        userToken: 'token',
        idempotencyKey: 'IDEMP-4',
        invoiceNum: 'ORDER-4',
        total: 100,
        bonusValue: 150,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hold.create).not.toHaveBeenCalled();
  });

  it('passes operationDate into hold creation and commit', async () => {
    const operationDate = new Date('2024-01-01T10:00:00Z');
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-5',
      merchantId: 'M-5',
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-5',
      balance: 80,
      type: 'POINTS',
    });
    prisma.hold.create.mockResolvedValue({ id: 'H-5' });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    svc.commit = jest.fn().mockResolvedValue({
      receiptId: 'RCPT-5',
      redeemApplied: 20,
      earnApplied: 0,
    }) as any;
    svc.balance = jest.fn().mockResolvedValue({ balance: 60 }) as any;

    await svc.processIntegrationBonus({
      merchantId: 'M-5',
      customerId: 'C-5',
      userToken: 'token',
      idempotencyKey: 'IDEMP-5',
      invoiceNum: 'ORDER-5',
      total: 150,
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
      'IDEMP-5',
      'ORDER-5',
      undefined,
      expect.objectContaining({ operationDate }),
    );
  });

  it('does not auto-apply promotions in BONUS when actions are not provided', async () => {
    const prisma = mkPrisma();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'C-7',
      merchantId: 'M-7',
    });
    prisma.hold.create.mockResolvedValue({ id: 'H-7' });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    jest
      .spyOn(svc as any, 'ensurePointsWallet')
      .mockResolvedValue({ balance: 0 });
    const calcSpy = jest
      .spyOn(svc as any, 'computeIntegrationCalc')
      .mockResolvedValue({
        itemsForCalc: [],
        perItemMaxRedeem: [],
        appliedRedeem: 0,
        earnedTotal: 0,
        finalPayable: 100,
        total: 100,
        eligibleAmount: 100,
        hasItems: false,
        allowSameReceipt: true,
        accrualsBlocked: false,
        redemptionsBlocked: false,
      });
    svc.commit = jest.fn().mockResolvedValue({
      receiptId: 'RCPT-7',
      redeemApplied: 0,
      earnApplied: 0,
    }) as any;
    svc.balance = jest.fn().mockResolvedValue({ balance: 0 }) as any;

    await svc.processIntegrationBonus({
      merchantId: 'M-7',
      customerId: 'C-7',
      userToken: 'token',
      idempotencyKey: 'IDEMP-7',
      invoiceNum: 'ORDER-7',
      total: 100,
      outletId: 'OUT-7',
      resolvedDeviceId: 'DEV-7',
    });

    expect(calcSpy).toHaveBeenCalledWith(
      expect.objectContaining({ allowAutoPromotions: false }),
    );
  });

  it('расчитывает eligibleAmount только по eligible-позициям', () => {
    const prisma = mkPrisma();
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    const positions = [
      { amount: 500, promotionMultiplier: 1, accruePoints: true },
      { amount: 300, promotionMultiplier: 1, accruePoints: false },
      { amount: 200, promotionMultiplier: 0, accruePoints: true },
    ] as any;
    const totals = (svc as any).computeTotalsFromPositions(1200, positions);
    expect(totals.total).toBe(1000);
    expect(totals.eligibleAmount).toBe(500);
  });

  it('передаёт рассчитанный purchaseAmount в реферальные награды', async () => {
    const hold = {
      id: 'H-REF',
      merchantId: 'M-REF',
      customerId: 'C-CTX',
      status: 'PENDING',
      mode: 'EARN',
      earnPoints: 0,
      redeemAmount: 0,
      outletId: null,
      staffId: null,
      total: 1000,
      eligibleTotal: 1000,
      items: [],
    };
    const prisma = mkPrisma();
    prisma.hold = { findUnique: jest.fn().mockResolvedValue(hold as any) };
    prisma.customer =
      prisma.customer ||
      ({
        findUnique: jest.fn(),
        create: jest.fn(),
      } as any);
    prisma.customer.findUnique = jest.fn().mockResolvedValue({ id: 'MC-REF' });
    prisma.customer =
      prisma.customer ||
      ({
        findUnique: jest.fn(),
      } as any);
    prisma.customer.findUnique = jest.fn().mockResolvedValue({
      id: hold.customerId,
      merchantId: hold.merchantId,
      tgId: null,
      phone: null,
      email: null,
      name: null,
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    prisma.loyaltyPromotion = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-REF',
      balance: 0,
      type: 'POINTS',
    });
    const walletObj = { id: 'W-REF', balance: 0 };
    const tx = mkPrisma({
      hold: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wallet: {
        findFirst: jest.fn().mockResolvedValue(walletObj),
        findUnique: jest.fn().mockResolvedValue(walletObj),
        create: jest.fn().mockResolvedValue(walletObj),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      receipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'R-REF',
          redeemApplied: 0,
          earnApplied: 0,
          total: 1000,
          eligibleTotal: 100,
          createdAt: new Date(),
          outletId: null,
          staffId: null,
          deviceId: null,
        }),
      },
      holdItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      receiptItem: {
        create: jest
          .fn()
          .mockImplementation(async ({ data }: any) => ({ id: 'ri', ...data })),
      },
      transactionItem: { create: jest.fn() },
      transaction: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventOutbox: { create: jest.fn() },
      outlet: { update: jest.fn() },
      merchantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      loyaltyTierAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      loyaltyTier: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      earnLot: { create: jest.fn() },
    });
    prisma.$transaction = jest.fn(async (fn: any) => fn(tx));
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      prisma,
      metrics,
      undefined as any,
      undefined as any,
      staffMotivation,
    );
    (svc as any).applyReferralRewards = jest.fn().mockResolvedValue(undefined);
    (svc as any).recomputeTierProgress = jest.fn();
    const positions = [
      { qty: 1, price: 100, accruePoints: true },
      { qty: 1, price: 900, accruePoints: false },
    ];
    await svc.commit('H-REF', 'O-REF', undefined, undefined, { positions });
    expect((svc as any).applyReferralRewards).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purchaseAmount: 100 }),
    );
  });
});
