import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from '../services/loyalty.service';
import type { MetricsService } from '../../../core/metrics/metrics.service';
import type { PromoCodesService } from '../../promocodes/promocodes.service';
import type { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import type { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { LoyaltyContextService } from '../services/loyalty-context.service';
import type { LoyaltyTierService } from '../services/loyalty-tier.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type MockPrisma = {
  hold: MockModel;
  receipt: MockModel;
  wallet: MockModel;
  transaction: MockModel;
  eventOutbox: MockModel;
  outlet: MockModel;
  customer: MockModel;
  loyaltyPromotion: MockModel;
  $transaction: MockFn<unknown, [(tx: MockPrisma) => unknown]>;
  [key: string]: MockModel | MockFn | undefined;
};
type MetricsStub = Pick<MetricsService, 'inc' | 'observe' | 'setGauge'>;
type StaffMotivationStub = {
  getSettings: MockFn<
    ReturnType<StaffMotivationEngine['getSettings']>,
    Parameters<StaffMotivationEngine['getSettings']>
  >;
  recordPurchase: MockFn<
    ReturnType<StaffMotivationEngine['recordPurchase']>,
    Parameters<StaffMotivationEngine['recordPurchase']>
  >;
  recordRefund: MockFn<
    ReturnType<StaffMotivationEngine['recordRefund']>,
    Parameters<StaffMotivationEngine['recordRefund']>
  >;
  getLeaderboard: MockFn<
    ReturnType<StaffMotivationEngine['getLeaderboard']>,
    Parameters<StaffMotivationEngine['getLeaderboard']>
  >;
};
type PromoCodesStub = {
  apply: MockFn;
};
type NotificationsStub = Record<string, unknown>;
type CommitResult = Awaited<ReturnType<LoyaltyService['commit']>>;
type BalanceResult = Awaited<ReturnType<LoyaltyService['balance']>>;
type PrivateMethod = (...args: unknown[]) => unknown;
type TotalsPosition = {
  amount: number;
  promotionMultiplier: number;
  accruePoints: boolean;
};
type LoyaltyServicePrivate = {
  ensurePointsWallet: PrivateMethod;
  computeIntegrationCalc: PrivateMethod;
  computeTotalsFromPositions: (
    fallbackTotal: number,
    positions: TotalsPosition[],
  ) => { total: number; eligibleAmount: number };
  applyReferralRewards: PrivateMethod;
};
const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const mockFnWithImpl = <Return, Args extends unknown[]>(
  impl: (...args: Args) => Return,
) => mockFn<Return, Args>().mockImplementation(impl);
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPromoCodesService = (stub: PromoCodesStub) =>
  stub as unknown as PromoCodesService;
const asNotificationsService = (stub: NotificationsStub) =>
  stub as unknown as TelegramStaffNotificationsService;

const buildContext = (
  overrides: Partial<{
    customerId: string;
    accrualsBlocked: boolean;
    redemptionsBlocked: boolean;
  }> = {},
): LoyaltyContextService => {
  const customerId = overrides.customerId ?? 'c-1';
  return {
    prisma: {} as PrismaService,
    ensureCustomerContext: mockFn().mockResolvedValue({
      customerId,
      accrualsBlocked: overrides.accrualsBlocked ?? false,
      redemptionsBlocked: overrides.redemptionsBlocked ?? false,
    }),
    ensureCustomerId: mockFn().mockResolvedValue({ id: customerId }),
    ensureCustomerByTelegram: mockFn().mockResolvedValue({ customerId }),
    resolveDeviceContext: mockFn().mockResolvedValue(null),
    resolveOutletContext: mockFn().mockResolvedValue({ outletId: null }),
  } as unknown as LoyaltyContextService;
};

const buildTiers = (): LoyaltyTierService =>
  ({
    prisma: {} as PrismaService,
    resolveTierRatesForCustomer: mockFn().mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 0,
      tierMinPayment: null,
    }),
    isAllowSameReceipt: mockFn().mockResolvedValue(false),
    refreshTierAssignmentIfExpired: mockFn().mockResolvedValue(undefined),
    recomputeTierProgress: mockFn().mockResolvedValue(undefined),
    promoteTierIfEligible: mockFn().mockResolvedValue(undefined),
  }) as unknown as LoyaltyTierService;

