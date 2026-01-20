import { AntiFraudGuard } from '../antifraud.guard';
import type { ExecutionContext } from '@nestjs/common';
import type { AlertsService } from '../../../modules/alerts/alerts.service';
import type { AntiFraudService } from '../../../modules/antifraud/antifraud.service';
import type { MetricsService } from '../../metrics/metrics.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TelegramStaffNotificationsService } from '../../../modules/telegram/staff-notifications.service';
import { AppConfigService } from '../../config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type TransactionCountArgs = {
  where?: {
    customerId?: string;
    createdAt?: { gte?: Date };
  };
};
type PrismaStub = {
  merchantSettings: { findUnique: MockFn };
  transaction: { count: MockFn<number, [TransactionCountArgs]> };
  hold: { findUnique: MockFn };
  device: { findFirst: MockFn; findUnique: MockFn };
};
type MetricsStub = { inc: MockFn };
type AlertsStub = { antifraudBlocked: MockFn };
type StaffNotifyStub = { enqueueEvent: MockFn };
type RequestStub = {
  method: string;
  route: { path: string };
  body: { merchantId: string; customerId: string };
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};
type ContextStub = {
  switchToHttp: () => { getRequest: () => RequestStub };
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asAlertsService = (stub: AlertsStub) => stub as unknown as AlertsService;
const asAntifraudService = (stub: AntiFraudService) =>
  stub as unknown as AntiFraudService;
const asStaffNotifyService = (stub: StaffNotifyStub) =>
  stub as unknown as TelegramStaffNotificationsService;
const asExecutionContext = (stub: ContextStub) =>
  stub as unknown as ExecutionContext;

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
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({
          merchantId: 'm1',
          rulesJson: { af: { customer: { dailyCap: 0, blockDaily: true } } },
        }),
      },
      transaction: {
        count: mockFn<number, [TransactionCountArgs]>().mockImplementation(
          (args: TransactionCountArgs) => {
            const { where } = args;
            if (where?.customerId && where?.createdAt?.gte instanceof Date) {
              const diffMs = Date.now() - where.createdAt.gte.getTime();
              if (diffMs < 60 * 60 * 1000) return 0; // velocity window
              return 5; // 24h / 30d windows
            }
            return 0;
          },
        ),
      },
      hold: { findUnique: mockFn() },
      device: { findFirst: mockFn(), findUnique: mockFn() },
    };

    const metrics: MetricsStub = { inc: mockFn() };
    const antifraud = {} as AntiFraudService;
    const alerts: AlertsStub = {
      antifraudBlocked: mockFn().mockResolvedValue(null),
    };
    const staffNotify: StaffNotifyStub = {
      enqueueEvent: mockFn().mockResolvedValue(null),
    };

    const guard = new AntiFraudGuard(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asAntifraudService(antifraud),
      asAlertsService(alerts),
      asStaffNotifyService(staffNotify),
      new AppConfigService(),
    );

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
    };

    await expect(guard.canActivate(asExecutionContext(ctx))).rejects.toThrow(
      /customer_daily=5\/5/i,
    );
  });

  it('applies platform daily cap before merchant notify-only cap', async () => {
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({
          merchantId: 'm1',
          rulesJson: { af: { customer: { dailyCap: 2, blockDaily: false } } },
        }),
      },
      transaction: {
        count: mockFn<number, [TransactionCountArgs]>().mockImplementation(
          (args: TransactionCountArgs) => {
            const { where } = args;
            if (where?.customerId && where?.createdAt?.gte instanceof Date) {
              const diffMs = Date.now() - where.createdAt.gte.getTime();
              if (diffMs < 60 * 60 * 1000) return 0; // velocity window
              return 5; // 24h / 30d windows
            }
            return 0;
          },
        ),
      },
      hold: { findUnique: mockFn() },
      device: { findFirst: mockFn(), findUnique: mockFn() },
    };

    const metrics: MetricsStub = { inc: mockFn() };
    const antifraud = {} as AntiFraudService;
    const alerts: AlertsStub = {
      antifraudBlocked: mockFn().mockResolvedValue(null),
    };
    const staffNotify: StaffNotifyStub = {
      enqueueEvent: mockFn().mockResolvedValue(null),
    };

    const guard = new AntiFraudGuard(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asAntifraudService(antifraud),
      asAlertsService(alerts),
      asStaffNotifyService(staffNotify),
      new AppConfigService(),
    );

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
    };

    await expect(guard.canActivate(asExecutionContext(ctx))).rejects.toThrow(
      /customer_daily=5\/5/i,
    );
  });
});
