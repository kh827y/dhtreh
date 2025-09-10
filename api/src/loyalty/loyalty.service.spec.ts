import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService.commit idempotency', () => {
  function mkPrisma(overrides: any = {}) {
    const base: any = {
      hold: { findUnique: jest.fn() },
      receipt: { findUnique: jest.fn(), create: jest.fn() },
      wallet: { findFirst: jest.fn() },
      transaction: { create: jest.fn() },
      eventOutbox: { create: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(base)),
    };
    return Object.assign(base, overrides);
  }

  const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

  it('returns alreadyCommitted when receipt exists and hold not pending', async () => {
    const prisma = mkPrisma();
    prisma.hold.findUnique.mockResolvedValue({ id: 'H1', merchantId: 'M-1', customerId: 'C-1', status: 'COMMITTED' });
    prisma.receipt.findUnique.mockResolvedValue({ id: 'R1', redeemApplied: 10, earnApplied: 5 });

    const svc = new LoyaltyService(prisma as any, metrics);
    const r = await svc.commit('H1', 'O-1');
    expect(r.alreadyCommitted).toBe(true);
    expect(r.receiptId).toBe('R1');
  });
});

