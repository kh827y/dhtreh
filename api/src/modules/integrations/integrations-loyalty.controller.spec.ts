import { BadRequestException } from '@nestjs/common';
import { IntegrationsLoyaltyController } from './integrations-loyalty.controller';
import type { LoyaltyService } from '../loyalty/services/loyalty.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { LookupCacheService } from '../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type {
  IntegrationBonusDto,
  IntegrationCalculateActionDto,
  IntegrationCalculateBonusDto,
  IntegrationCodeRequestDto,
  IntegrationRefundDto,
} from './dto';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type MockPrisma = {
  customer: MockModel;
  qrNonce: MockModel;
  outlet: MockModel;
  device: MockModel;
  merchantSettings: MockModel;
  staff: MockModel;
  staffOutletAccess: MockModel;
  transaction: MockModel;
  receipt: MockModel;
  syncLog: MockModel;
  [key: string]: MockModel | MockFn | undefined;
};
type PrismaOverrides = Partial<MockPrisma>;
type LoyaltyStub = {
  calculateBonusPreview: MockFn;
  processIntegrationBonus: MockFn;
  refund: MockFn;
  balance: MockFn;
  getBaseRatesForCustomer: MockFn;
  getCustomerAnalytics: MockFn;
  calculateAction: MockFn;
};
type LoyaltyOverrides = Partial<LoyaltyStub>;
type CacheStub = {
  getMerchantSettings: MockFn;
  getOutlet: MockFn;
  getStaff: MockFn;
};
type OutletStub = {
  id: string;
  merchantId?: string | null;
  name?: string | null;
};
type StaffStub = {
  id: string;
  merchantId?: string | null;
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  login?: string | null;
  email?: string | null;
  allowedOutletId?: string | null;
  accesses?: Array<{ outletId?: string | null } | null>;
};
type IntegrationRequestStub = {
  integrationMerchantId?: string;
  integrationId?: string;
  requestId?: string;
  merchantId?: string;
  headers?: Record<string, string>;
  body?: unknown;
};
type ControllerPrivate = {
  resolveFromToken: MockFn;
  ensureCustomer: MockFn;
  buildClientPayload: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: MockPrisma) => stub as unknown as PrismaService;
const asLoyaltyService = (stub: LoyaltyStub) =>
  stub as unknown as LoyaltyService;
const asCacheService = (stub: CacheStub) =>
  stub as unknown as LookupCacheService;
const asRequest = (req: IntegrationRequestStub) =>
  req as unknown as Parameters<
    IntegrationsLoyaltyController['calculateBonusPreview']
  >[1];
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

function createPrismaMock(overrides: PrismaOverrides = {}): MockPrisma {
  const base: MockPrisma = {
    customer: {
      findUnique: mockFn().mockResolvedValue(null),
    },
    qrNonce: {
      findUnique: mockFn().mockResolvedValue(null),
      delete: mockFn().mockResolvedValue(null),
    },
    outlet: {
      findMany: mockFn().mockResolvedValue([]),
      findFirst: mockFn().mockResolvedValue(null),
    },
    device: {
      findFirst: mockFn().mockResolvedValue(null),
    },
    merchantSettings: {
      findUnique: mockFn().mockResolvedValue(null),
    },
    staff: {
      findFirst: mockFn().mockResolvedValue(null),
    },
    staffOutletAccess: {
      findMany: mockFn().mockResolvedValue([]),
    },
    transaction: {
      findMany: mockFn().mockResolvedValue([]),
    },
    receipt: {
      findMany: mockFn().mockResolvedValue([]),
      findFirst: mockFn().mockResolvedValue(null),
      findUnique: mockFn().mockResolvedValue(null),
    },
    syncLog: {
      create: mockFn().mockResolvedValue(null),
    },
  };
  return { ...base, ...overrides };
}

