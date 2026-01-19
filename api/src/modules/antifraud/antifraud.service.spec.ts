import { AntiFraudService, RiskLevel } from './antifraud.service';
import type { ConfigService } from '@nestjs/config';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  transaction: { count: MockFn; findMany: MockFn };
  adminAudit: { create: MockFn; findMany: MockFn };
  fraudCheck: { create: MockFn };
};
type MetricsStub = { inc: MockFn };
type TransactionContextStub = {
  merchantId: string;
  customerId: string;
  amount: number;
  type: 'EARN' | 'REDEEM';
  outletId?: string | null;
};
type AntiFraudServicePrivate = {
  checkOutlet: (
    context: TransactionContextStub,
  ) => Promise<{ score: number; factors: string[] }>;
  logSuspiciousActivity: (
    context: TransactionContextStub,
    score: number,
    factors: string[],
    level: RiskLevel,
  ) => Promise<void>;
  sendAdminAlert: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asConfigService = (stub: ConfigService) =>
  stub as unknown as ConfigService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateService = (service: AntiFraudService) =>
  service as unknown as AntiFraudServicePrivate;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const arrayContaining = <T>(value: T[]) =>
  expect.arrayContaining(value) as unknown as T[];

describe('AntiFraudService (outlet factors)', () => {
  let prisma: PrismaStub;
  let service: AntiFraudService;

  beforeEach(() => {
    prisma = {
      transaction: {
        count: mockFn(),
        findMany: mockFn(),
      },
      adminAudit: {
        create: mockFn(),
        findMany: mockFn(),
      },
      fraudCheck: {
        create: mockFn(),
      },
    };
    service = new AntiFraudService(
      asPrismaService(prisma),
      asConfigService({} as ConfigService),
      asMetricsService({ inc: mockFn() }),
    );
  });

  it('возвращает фактор no_outlet_id, если идентификаторы отсутствуют', async () => {
    const servicePrivate = asPrivateService(service);
    const result = await servicePrivate.checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-1',
      amount: 100,
      type: 'EARN',
    });
    expect(result.factors).toContain('no_outlet_id');
    expect(prisma.transaction.count).not.toHaveBeenCalled();
  });

  it('учитывает outletId при проверке множественности точек', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      { outletId: 'O-1' },
      { outletId: 'O-2' },
      { outletId: 'O-3' },
      { outletId: 'O-4' },
    ]);

    const servicePrivate = asPrivateService(service);
    const result = await servicePrivate.checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-1',
      amount: 200,
      type: 'EARN',
      outletId: 'O-1',
    });

    expect(prisma.transaction.findMany).toHaveBeenCalled();
    expect(result.factors).toEqual(
      expect.arrayContaining(['multiple_outlets:4']),
    );
  });

  it('не добавляет no_outlet_id, если outletId указан и есть история', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      { outletId: 'O-1' },
      { outletId: 'O-2' },
    ]);

    const servicePrivate = asPrivateService(service);
    const result = await servicePrivate.checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-2',
      amount: 50,
      type: 'REDEEM',
      outletId: 'O-1',
    });

    expect(result.factors).not.toContain('no_outlet_id');
  });

  it('сводит статистику с учётом riskLevel и факторов', async () => {
    prisma.adminAudit.findMany.mockResolvedValue([
      {
        payload: {
          riskLevel: RiskLevel.CRITICAL,
          factors: ['no_outlet_id', 'multiple_outlets:5'],
        },
      },
      { payload: { riskLevel: RiskLevel.HIGH, factors: ['no_outlet_id'] } },
      { payload: { riskLevel: RiskLevel.MEDIUM, factors: ['other_factor'] } },
    ]);

    const stats = await service.getStatistics('M-1', 7);
    expect(stats.blockedTransactions).toBe(1);
    expect(stats.reviewedTransactions).toBe(1);
    expect(stats.topFactors).toEqual(
      arrayContaining([{ factor: 'no_outlet_id', count: 2 }]),
    );
  });

  it('записывает outletId и уровень риска в журнал', async () => {
    prisma.adminAudit.create.mockResolvedValue(undefined);
    const servicePrivate = asPrivateService(service);
    const alertSpy = jest
      .spyOn(servicePrivate, 'sendAdminAlert')
      .mockResolvedValue(undefined);

    await servicePrivate.logSuspiciousActivity(
      {
        merchantId: 'M-1',
        customerId: 'C-1',
        amount: 150,
        type: 'EARN',
        outletId: 'O-99',
      },
      75,
      ['no_outlet_id'],
      RiskLevel.HIGH,
    );

    expect(prisma.adminAudit.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          payload: objectContaining({
            outletId: 'O-99',
            riskLevel: RiskLevel.HIGH,
          }),
        }),
      }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
