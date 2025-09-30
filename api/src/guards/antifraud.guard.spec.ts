import { ExecutionContext, HttpException } from '@nestjs/common';
import { AntiFraudGuard } from './antifraud.guard';
import { RiskLevel } from '../antifraud/antifraud.service';

describe('AntiFraudGuard', () => {
  const originalForce = process.env.ANTIFRAUD_GUARD_FORCE;
  const originalNodeEnv = process.env.NODE_ENV;

  let prisma: any;
  let metrics: any;
  let antifraud: any;
  let alerts: any;
  let guard: AntiFraudGuard;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ANTIFRAUD_GUARD_FORCE = 'on';
    prisma = {
      hold: { findUnique: jest.fn() },
      merchantSettings: { findUnique: jest.fn() },
      transaction: { count: jest.fn().mockResolvedValue(0) },
    };
    metrics = { inc: jest.fn() };
    antifraud = {
      checkTransaction: jest.fn(),
      recordFraudCheck: jest.fn().mockResolvedValue(null),
    };
    alerts = {
      antifraudBlocked: jest.fn().mockResolvedValue(undefined),
    };
    guard = new AntiFraudGuard(prisma, metrics, antifraud, alerts);
  });

  afterAll(() => {
    if (originalForce === undefined) delete process.env.ANTIFRAUD_GUARD_FORCE;
    else process.env.ANTIFRAUD_GUARD_FORCE = originalForce;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  const makeContext = (req: any): ExecutionContext => ({
    switchToHttp: () => ({ getRequest: () => req }),
  } as any);

  it('блокирует коммит без outletId при включённом факторе', async () => {
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-1',
      merchantId: 'M-1',
      customerId: 'C-1',
      mode: 'EARN',
      earnPoints: 100,
      redeemAmount: 0,
      outletId: null,
      deviceId: null,
      staffId: 'S-1',
    });
    prisma.merchantSettings.findUnique.mockResolvedValue({
      merchantId: 'M-1',
      rulesJson: { af: { blockFactors: ['no_outlet_id'] } },
    });

    const ctx = makeContext({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      body: { holdId: 'H-1' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    expect(alerts.antifraudBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ factor: 'no_outlet_id' }),
    );
    expect(antifraud.checkTransaction).not.toHaveBeenCalled();
  });

  it('использует deviceId в лимитах, если outletId отсутствует', async () => {
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-2',
      merchantId: 'M-1',
      customerId: 'C-2',
      mode: 'EARN',
      earnPoints: 200,
      redeemAmount: 0,
      outletId: null,
      deviceId: 'D-1',
      staffId: 'S-2',
    });
    prisma.merchantSettings.findUnique.mockResolvedValue({
      merchantId: 'M-1',
      rulesJson: { af: {} },
    });
    antifraud.checkTransaction.mockResolvedValue({
      level: RiskLevel.LOW,
      score: 10,
      factors: [],
      shouldBlock: false,
      shouldReview: false,
    });

    const ctx = makeContext({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      body: { holdId: 'H-2' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.transaction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceId: 'D-1' }),
      }),
    );
    expect(alerts.antifraudBlocked).not.toHaveBeenCalled();
    expect(antifraud.checkTransaction).toHaveBeenCalled();
  });
});