function createCacheMock(prisma: MockPrisma): CacheStub {
  return {
    getMerchantSettings: mockFn().mockImplementation(
      async (merchantId: string) =>
        prisma.merchantSettings.findUnique({
          where: { merchantId },
        }),
    ),
    getOutlet: mockFn().mockImplementation(
      async (merchantId: string, outletId: string) => {
        const outlet = (await prisma.outlet.findFirst({
          where: { id: outletId, merchantId },
        })) as OutletStub | null;
        if (!outlet) return null;
        return {
          id: outlet.id,
          merchantId: outlet.merchantId ?? merchantId,
          name: outlet.name ?? null,
        };
      },
    ),
    getStaff: mockFn().mockImplementation(
      async (merchantId: string, staffId: string) => {
        const staff = (await prisma.staff.findFirst({
          where: { id: staffId, merchantId },
        })) as StaffStub | null;
        if (!staff) return null;
        const accesses = Array.isArray(staff.accesses)
          ? staff.accesses
          : [];
        return {
          id: staff.id,
          merchantId: staff.merchantId ?? merchantId,
          status: staff.status ?? 'ACTIVE',
          firstName: staff.firstName ?? null,
          lastName: staff.lastName ?? null,
          login: staff.login ?? null,
          email: staff.email ?? null,
          allowedOutletId: staff.allowedOutletId ?? null,
          accessOutletIds: accesses
            .map((entry) => entry?.outletId)
            .filter(Boolean),
        };
      },
    ),
  };
}

function createController(
  prismaOverrides: PrismaOverrides = {},
  loyaltyOverrides: LoyaltyOverrides = {},
) {
  const prisma = createPrismaMock(prismaOverrides);
  const cache = createCacheMock(prisma);
  const loyalty: LoyaltyStub = {
    calculateBonusPreview: mockFn(),
    processIntegrationBonus: mockFn(),
    refund: mockFn(),
    balance: mockFn(),
    getBaseRatesForCustomer: mockFn(),
    getCustomerAnalytics: mockFn(),
    calculateAction: mockFn(),
    ...loyaltyOverrides,
  };
  const controller = new IntegrationsLoyaltyController(
    asLoyaltyService(loyalty),
    asPrismaService(prisma),
    asCacheService(cache),
    new AppConfigService(),
  );
  return { controller, prisma, loyalty, cache };
}

