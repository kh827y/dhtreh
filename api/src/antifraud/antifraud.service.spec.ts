import { AntiFraudService, RiskLevel } from './antifraud.service';

describe('AntiFraudService (outlet factors)', () => {
  let prisma: any;
  let service: AntiFraudService;

  beforeEach(() => {
    prisma = {
      transaction: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      adminAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      fraudCheck: {
        create: jest.fn(),
      },
    };
    service = new AntiFraudService(
      prisma,
      {} as any,
      { inc: jest.fn() } as any,
    );
  });

  it('возвращает фактор no_outlet_id, если идентификаторы отсутствуют', async () => {
    const result = await (service as any).checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-1',
      amount: 100,
      type: 'EARN',
    });
    expect(result.factors).toContain('no_outlet_id');
    expect(prisma.transaction.count).not.toHaveBeenCalled();
  });

  it('учитывает outletId при проверке новой точки и множественности', async () => {
    prisma.transaction.count.mockResolvedValueOnce(0);
    prisma.transaction.findMany.mockResolvedValueOnce([
      { outletId: 'O-1' },
      { outletId: 'O-2' },
      { outletId: 'O-3' },
      { outletId: 'O-4' },
    ]);

    const result = await (service as any).checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-1',
      amount: 200,
      type: 'EARN',
      outletId: 'O-1',
    });

    expect(prisma.transaction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ outletId: 'O-1' }),
      }),
    );
    expect(prisma.transaction.findMany).toHaveBeenCalled();
    expect(result.factors).toEqual(
      expect.arrayContaining(['new_outlet', 'multiple_outlets:4']),
    );
  });

  it('не добавляет no_outlet_id, если outletId указан и есть история', async () => {
    prisma.transaction.count.mockResolvedValueOnce(3);
    prisma.transaction.findMany.mockResolvedValueOnce([
      { outletId: 'O-1' },
      { outletId: 'O-2' },
    ]);

    const result = await (service as any).checkOutlet({
      merchantId: 'M-1',
      customerId: 'C-2',
      amount: 50,
      type: 'REDEEM',
      outletId: 'O-1',
    });

    expect(prisma.transaction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ outletId: 'O-1' }),
      }),
    );
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
      expect.arrayContaining([{ factor: 'no_outlet_id', count: 2 }]),
    );
  });

  it('записывает outletId и уровень риска в журнал', async () => {
    prisma.adminAudit.create.mockResolvedValue(undefined);
    const alertSpy = jest
      .spyOn(service as any, 'sendAdminAlert')
      .mockResolvedValue(undefined);

    await (service as any).logSuspiciousActivity(
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
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
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
