import { AntiFraudGuard } from '../../guards/antifraud.guard';

describe('AntiFraudGuard (daily cap priority)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.ANTIFRAUD_GUARD_FORCE = 'on';
    process.env.ANTIFRAUD_GUARD = 'on';
    process.env.AF_DAILY_CAP_CUSTOMER = '5';
    process.env.AF_LIMIT_CUSTOMER = '999';
    process.env.AF_WINDOW_CUSTOMER_SEC = '120';
    process.env.AF_MONTHLY_CAP_CUSTOMER = '999';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('enforces platform AF_DAILY_CAP_CUSTOMER even when merchant dailyCap=0', async () => {
    const prisma = {
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          merchantId: 'm1',
          rulesJson: { af: { customer: { dailyCap: 0, blockDaily: true } } },
        }),
      },
      transaction: {
        count: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.customerId && where?.createdAt?.gte instanceof Date) {
            const diffMs = Date.now() - where.createdAt.gte.getTime();
            if (diffMs < 60 * 60 * 1000) return 0; // velocity window
            return 5; // 24h / 30d windows
          }
          return 0;
        }),
      },
      hold: { findUnique: jest.fn() },
      device: { findFirst: jest.fn(), findUnique: jest.fn() },
    } as any;

    const metrics = { inc: jest.fn() } as any;
    const antifraud = {} as any;
    const alerts = { antifraudBlocked: jest.fn().mockResolvedValue(null) } as any;
    const staffNotify = { enqueueEvent: jest.fn().mockResolvedValue(null) } as any;

    const guard = new AntiFraudGuard(prisma, metrics, antifraud, alerts, staffNotify);

    const req = {
      method: 'POST',
      route: { path: '/loyalty/commit' },
      body: { merchantId: 'm1', customerId: 'c1' },
      params: {},
      query: {},
      headers: {},
    };

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /customer_daily=5\/5/i,
    );
  });

  it('applies platform daily cap before merchant notify-only cap', async () => {
    const prisma = {
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          merchantId: 'm1',
          rulesJson: { af: { customer: { dailyCap: 2, blockDaily: false } } },
        }),
      },
      transaction: {
        count: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.customerId && where?.createdAt?.gte instanceof Date) {
            const diffMs = Date.now() - where.createdAt.gte.getTime();
            if (diffMs < 60 * 60 * 1000) return 0; // velocity window
            return 5; // 24h / 30d windows
          }
          return 0;
        }),
      },
      hold: { findUnique: jest.fn() },
      device: { findFirst: jest.fn(), findUnique: jest.fn() },
    } as any;

    const metrics = { inc: jest.fn() } as any;
    const antifraud = {} as any;
    const alerts = { antifraudBlocked: jest.fn().mockResolvedValue(null) } as any;
    const staffNotify = { enqueueEvent: jest.fn().mockResolvedValue(null) } as any;

    const guard = new AntiFraudGuard(prisma, metrics, antifraud, alerts, staffNotify);

    const req = {
      method: 'POST',
      route: { path: '/loyalty/commit' },
      body: { merchantId: 'm1', customerId: 'c1' },
      params: {},
      query: {},
      headers: {},
    };

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /customer_daily=5\/5/i,
    );
  });
});
