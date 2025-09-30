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
      $transaction: jest.fn(async (fn: any) => fn(base)),
    };
    return Object.assign(base, overrides);
  }

  const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

  it('returns alreadyCommitted when receipt exists and hold not pending', async () => {
    const prisma = mkPrisma();
    prisma.hold.findUnique.mockResolvedValue({ id: 'H1', merchantId: 'M-1', customerId: 'C-1', status: 'COMMITTED' });
    prisma.receipt.findUnique.mockResolvedValue({ id: 'R1', redeemApplied: 10, earnApplied: 5 });

    const svc = new LoyaltyService(prisma as any, metrics as any, undefined as any);
    const r = await svc.commit('H1', 'O-1');
    expect(r.alreadyCommitted).toBe(true);
    expect(r.receiptId).toBe('R1');
  });

  it('returns alreadyCommitted when unique constraint triggers on create', async () => {
    const prisma = mkPrisma();
    const hold = { id: 'H1', merchantId: 'M-1', customerId: 'C-1', status: 'PENDING', mode: 'EARN', earnPoints: 10 };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({ id: 'W1', balance: 0, type: 'POINTS' });
    // emulate tx
    prisma.$transaction = jest.fn(async (fn: any) => {
      const tx = mkPrisma({ receipt: { findUnique: jest.fn(), create: jest.fn(() => { const e: any = new Error('unique constraint'); throw e; }) }, wallet: { findUnique: jest.fn(() => ({ id: 'W1', balance: 0 })), update: jest.fn() }, transaction: { create: jest.fn() }, eventOutbox: { create: jest.fn() }, hold: { update: jest.fn() }, device: { update: jest.fn() } });
      // when create fails, service should try findUnique again
      tx.receipt.findUnique.mockResolvedValue({ id: 'R_EXIST', redeemApplied: 0, earnApplied: 10 });
      return fn(tx);
    });

    const svc = new LoyaltyService(prisma as any, metrics as any, undefined as any);
    const r = await svc.commit('H1', 'O-1');
    expect(r.alreadyCommitted).toBe(true);
    expect(r.receiptId).toBe('R_EXIST');
  });

  it('commit EARN creates receipt and returns ok', async () => {
    const prisma = mkPrisma();
    const hold = { id: 'H2', merchantId: 'M-1', customerId: 'C-2', status: 'PENDING', mode: 'EARN', earnPoints: 5, outletId: null, deviceId: null, staffId: null, total: 100, eligibleTotal: 100 };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({ id: 'W2', balance: 0, type: 'POINTS' });
    let txUsed: any;
    prisma.$transaction = jest.fn(async (fn: any) => {
      txUsed = mkPrisma({ receipt: { findUnique: jest.fn(() => null), create: jest.fn(() => ({ id: 'R2', redeemApplied: 0, earnApplied: 5 })) }, wallet: { findUnique: jest.fn(() => ({ id: 'W2', balance: 0 })), update: jest.fn() }, transaction: { create: jest.fn() }, eventOutbox: { create: jest.fn() }, hold: { update: jest.fn() } });
      return fn(txUsed);
    });
    const svc = new LoyaltyService(prisma as any, metrics as any, undefined as any);
    const r = await svc.commit('H2', 'O-2');
    expect(r.ok).toBe(true);
    expect(r.receiptId).toBe('R2');
    expect(txUsed.outlet.update).not.toHaveBeenCalled();
  });

  it('commit touches outlet when present', async () => {
    const prisma = mkPrisma();
    const hold = { id: 'H3', merchantId: 'M-1', customerId: 'C-3', status: 'PENDING', mode: 'EARN', earnPoints: 5, outletId: 'OUT-1', deviceId: null, staffId: null, total: 100, eligibleTotal: 100 };
    prisma.hold.findUnique.mockResolvedValue(hold);
    prisma.wallet.findFirst.mockResolvedValue({ id: 'W3', balance: 0, type: 'POINTS' });
    let txUsed: any;
    prisma.$transaction = jest.fn(async (fn: any) => {
      txUsed = mkPrisma({
        receipt: { findUnique: jest.fn(() => null), create: jest.fn(() => ({ id: 'R3', redeemApplied: 0, earnApplied: 5 })) },
        wallet: { findUnique: jest.fn(() => ({ id: 'W3', balance: 0 })), update: jest.fn() },
        transaction: { create: jest.fn() },
        eventOutbox: { create: jest.fn() },
        hold: { update: jest.fn() },
        outlet: { findFirst: jest.fn(), update: jest.fn() },
      });
      return fn(txUsed);
    });
    const svc = new LoyaltyService(prisma as any, metrics as any, undefined as any);
    await svc.commit('H3', 'ORDER-3');
    expect(txUsed.outlet.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'OUT-1' } }));
  });

  it('caches rules per outlet', () => {
    const svc = new LoyaltyService({} as any, metrics as any, undefined as any);
    const base = { earnBps: 100, redeemLimitBps: 200 };
    const fn1 = (svc as any).compileRules('M-1', 'OUT-1', base, null, null);
    const fn2 = (svc as any).compileRules('M-1', 'OUT-1', base, null, null);
    const fn3 = (svc as any).compileRules('M-1', 'OUT-2', base, null, null);
    expect(fn1).toBe(fn2);
    expect(fn1).not.toBe(fn3);
  });
});
