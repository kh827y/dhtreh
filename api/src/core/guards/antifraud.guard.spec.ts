import type { ExecutionContext } from '@nestjs/common';
import { AntiFraudGuard } from './antifraud.guard';
import { RiskLevel } from '../../modules/antifraud/antifraud.service';
import type { AlertsService } from '../../modules/alerts/alerts.service';
import type { AntiFraudService } from '../../modules/antifraud/antifraud.service';
import type { MetricsService } from '../metrics/metrics.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelegramStaffNotificationsService } from '../../modules/telegram/staff-notifications.service';
import { AppConfigService } from '../config/app-config.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type TransactionCountArgs = { where?: { outletId?: string } };
type PrismaStub = {
  hold: { findUnique: MockFn };
  merchantSettings: { findUnique: MockFn };
  transaction: { count: MockFn<unknown, [TransactionCountArgs]> };
};
type MetricsStub = { inc: MockFn };
type AntiFraudStub = { checkTransaction: MockFn; recordFraudCheck: MockFn };
type AlertsStub = { antifraudBlocked: MockFn };
type StaffNotifyStub = { pushSuspiciousTx: MockFn };
type RequestStub = {
  method: string;
  route: { path: string };
  body: { holdId: string };
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
const asAntiFraudService = (stub: AntiFraudStub) =>
  stub as unknown as AntiFraudService;
const asAlertsService = (stub: AlertsStub) => stub as unknown as AlertsService;
const asStaffNotifyService = (stub: StaffNotifyStub) =>
  stub as unknown as TelegramStaffNotificationsService;
const asExecutionContext = (stub: ContextStub) =>
  stub as unknown as ExecutionContext;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

describe('AntiFraudGuard', () => {
  const originalForce = process.env.ANTIFRAUD_GUARD_FORCE;
  const originalGuard = process.env.ANTIFRAUD_GUARD;
  const originalNodeEnv = process.env.NODE_ENV;

  let prisma: PrismaStub;
  let metrics: MetricsStub;
  let antifraud: AntiFraudStub;
  let alerts: AlertsStub;
  let guard: AntiFraudGuard;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.ANTIFRAUD_GUARD_FORCE = 'on';
    process.env.ANTIFRAUD_GUARD = 'on';
    prisma = {
      hold: { findUnique: mockFn() },
      merchantSettings: { findUnique: mockFn() },
      transaction: {
        count: mockFn<unknown, [TransactionCountArgs]>().mockResolvedValue(0),
      },
    };
    metrics = { inc: mockFn() };
    antifraud = {
      checkTransaction: mockFn(),
      recordFraudCheck: mockFn().mockResolvedValue(null),
    };
    alerts = {
      antifraudBlocked: mockFn().mockResolvedValue(undefined),
    };
    const staffNotify: StaffNotifyStub = {
      pushSuspiciousTx: mockFn(),
    };
    guard = new AntiFraudGuard(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asAntiFraudService(antifraud),
      asAlertsService(alerts),
      asStaffNotifyService(staffNotify),
      new AppConfigService(),
    );
  });

  afterAll(() => {
    if (originalForce === undefined) delete process.env.ANTIFRAUD_GUARD_FORCE;
    else process.env.ANTIFRAUD_GUARD_FORCE = originalForce;
    if (originalGuard === undefined) delete process.env.ANTIFRAUD_GUARD;
    else process.env.ANTIFRAUD_GUARD = originalGuard;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  const makeContext = (req: RequestStub): ExecutionContext =>
    asExecutionContext({
      switchToHttp: () => ({ getRequest: () => req }),
    });

  it('не блокирует коммит без outletId при включённом факторе', async () => {
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-1',
      merchantId: 'M-1',
      customerId: 'C-1',
      mode: 'EARN',
      earnPoints: 100,
      redeemAmount: 0,
      outletId: null,
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

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(alerts.antifraudBlocked).not.toHaveBeenCalled();
    expect(antifraud.checkTransaction).toHaveBeenCalled();
  });

  it('использует outletId в лимитах, если он указан', async () => {
    prisma.hold.findUnique.mockResolvedValue({
      id: 'H-2',
      merchantId: 'M-1',
      customerId: 'C-2',
      mode: 'EARN',
      earnPoints: 200,
      redeemAmount: 0,
      outletId: 'O-1',
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
    const countCalls = prisma.transaction.count.mock.calls as [
      TransactionCountArgs,
    ][];
    expect(countCalls.some((args) => args[0]?.where?.outletId === 'O-1')).toBe(
      true,
    );
    expect(alerts.antifraudBlocked).not.toHaveBeenCalled();
    expect(antifraud.checkTransaction).toHaveBeenCalledWith(
      objectContaining({ outletId: 'O-1' }),
    );
  });
});