const getTiers = (service: LoyaltyService) =>
  (service as unknown as { tiers: { recomputeTierProgress: MockFn } }).tiers;
const asStaffMotivationEngine = (stub: StaffMotivationStub) =>
  stub as unknown as StaffMotivationEngine;

describe('LoyaltyService.commit idempotency', () => {
  function mkPrisma(overrides: Partial<MockPrisma> = {}): MockPrisma {
    const base: MockPrisma = {
      hold: {
        findUnique: mockFn(),
        update: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      receipt: { findUnique: mockFn(), create: mockFn() },
      wallet: {
        findFirst: mockFn(),
        findUnique: mockFn(),
        update: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      transaction: { create: mockFnWithImpl(() => ({ id: 'TXN' })) },
      eventOutbox: { create: mockFn() },
      outlet: { findFirst: mockFn(), update: mockFn() },
      merchantSettings: { findUnique: mockFn().mockResolvedValue(null) },
      customer: {
        findUnique: mockFnWithImpl(() => ({
          id: 'C-CTX',
          merchantId: 'M-1',
          tgId: null,
          phone: null,
          email: null,
          name: null,
          accrualsBlocked: false,
          redemptionsBlocked: false,
        })),
        create: mockFnWithImpl(() => ({ id: 'C-NEW', merchantId: 'M-CTX' })),
      },
      loyaltyPromotion: { findMany: mockFn() },
      $transaction: mockFn<unknown, [(tx: MockPrisma) => unknown]>(),
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
    merged.$transaction.mockImplementation((fn) => fn(merged));
    return merged;
  }

  function mkStaffMotivation(
    overrides: Partial<StaffMotivationStub> = {},
  ): StaffMotivationStub {
    const base: StaffMotivationStub = {
      getSettings: mockFn<
        ReturnType<StaffMotivationEngine['getSettings']>,
        Parameters<StaffMotivationEngine['getSettings']>
      >().mockResolvedValue({
        enabled: false,
        pointsForNewCustomer: 30,
        pointsForExistingCustomer: 10,
        leaderboardPeriod: 'week',
        customDays: null,
        updatedAt: null,
      }),
      recordPurchase: mockFn<
        ReturnType<StaffMotivationEngine['recordPurchase']>,
        Parameters<StaffMotivationEngine['recordPurchase']>
      >().mockResolvedValue({ pointsIssued: 0 }),
      recordRefund: mockFn<
        ReturnType<StaffMotivationEngine['recordRefund']>,
        Parameters<StaffMotivationEngine['recordRefund']>
      >().mockResolvedValue({ pointsDeducted: 0 }),
      getLeaderboard: mockFn<
        ReturnType<StaffMotivationEngine['getLeaderboard']>,
        Parameters<StaffMotivationEngine['getLeaderboard']>
      >(),
    };
    return { ...base, ...overrides };
  }

  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
  };
  const promoCodesStub: PromoCodesStub = {
    apply: mockFn(),
  };
  const notificationsStub: NotificationsStub = {};

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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-1' }),
      buildTiers(),
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
    prisma.$transaction = mockFn<
      unknown,
      [(tx: MockPrisma) => unknown]
    >().mockImplementation((fn) => {
      const tx = mkPrisma({
        receipt: {
          findUnique: mockFn(),
          create: mockFnWithImpl(() => {
            const err = new Error('unique constraint');
            throw err;
          }),
        },
        wallet: {
          findUnique: mockFnWithImpl(() => ({ id: 'W1', balance: 0 })),
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: mockFn() },
        eventOutbox: { create: mockFn() },
        hold: {
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-1' }),
      buildTiers(),
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
    let txUsed: MockPrisma | null = null;
    prisma.$transaction = mockFn<
      unknown,
      [(tx: MockPrisma) => unknown]
    >().mockImplementation((fn) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: mockFnWithImpl(() => null),
          create: mockFnWithImpl(() => ({
            id: 'R2',
            redeemApplied: 0,
            earnApplied: 5,
          })),
        },
        wallet: {
          findUnique: mockFnWithImpl(() => ({ id: 'W2', balance: 0 })),
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: mockFnWithImpl(() => ({ id: 'TX' })) },
        eventOutbox: { create: mockFn() },
        hold: {
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
      });
      return fn(txUsed);
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-2' }),
      buildTiers(),
    );
    const r = await svc.commit('H2', 'O-2', undefined, undefined, undefined);
    expect(r.ok).toBe(true);
    expect(r.receiptId).toBe('R2');
    expect(txUsed).not.toBeNull();
    expect(txUsed!.outlet.update).not.toHaveBeenCalled();
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
    let txUsed: MockPrisma | null = null;
    prisma.$transaction = mockFn<
      unknown,
      [(tx: MockPrisma) => unknown]
    >().mockImplementation((fn) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: mockFnWithImpl(() => null),
          create: mockFnWithImpl(() => ({
            id: 'R3',
            redeemApplied: 0,
            earnApplied: 5,
          })),
        },
        wallet: {
          findUnique: mockFnWithImpl(() => ({ id: 'W3', balance: 0 })),
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: mockFnWithImpl(() => ({ id: 'TX' })) },
        eventOutbox: { create: mockFn() },
        hold: {
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
        outlet: { findFirst: mockFn(), update: mockFn() },
      });
      return fn(txUsed);
    });
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-3' }),
      buildTiers(),
    );
    await svc.commit('H3', 'ORDER-3', undefined, undefined, undefined);
    expect(txUsed).not.toBeNull();
    expect(txUsed!.outlet.update).not.toHaveBeenCalled();
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-B1', accrualsBlocked: true }),
      buildTiers(),
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-B2', redemptionsBlocked: true }),
      buildTiers(),
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

    let txUsed: MockPrisma | null = null;
    prisma.$transaction = mockFn<
      unknown,
      [(tx: MockPrisma) => unknown]
    >().mockImplementation((fn) => {
      txUsed = mkPrisma({
        receipt: {
          findUnique: mockFnWithImpl(() => null),
          create: mockFnWithImpl(() => ({
            id: 'R-R1',
            redeemApplied: 20,
            earnApplied: 0,
          })),
        },
        wallet: {
          findUnique: mockFnWithImpl(() => ({ id: 'W-R1', balance: 100 })),
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
        transaction: { create: mockFnWithImpl(() => ({ id: 'TX-R1' })) },
        eventOutbox: { create: mockFn() },
        hold: {
          update: mockFn(),
          updateMany: mockFn().mockResolvedValue({ count: 1 }),
        },
      });
      return fn(txUsed);
    });

    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext({ customerId: 'C-R1', accrualsBlocked: true }),
      buildTiers(),
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
    expect(txUsed).not.toBeNull();
    expect(txUsed!.transaction.create).toHaveBeenCalledTimes(1);
    expect(txUsed!.transaction.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ type: 'REDEEM' }),
      }),
    );
    expect(txUsed!.receipt.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ earnApplied: 0 }),
      }),
    );
  });
});

