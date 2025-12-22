import { ImportExportService } from './import-export.service';

const buildPrisma = (overrides: Partial<any> = {}) => {
  const prisma: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma),
    $queryRaw: jest.fn().mockResolvedValue([]),
    customer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'cust_1',
        phone: '+79001234567',
        email: null,
        externalId: null,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cust_1',
        phone: '+79001234567',
        email: null,
        externalId: null,
      }),
    },
    wallet: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'wallet_1' }),
      update: jest.fn().mockResolvedValue({ id: 'wallet_1' }),
    },
    receipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'rcp_1' }),
    },
    loyaltyTier: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    loyaltyTierAssignment: {
      upsert: jest.fn().mockResolvedValue({ id: 'assign_1' }),
    },
    customerStats: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return Object.assign(prisma, overrides);
};

describe('ImportExportService.importCustomers', () => {
  it('создаёт клиента, чек и выставляет баланс', async () => {
    const prisma = buildPrisma();
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;balance_points;operation_amount;earn_points;redeem_points;order_id;receipt_number',
      '+7 (900) 123-45-67;1200;1500;75;0;ORDER-1;0001',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.customersCreated).toBe(1);
    expect(result.receiptsImported).toBe(1);
    expect(result.balancesSet).toBe(1);
    expect(prisma.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'ORDER-1',
          total: 1500,
          earnApplied: 75,
          redeemApplied: 0,
        }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: 1200 } }),
    );
  });

  it('поддерживает русские заголовки', async () => {
    const prisma = buildPrisma();
    const service = new ImportExportService(prisma);
    const csv = [
      'Номер телефона;Сумма операции;ID операции',
      '+7 (900) 123-45-67;1500;ORDER-1',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.receiptsImported).toBe(1);
    expect(prisma.receipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'ORDER-1',
          total: 1500,
        }),
      }),
    );
  });

  it('пропускает дубликат чека с теми же данными', async () => {
    const prisma = buildPrisma({
      receipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rcp_1',
          customerId: 'cust_1',
          total: 1500,
          earnApplied: 75,
          redeemApplied: 0,
          receiptNumber: '0001',
        }),
        create: jest.fn(),
      },
    });
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;operation_amount;earn_points;redeem_points;order_id;receipt_number',
      '+7 (900) 123-45-67;1500;75;0;ORDER-1;0001',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.receiptsImported).toBe(0);
    expect(result.receiptsSkipped).toBe(1);
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  it('возвращает ошибку при конфликтующем order_id', async () => {
    const prisma = buildPrisma({
      receipt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rcp_1',
          customerId: 'cust_1',
          total: 1600,
          earnApplied: 75,
          redeemApplied: 0,
          receiptNumber: '0001',
        }),
        create: jest.fn(),
      },
    });
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;operation_amount;earn_points;redeem_points;order_id;receipt_number',
      '+7 (900) 123-45-67;1500;75;0;ORDER-1;0001',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.customersCreated).toBe(0);
    expect(result.customersUpdated).toBe(0);
    expect(result.receiptsImported).toBe(0);
    expect(result.receiptsSkipped).toBe(0);
    expect(result.errors?.[0]?.error).toContain('order_id уже используется');
  });

  it('обновляет агрегаты при наличии total_spent и visits_count', async () => {
    const prisma = buildPrisma({
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cust_1',
          phone: '+79001234567',
          email: null,
          externalId: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'cust_1',
          phone: '+79001234567',
          email: null,
          externalId: null,
        }),
        create: jest.fn(),
      },
      customerStats: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'cust_1',
            importedTotalSpent: 10000,
            importedVisits: 5,
            importedLastPurchaseAt: new Date('2024-10-12T00:00:00.000Z'),
          },
        ]),
      },
    });
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;total_spent;visits_count;last_purchase_at',
      '+7 (900) 123-45-67;10000;5;2024-10-12',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.statsUpdated).toBe(1);
    const upsertCalls = prisma.customerStats.upsert.mock.calls.map(
      ([payload]: any) => payload,
    );
    expect(upsertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            importedTotalSpent: 10000,
            importedVisits: 5,
            importedLastPurchaseAt: expect.any(Date),
          }),
        }),
        expect.objectContaining({
          update: expect.objectContaining({
            totalSpent: 10000,
            visits: 5,
          }),
        }),
      ]),
    );
  });

  it('назначает уровень по названию', async () => {
    const prisma = buildPrisma({
      loyaltyTier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tier_1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;level',
      '+7 (900) 123-45-67;Silver',
    ].join('\n');

    await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tierId: 'tier_1' }),
      }),
    );
  });

  it('находит уровень при скрытых пробелах в названии', async () => {
    const prisma = buildPrisma({
      loyaltyTier: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'tier_base', name: 'Base' }]),
      },
    });
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;level',
      `+7 (900) 123-45-67;Base\u200b`,
    ].join('\n');

    await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tierId: 'tier_base' }),
      }),
    );
  });

  it('игнорирует полностью пустые строки', async () => {
    const prisma = buildPrisma();
    const service = new ImportExportService(prisma);
    const csv = [
      'phone;balance_points;operation_amount;order_id',
      '+7 (900) 123-45-67;1200;1500;ORDER-1',
      ';;;',
    ].join('\n');

    const result = await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.customersCreated).toBe(1);
  });
});