describe('IntegrationsLoyaltyController', () => {
  const baseReq: IntegrationRequestStub = {
    integrationMerchantId: 'M-1',
    headers: {},
    requestId: 'req-1',
  };

  it('использует id_client при отсутствии userToken', async () => {
    const customer = {
      id: 'MC-1',
      merchantId: 'M-1',
      customerId: 'C-1',
      customer: { id: 'C-1' },
    };
    const { controller, prisma, loyalty } = createController({
      customer: {
        findUnique: mockFn().mockResolvedValue(customer),
      },
    });
    loyalty.calculateBonusPreview.mockResolvedValue({
      items: [],
      max_pay_bonus: 0,
      bonus_value: 0,
      final_payable: 0,
    });

    const dto: IntegrationCalculateBonusDto = {
      id_client: customer.id,
      items: [{ id_product: 'P1', qty: 1, price: 100 }],
    };
    const resp = await controller.calculateBonusPreview(
      dto,
      asRequest({ ...baseReq, body: dto }),
    );

    expect(resp.status).toBe('ok');
    expect(loyalty.calculateBonusPreview).toHaveBeenCalledWith(
      objectContaining({
        customerId: customer.id,
      }),
    );
    expect(prisma.customer.findUnique).toHaveBeenCalled();
  });

  it('ошибается, если не переданы outlet_id/device_id/manager_id в BONUS', async () => {
    const customer = {
      id: 'MC-2',
      merchantId: 'M-1',
      customerId: 'C-2',
      customer: { id: 'C-2' },
    };
    const { controller, prisma, loyalty } = createController({
      customer: {
        findUnique: mockFn().mockResolvedValue(customer),
      },
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      receiptId: 'R-1',
      orderId: 'R-1',
      invoiceNum: 'ORDER-1',
      redeemApplied: 0,
      earnApplied: 0,
      balanceBefore: 0,
      balanceAfter: 0,
      alreadyProcessed: false,
    });

    const dto: IntegrationBonusDto = {
      id_client: customer.id,
      invoice_num: 'ORDER-1',
      idempotency_key: 'idem-1',
      total: 100,
      items: [],
    };
    await expect(
      controller.bonus(dto, asRequest({ ...baseReq, body: dto })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(loyalty.processIntegrationBonus).not.toHaveBeenCalled();
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it('прокидывает managerId и подставляет outlet из сотрудника', async () => {
    const customer = {
      id: 'MC-3',
      merchantId: 'M-1',
      customerId: 'C-3',
      customer: { id: 'C-3' },
    };
    const { controller, loyalty } = createController({
      customer: {
        findUnique: mockFn().mockResolvedValue(customer),
      },
      staff: {
        findFirst: mockFn().mockResolvedValue({
          id: 'STAFF-1',
          merchantId: 'M-1',
          status: 'ACTIVE',
          firstName: 'Anna',
          lastName: 'Ivanova',
          login: 'anna',
          email: null,
          allowedOutletId: 'OUT-1',
          accesses: [],
        }),
      },
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      receiptId: 'R-2',
      orderId: 'R-2',
      invoiceNum: 'ORDER-2',
      redeemApplied: 0,
      earnApplied: 5,
      balanceBefore: 10,
      balanceAfter: 15,
      alreadyProcessed: false,
    });

    const dto: IntegrationBonusDto = {
      id_client: customer.id,
      invoice_num: 'ORDER-2',
      idempotency_key: 'idem-2',
      total: 200,
      manager_id: 'STAFF-1',
      items: [{ id_product: 'X', qty: 1, price: 200 }],
    };
    const resp = await controller.bonus(
      dto,
      asRequest({ ...baseReq, body: dto }),
    );

    expect(loyalty.processIntegrationBonus).toHaveBeenCalledWith(
      objectContaining({
        staffId: 'STAFF-1',
        outletId: 'OUT-1',
        invoiceNum: 'ORDER-2',
      }),
    );
    expect(resp.order_id).toBe('R-2');
  });

  it('возвращает invoice_num/order_id и client в ответе BONUS', async () => {
    const customer = {
      id: 'MC-4',
      merchantId: 'M-1',
      customerId: 'C-4',
      customer: { id: 'C-4' },
    };
    const { controller, loyalty } = createController({
      customer: {
        findUnique: mockFn().mockResolvedValue(customer),
      },
      receipt: {
        findFirst: mockFn().mockResolvedValue({
          id: 'R-4',
          outletId: 'OUT-42',
        }),
        findUnique: mockFn().mockResolvedValue(null),
      },
      outlet: {
        findFirst: mockFn().mockResolvedValue({
          id: 'OUT-42',
          name: 'Outlet 42',
        }),
      },
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      orderId: 'R-4',
      receiptId: 'R-4',
      invoiceNum: 'INV-42',
      redeemApplied: 0,
      earnApplied: 10,
      balanceBefore: 0,
      balanceAfter: 10,
      alreadyProcessed: false,
    });

    const dto: IntegrationBonusDto = {
      id_client: customer.id,
      invoice_num: 'INV-42',
      idempotency_key: 'idem-42',
      total: 420,
      outlet_id: 'OUT-42',
      items: [{ id_product: 'SKU', qty: 1, price: 420 }],
    };
    const resp = await controller.bonus(
      dto,
      asRequest({ ...baseReq, body: dto }),
    );

    expect(resp.invoice_num).toBe('INV-42');
    expect(resp.order_id).toBe('R-4');
    expect(resp.client.id_client).toBe(customer.id);
  });

  it('возвращает invoice_num/order_id в ответе REFUND', async () => {
    const receiptRow = {
      id: 'RID-1',
      orderId: 'INV-1',
      outletId: null,
      customerId: 'C-9',
      merchantId: 'M-1',
    };
    const { controller, loyalty } = createController({
      receipt: {
        findFirst: mockFn().mockResolvedValue(null),
        findMany: mockFn().mockResolvedValue([receiptRow]),
        findUnique: mockFn().mockResolvedValue(null),
      },
    });
    loyalty.refund.mockResolvedValue({
      pointsRestored: 30,
      pointsRevoked: 10,
      customerId: 'MC-9',
    });
    loyalty.balance.mockResolvedValue({ balance: 100 });

    const dto: IntegrationRefundDto = { invoice_num: 'INV-1' };
    const resp = await controller.refund(
      dto,
      asRequest({ ...baseReq, body: dto }),
    );

    expect(loyalty.refund).toHaveBeenCalledWith(
      objectContaining({
        invoiceNum: 'INV-1',
        orderId: 'RID-1',
      }),
    );
    expect(resp.invoice_num).toBe('INV-1');
    expect(resp.order_id).toBe('RID-1');
    expect(resp.points_restored).toBe(30);
    expect(resp.points_revoked).toBe(10);
  });

  it('calculate action нормализует позиции и возвращает статус ok', async () => {
    const { controller, loyalty } = createController(
      {
        customer: {
          findUnique: mockFn().mockResolvedValue({
            id: 'C-1',
            merchantId: 'M-1',
          }),
        },
        outlet: {
          findFirst: mockFn().mockResolvedValue({ id: 'OUT-1' }),
        },
      },
      {
        calculateAction: mockFn().mockResolvedValue({
          positions: [
            {
              id_product: 'p1',
              name: 'Латте',
              qty: 2,
              price: 100,
              base_price: null,
              actions: [],
              actions_names: [],
            },
          ],
          info: [],
        }),
      },
    );

    const dto: IntegrationCalculateActionDto = {
      id_client: 'C-1',
      outlet_id: 'OUT-1',
      items: [
        {
          id_product: 'p1',
          name: 'Латте',
          qty: 2,
          price: 100,
        },
      ],
    };

    const resp = await controller.calculateAction(
      dto,
      asRequest({ ...baseReq, body: dto }),
    );

    expect(resp.status).toBe('ok');
    expect(loyalty.calculateAction).toHaveBeenCalledWith(
      objectContaining({
        merchantId: 'M-1',
        customerId: 'C-1',
        items: [
          objectContaining({
            externalId: 'p1',
            qty: 2,
            price: 100,
            name: 'Латте',
          }),
        ],
      }),
    );

    const passedItems = (
      loyalty.calculateAction.mock.calls[0][0] as IntegrationCalculateActionDto
    ).items as Array<{ categoryId?: string; basePrice?: number }>;
    expect(passedItems[0].categoryId).toBeUndefined();
    expect(passedItems[0].basePrice).toBeUndefined();
  });

  it('code требует JWT при включённом requireJwtForQuote', async () => {
    const { controller } = createController({
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ requireJwtForQuote: true }),
      },
    });
    const controllerPrivate = controller as unknown as ControllerPrivate;
    jest.spyOn(controllerPrivate, 'resolveFromToken').mockResolvedValue({
      kind: 'short',
      customerId: 'C-1',
      merchantAud: 'M-1',
    });

    await expect(
      controller.code(
        { user_token: 'qr' } as IntegrationCodeRequestDto,
        asRequest({ ...baseReq, body: { user_token: 'qr' } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('code возвращает профиль клиента при валидном токене', async () => {
    const { controller } = createController({
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ requireJwtForQuote: false }),
      },
    });
    const controllerPrivate = controller as unknown as ControllerPrivate;
    jest.spyOn(controllerPrivate, 'resolveFromToken').mockResolvedValue({
      kind: 'short',
      customerId: 'C-2',
      merchantAud: 'M-1',
    });
    jest.spyOn(controllerPrivate, 'ensureCustomer').mockResolvedValue({
      id: 'C-2',
    });
    jest.spyOn(controllerPrivate, 'buildClientPayload').mockResolvedValue({
      id_client: 'C-2',
    });

    const resp = await controller.code(
      { user_token: 'qr' } as IntegrationCodeRequestDto,
      asRequest({ ...baseReq, body: { user_token: 'qr' } }),
    );

    expect(resp.type).toBe('bonus');
    expect(resp.client).toEqual({ id_client: 'C-2' });
  });
});
