import { EarnActivationWorker } from './earn-activation.worker';

describe('EarnActivationWorker (unit)', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('activates matured PENDING lots, updates wallet and emits event', async () => {
    process.env.WORKERS_ENABLED = '1';

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const maturedAt = new Date(Date.now() - 1000);
    const pendingLot = {
      id: 'L1',
      merchantId: 'M1',
      customerId: 'C1',
      points: 70,
      consumedPoints: 0,
      maturesAt: maturedAt,
      earnedAt: null,
      status: 'PENDING',
      orderId: 'O1',
      outletId: null,
      staffId: null,
    } as any;

    const tx = {
      earnLot: {
        findUnique: jest.fn().mockResolvedValue(pendingLot),
        update: jest.fn().mockResolvedValue({}),
      },
      wallet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'W1',
          merchantId: 'M1',
          customerId: 'C1',
          type: 'POINTS',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      transaction: { create: jest.fn().mockResolvedValue({}) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      eventOutbox: { create: jest.fn().mockResolvedValue({}) },
    } as any;

    const prisma: any = {
      earnLot: { findMany: jest.fn().mockResolvedValue([pendingLot]) },
      $transaction: async (fn: (tx: any) => Promise<any>) => await fn(tx),
    };
    const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };

    const w = new EarnActivationWorker(prisma, metrics);
    // @ts-ignore private
    await w.tick();

    expect(tx.earnLot.findUnique).toHaveBeenCalledWith({ where: { id: 'L1' } });
    expect(tx.earnLot.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: { status: 'ACTIVE', earnedAt: maturedAt },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: 'W1' },
      data: { balance: { increment: 70 } },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantId: 'M1',
          customerId: 'C1',
          type: 'EARN',
          amount: 70,
        }),
      }),
    );
    expect(tx.eventOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'loyalty.earn.activated',
          payload: expect.objectContaining({ outletId: null }),
        }),
      }),
    );
  });

  it('skips if lot is not matured yet', async () => {
    process.env.WORKERS_ENABLED = '1';

    const lockUtil = require('./pg-lock.util');
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    const future = new Date(Date.now() + 60_000);
    const lot = {
      id: 'L2',
      merchantId: 'M1',
      customerId: 'C1',
      points: 50,
      maturesAt: future,
      status: 'PENDING',
    } as any;

    const tx = {
      earnLot: { findUnique: jest.fn().mockResolvedValue({ ...lot }) },
      wallet: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      transaction: { create: jest.fn() },
      eventOutbox: { create: jest.fn() },
    } as any;

    const prisma: any = {
      earnLot: { findMany: jest.fn().mockResolvedValue([lot]) },
      $transaction: async (fn: (tx: any) => Promise<any>) => await fn(tx),
    };
    const metrics: any = { inc: jest.fn(), setGauge: jest.fn() };

    const w = new EarnActivationWorker(prisma, metrics);
    // @ts-ignore private
    await w.tick();

    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.eventOutbox.create).not.toHaveBeenCalled();
  });
});