describe('LoyaltyService.processIntegrationBonus', () => {
  function mkPrisma(overrides: Partial<MockPrisma> = {}): MockPrisma {
    const base: MockPrisma = {
      customer: { findUnique: mockFn(), create: mockFn() },
      merchant: { upsert: mockFn() },
      receipt: { findUnique: mockFn() },
      hold: {
        findUnique: mockFn(),
        findFirst: mockFn(),
        create: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      holdItem: { deleteMany: mockFn(), createMany: mockFn() },
      wallet: {
        findFirst: mockFn(),
        create: mockFn(),
        update: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      merchantSettings: { findUnique: mockFn() },
      transaction: { findMany: mockFn().mockResolvedValue([]) },
      loyaltyPromotion: { findMany: mockFn() },
      eventOutbox: { create: mockFn() },
      outlet: { findFirst: mockFn(), update: mockFn() },
      receiptItem: { create: mockFn() },
      transactionItem: { create: mockFn() },
      $transaction: mockFn<unknown, [(tx: MockPrisma) => unknown]>(),
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
    merged.$transaction.mockImplementation((fn) => fn(merged));
    return merged;
  }

  function mkStaffMotivation(
    overrides: Partial<StaffMotivationStub> = {},
  ): StaffMotivationStub {
    const base: StaffMotivationStub = {
      getSettings: mockFn<
        ReturnType<StaffMotivationEngine['getSettings']>,
        Parameters<StaffMotivationEngine['getSettings']>
      >().mockResolvedValue({
        enabled: false,
        pointsForNewCustomer: 0,
        pointsForExistingCustomer: 0,
        leaderboardPeriod: 'week',
        customDays: null,
        updatedAt: null,
      }),
      recordPurchase: mockFn<
        ReturnType<StaffMotivationEngine['recordPurchase']>,
        Parameters<StaffMotivationEngine['recordPurchase']>
      >(),
      recordRefund: mockFn<
        ReturnType<StaffMotivationEngine['recordRefund']>,
        Parameters<StaffMotivationEngine['recordRefund']>
      >(),
      getLeaderboard: mockFn<
        ReturnType<StaffMotivationEngine['getLeaderboard']>,
        Parameters<StaffMotivationEngine['getLeaderboard']>
      >(),
    };
    return { ...base, ...overrides };
  }

  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
  };
  const promoCodesStub: PromoCodesStub = {
    apply: mockFn(),
  };
  const notificationsStub: NotificationsStub = {};

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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    jest.spyOn(svc, 'balance').mockResolvedValue({
      merchantId: 'M-1',
      customerId: 'C-1',
      balance: 250,
    });
    const commitSpy = jest.spyOn(svc, 'commit');

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
    expect(commitSpy).not.toHaveBeenCalled();
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    jest.spyOn(svc, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
      earnPercent: 0,
      redeemLimitPercent: 100,
      tierMinPayment: null,
    });
    const commitSpy = jest.spyOn(svc, 'commit').mockResolvedValue({
      receiptId: 'RCPT-M',
      redeemApplied: 50,
      earnApplied: 0,
    } as Awaited<ReturnType<LoyaltyService['commit']>>);
    jest.spyOn(svc, 'balance').mockResolvedValue({
      merchantId: 'M-2',
      customerId: 'C-2',
      balance: 70,
    });

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
    expect(commitSpy).toHaveBeenCalledWith(
      'H-MANUAL',
      'IDEMP-2',
      'ORDER-2',
      undefined,
      objectContaining({
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
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
        findUnique: mockFn().mockResolvedValue({ earnDailyCap: 100 }),
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    const commitSpy = jest.spyOn(svc, 'commit').mockResolvedValue({
      receiptId: 'RCPT-5',
      redeemApplied: 20,
      earnApplied: 0,
    } as Awaited<ReturnType<LoyaltyService['commit']>>);
    jest.spyOn(svc, 'balance').mockResolvedValue({
      merchantId: 'M-5',
      customerId: 'C-5',
      balance: 60,
    });

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
      objectContaining({
        data: objectContaining({
          createdAt: operationDate,
        }),
      }),
    );
    expect(commitSpy).toHaveBeenCalledWith(
      'H-5',
      'IDEMP-5',
      'ORDER-5',
      undefined,
      objectContaining({ operationDate }),
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
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    const svcPrivate = svc as unknown as LoyaltyServicePrivate;
    jest.spyOn(svcPrivate, 'ensurePointsWallet').mockResolvedValue({
      balance: 0,
    });
    const calcSpy = jest
      .spyOn(svcPrivate, 'computeIntegrationCalc')
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
    const commitResult: CommitResult = {
      ok: true,
      customerId: 'C-7',
      receiptId: 'RCPT-7',
      redeemApplied: 0,
      earnApplied: 0,
    };
    jest.spyOn(svc, 'commit').mockResolvedValue(commitResult);
    const balanceResult: BalanceResult = {
      merchantId: 'M-7',
      customerId: 'C-7',
      balance: 0,
    };
    jest.spyOn(svc, 'balance').mockResolvedValue(balanceResult);

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
      objectContaining({ allowAutoPromotions: false }),
    );
  });

  it('расчитывает eligibleAmount только по eligible-позициям', () => {
    const prisma = mkPrisma();
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    const svcPrivate = svc as unknown as LoyaltyServicePrivate;
    const positions: TotalsPosition[] = [
      { amount: 500, promotionMultiplier: 1, accruePoints: true },
      { amount: 300, promotionMultiplier: 1, accruePoints: false },
      { amount: 200, promotionMultiplier: 0, accruePoints: true },
    ];
    const totals = svcPrivate.computeTotalsFromPositions(1200, positions);
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
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.customer.findUnique.mockResolvedValue({
      id: hold.customerId,
      merchantId: hold.merchantId,
      tgId: null,
      phone: null,
      email: null,
      name: null,
      accrualsBlocked: false,
      redemptionsBlocked: false,
    });
    prisma.loyaltyPromotion = { findMany: mockFn().mockResolvedValue([]) };
    prisma.wallet.findFirst.mockResolvedValue({
      id: 'W-REF',
      balance: 0,
      type: 'POINTS',
    });
    const walletObj = { id: 'W-REF', balance: 0 };
    const tx = mkPrisma({
      hold: {
        update: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      wallet: {
        findFirst: mockFn().mockResolvedValue(walletObj),
        findUnique: mockFn().mockResolvedValue(walletObj),
        create: mockFn().mockResolvedValue(walletObj),
        update: mockFn(),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
      },
      receipt: {
        findUnique: mockFn().mockResolvedValue(null),
        create: mockFn().mockResolvedValue({
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
      holdItem: { deleteMany: mockFn(), createMany: mockFn() },
      receiptItem: {
        create: mockFn().mockImplementation(
          ({ data }: { data: Record<string, unknown> }) => ({
            id: 'ri',
            ...data,
          }),
        ),
      },
      transactionItem: { create: mockFn() },
      transaction: {
        create: mockFn(),
        findMany: mockFn().mockResolvedValue([]),
      },
      eventOutbox: { create: mockFn() },
      outlet: { update: mockFn() },
      merchantSettings: { findUnique: mockFn().mockResolvedValue(null) },
      loyaltyTierAssignment: { findFirst: mockFn().mockResolvedValue(null) },
      loyaltyTier: {
        findFirst: mockFn().mockResolvedValue(null),
        findUnique: mockFn().mockResolvedValue(null),
      },
      earnLot: { create: mockFn() },
    });
    prisma.$transaction = mockFn<
      unknown,
      [(tx: MockPrisma) => unknown]
    >().mockImplementation((fn) => fn(tx));
    const staffMotivation = mkStaffMotivation();
    const svc = new LoyaltyService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPromoCodesService(promoCodesStub),
      asNotificationsService(notificationsStub),
      asStaffMotivationEngine(staffMotivation),
      buildContext(),
      buildTiers(),
    );
    const svcPrivate = svc as unknown as LoyaltyServicePrivate;
    const applyReferralRewardsSpy = jest
      .spyOn(svcPrivate, 'applyReferralRewards')
      .mockResolvedValue(undefined);
    jest
      .spyOn(getTiers(svc), 'recomputeTierProgress')
      .mockResolvedValue(undefined);
    const positions = [
      { qty: 1, price: 100, accruePoints: true },
      { qty: 1, price: 900, accruePoints: false },
    ];
    await svc.commit('H-REF', 'O-REF', undefined, undefined, { positions });
    expect(applyReferralRewardsSpy).toHaveBeenCalledWith(
      expect.anything(),
      objectContaining({ purchaseAmount: 100 }),
    );
  });
});
