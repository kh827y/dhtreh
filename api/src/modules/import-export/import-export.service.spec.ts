import { ImportExportService } from './import-export.service';
import { ImportExportCustomersService } from './services/import-export-customers.service';
import { ImportExportExportsService } from './services/import-export-exports.service';
import { ImportExportFileService } from './services/import-export-file.service';
import { ImportExportJobsService } from './services/import-export-jobs.service';
import { ImportExportLogsService } from './services/import-export-logs.service';
import { ImportExportTemplatesService } from './services/import-export-templates.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockPrisma = {
  $transaction: (fn: (tx: MockPrisma) => Promise<unknown>) => Promise<unknown>;
  $queryRaw: MockFn;
  syncLog: { create: MockFn; findFirst: MockFn; count: MockFn };
  customer: {
    findFirst: MockFn;
    create: MockFn;
    update: MockFn;
  };
  wallet: {
    findFirst: MockFn;
    create: MockFn;
    update: MockFn;
    upsert: MockFn;
  };
  receipt: {
    findUnique: MockFn;
    create: MockFn;
  };
  transaction: {
    create: MockFn;
  };
  loyaltyTier: {
    findFirst: MockFn;
    findMany: MockFn;
  };
  loyaltyTierAssignment: {
    upsert: MockFn;
  };
  customerStats: {
    upsert: MockFn;
    findMany: MockFn;
  };
};
type PrismaOverrides = {
  $transaction?: MockPrisma['$transaction'];
  $queryRaw?: MockPrisma['$queryRaw'];
  customer?: Partial<MockPrisma['customer']>;
  wallet?: Partial<MockPrisma['wallet']>;
  receipt?: Partial<MockPrisma['receipt']>;
  transaction?: Partial<MockPrisma['transaction']>;
  loyaltyTier?: Partial<MockPrisma['loyaltyTier']>;
  loyaltyTierAssignment?: Partial<MockPrisma['loyaltyTierAssignment']>;
  customerStats?: Partial<MockPrisma['customerStats']>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const arrayContaining = <T>(value: T[]) =>
  expect.arrayContaining(value) as unknown as T[];
const anyValue = <T>(ctor: new (...args: never[]) => T) =>
  expect.any(ctor) as unknown as T;

const buildPrisma = (overrides: PrismaOverrides = {}): MockPrisma => {
  const prisma: MockPrisma = {
    $transaction: async (fn) => fn(prisma),
    $queryRaw: mockFn().mockResolvedValue([]),
    syncLog: {
      create: mockFn().mockResolvedValue({}),
      findFirst: mockFn().mockResolvedValue(null),
      count: mockFn().mockResolvedValue(0),
    },
    customer: {
      findFirst: mockFn().mockResolvedValue(null),
      create: mockFn().mockResolvedValue({
        id: 'cust_1',
        phone: '+79001234567',
        email: null,
        externalId: null,
      }),
      update: mockFn().mockResolvedValue({
        id: 'cust_1',
        phone: '+79001234567',
        email: null,
        externalId: null,
      }),
    },
    wallet: {
      findFirst: mockFn().mockResolvedValue(null),
      create: mockFn().mockResolvedValue({ id: 'wallet_1' }),
      update: mockFn().mockResolvedValue({ id: 'wallet_1' }),
      upsert: mockFn().mockResolvedValue({ id: 'wallet_1', balance: 0 }),
    },
    receipt: {
      findUnique: mockFn().mockResolvedValue(null),
      create: mockFn().mockResolvedValue({ id: 'rcp_1' }),
    },
    transaction: {
      create: mockFn().mockResolvedValue({ id: 'tx_1' }),
    },
    loyaltyTier: {
      findFirst: mockFn().mockResolvedValue(null),
      findMany: mockFn().mockResolvedValue([]),
    },
    loyaltyTierAssignment: {
      upsert: mockFn().mockResolvedValue({ id: 'assign_1' }),
    },
    customerStats: {
      upsert: mockFn().mockResolvedValue({}),
      findMany: mockFn().mockResolvedValue([]),
    },
  };

  if (overrides.$transaction) prisma.$transaction = overrides.$transaction;
  if (overrides.$queryRaw) prisma.$queryRaw = overrides.$queryRaw;
  prisma.customer = { ...prisma.customer, ...overrides.customer };
  prisma.wallet = { ...prisma.wallet, ...overrides.wallet };
  prisma.receipt = { ...prisma.receipt, ...overrides.receipt };
  prisma.transaction = { ...prisma.transaction, ...overrides.transaction };
  prisma.loyaltyTier = { ...prisma.loyaltyTier, ...overrides.loyaltyTier };
  prisma.loyaltyTierAssignment = {
    ...prisma.loyaltyTierAssignment,
    ...overrides.loyaltyTierAssignment,
  };
  prisma.customerStats = {
    ...prisma.customerStats,
    ...overrides.customerStats,
  };

  return prisma;
};

const buildService = (prisma: MockPrisma) => {
  const prismaService = asPrismaService(prisma);
  const files = new ImportExportFileService();
  const logs = new ImportExportLogsService(prismaService);
  const customers = new ImportExportCustomersService(
    prismaService,
    files,
    logs,
  );
  const exportsService = new ImportExportExportsService(
    prismaService,
    files,
    logs,
  );
  const templates = new ImportExportTemplatesService(files);
  const jobs = new ImportExportJobsService(prismaService, customers);
  return new ImportExportService(
    jobs,
    customers,
    exportsService,
    logs,
    templates,
  );
};

describe('ImportExportService.importCustomers', () => {
  it('создаёт клиента, чек и выставляет баланс', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);
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
      objectContaining({
        data: objectContaining({
          orderId: 'ORDER-1',
          total: 1500,
          earnApplied: 75,
          redeemApplied: 0,
        }),
      }),
    );
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          type: 'EARN',
          amount: 75,
          orderId: 'ORDER-1',
        }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      objectContaining({ data: { balance: 1200 } }),
    );
  });

  it('поддерживает русские заголовки', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);
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
      objectContaining({
        data: objectContaining({
          orderId: 'ORDER-1',
          total: 1500,
        }),
      }),
    );
  });

  it('пропускает дубликат чека с теми же данными', async () => {
    const prisma = buildPrisma({
      receipt: {
        findUnique: mockFn().mockResolvedValue({
          id: 'rcp_1',
          customerId: 'cust_1',
          total: 1500,
          earnApplied: 75,
          redeemApplied: 0,
          receiptNumber: '0001',
        }),
        create: mockFn(),
      },
    });
    const service = buildService(prisma);
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
        findUnique: mockFn().mockResolvedValue({
          id: 'rcp_1',
          customerId: 'cust_1',
          total: 1600,
          earnApplied: 75,
          redeemApplied: 0,
          receiptNumber: '0001',
        }),
        create: mockFn(),
      },
    });
    const service = buildService(prisma);
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
        findFirst: mockFn().mockResolvedValue({
          id: 'cust_1',
          phone: '+79001234567',
          email: null,
          externalId: null,
        }),
        update: mockFn().mockResolvedValue({
          id: 'cust_1',
          phone: '+79001234567',
          email: null,
          externalId: null,
        }),
        create: mockFn(),
      },
      customerStats: {
        upsert: mockFn().mockResolvedValue({}),
        findMany: mockFn().mockResolvedValue([
          {
            customerId: 'cust_1',
            importedTotalSpent: 10000,
            importedVisits: 5,
            importedLastPurchaseAt: new Date('2024-10-12T00:00:00.000Z'),
          },
        ]),
      },
    });
    const service = buildService(prisma);
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
      ([payload]) => payload,
    );
    expect(upsertCalls).toEqual(
      arrayContaining([
        objectContaining({
          update: objectContaining({
            importedTotalSpent: 10000,
            importedVisits: 5,
            importedLastPurchaseAt: anyValue(Date),
          }),
        }),
        objectContaining({
          update: objectContaining({
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
        findFirst: mockFn().mockResolvedValue({ id: 'tier_1' }),
        findMany: mockFn().mockResolvedValue([]),
      },
    });
    const service = buildService(prisma);
    const csv = ['phone;level', '+7 (900) 123-45-67;Silver'].join('\n');

    await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      objectContaining({
        update: objectContaining({ tierId: 'tier_1' }),
      }),
    );
  });

  it('находит уровень при скрытых пробелах в названии', async () => {
    const prisma = buildPrisma({
      loyaltyTier: {
        findFirst: mockFn().mockResolvedValue(null),
        findMany: mockFn().mockResolvedValue([
          { id: 'tier_base', name: 'Base' },
        ]),
      },
    });
    const service = buildService(prisma);
    const csv = ['phone;level', `+7 (900) 123-45-67;Base\u200b`].join('\n');

    await service.importCustomers({
      merchantId: 'm_1',
      format: 'csv',
      data: Buffer.from(csv),
      updateExisting: true,
    });

    expect(prisma.loyaltyTierAssignment.upsert).toHaveBeenCalledWith(
      objectContaining({
        update: objectContaining({ tierId: 'tier_base' }),
      }),
    );
  });

  it('игнорирует полностью пустые строки', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);
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
