import { BadRequestException } from '@nestjs/common';
import { IntegrationsLoyaltyController } from './integrations-loyalty.controller';

type PrismaMock = ReturnType<typeof createPrismaMock>;

function createPrismaMock(overrides: Partial<PrismaMock> = {}) {
  return {
    merchantCustomer: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    outlet: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    device: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    merchantSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    staff: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    staffOutletAccess: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    receipt: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    syncLog: {
      create: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

function createController(
  prismaOverrides: Partial<PrismaMock> = {},
  loyaltyOverrides: Record<string, any> = {},
) {
  const prisma = createPrismaMock(prismaOverrides) as any;
  const loyalty = {
    calculateBonusPreview: jest.fn(),
    processIntegrationBonus: jest.fn(),
    refund: jest.fn(),
    balance: jest.fn(),
    getBaseRatesForCustomer: jest.fn(),
    getCustomerAnalytics: jest.fn(),
    ...loyaltyOverrides,
  } as any;
  const controller = new IntegrationsLoyaltyController(
    loyalty,
    prisma,
  );
  return { controller, prisma, loyalty };
}

describe('IntegrationsLoyaltyController', () => {
  const baseReq = {
    integrationMerchantId: 'M-1',
    headers: {},
    requestId: 'req-1',
  } as any;

  it('использует merchantCustomerId при отсутствии userToken', async () => {
    const merchantCustomer = {
      id: 'MC-1',
      merchantId: 'M-1',
      customerId: 'C-1',
      customer: { id: 'C-1' },
    };
    const { controller, prisma, loyalty } = createController({
      merchantCustomer: {
        findUnique: jest.fn().mockResolvedValue(merchantCustomer),
      },
    });
    loyalty.calculateBonusPreview.mockResolvedValue({
      products: [],
      max_pay_bonus: 0,
      bonus_value: 0,
      final_payable: 0,
      balance: 0,
    });

    const dto: any = {
      merchantCustomerId: merchantCustomer.id,
      items: [{ id_product: 'P1', qty: 1, price: 100 }],
    };
    const resp = await controller.calculateBonusPreview(dto, {
      ...baseReq,
      body: dto,
    });

    expect(resp.balance).toBe(0);
    expect(loyalty.calculateBonusPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantCustomerId: merchantCustomer.id,
        customerId: merchantCustomer.customerId,
        userToken: merchantCustomer.id,
      }),
    );
    expect(prisma.merchantCustomer.findUnique).toHaveBeenCalled();
  });

  it('ошибается, если не переданы outletId/deviceId/managerId в BONUS', async () => {
    const merchantCustomer = {
      id: 'MC-2',
      merchantId: 'M-1',
      customerId: 'C-2',
      customer: { id: 'C-2' },
    };
    const { controller, loyalty, prisma } = createController({
      merchantCustomer: {
        findUnique: jest.fn().mockResolvedValue(merchantCustomer),
      },
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      receiptId: 'R-1',
      redeemApplied: 0,
      earnApplied: 0,
      balanceBefore: 0,
      balanceAfter: 0,
      alreadyProcessed: false,
    });

    const dto: any = {
      merchantCustomerId: merchantCustomer.id,
      orderId: 'ORDER-1',
      total: 100,
      items: [],
    };
    await expect(
      controller.bonus(dto, { ...baseReq, body: dto }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(loyalty.processIntegrationBonus).not.toHaveBeenCalled();
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it('прокидывает managerId и подставляет outlet из сотрудника', async () => {
    const merchantCustomer = {
      id: 'MC-3',
      merchantId: 'M-1',
      customerId: 'C-3',
      customer: { id: 'C-3' },
    };
    const { controller, loyalty, prisma } = createController(
      {
        merchantCustomer: {
          findUnique: jest.fn().mockResolvedValue(merchantCustomer),
        },
        staff: {
          findFirst: jest.fn().mockResolvedValue({
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
      },
    );
    loyalty.processIntegrationBonus.mockResolvedValue({
      receiptId: 'R-2',
      redeemApplied: 0,
      earnApplied: 5,
      balanceBefore: 10,
      balanceAfter: 15,
      alreadyProcessed: false,
    });

    const dto: any = {
      merchantCustomerId: merchantCustomer.id,
      orderId: 'ORDER-2',
      total: 200,
      managerId: 'STAFF-1',
      items: [{ id_product: 'X', qty: 1, price: 200 }],
    };
    const resp = await controller.bonus(dto, { ...baseReq, body: dto });

    expect(loyalty.processIntegrationBonus).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'STAFF-1',
        outletId: 'OUT-1',
        invoiceNum: 'ORDER-2',
      }),
    );
    expect(resp.order_id).toBe('R-2');
  });

  it('возвращает invoice_num/order_id и outlet_name в ответе BONUS', async () => {
    const merchantCustomer = {
      id: 'MC-4',
      merchantId: 'M-1',
      customerId: 'C-4',
      customer: { id: 'C-4' },
    };
    const { controller, loyalty, prisma } = createController({
      merchantCustomer: {
        findUnique: jest.fn().mockResolvedValue(merchantCustomer),
      },
      receipt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'R-4',
          outletId: 'OUT-42',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      outlet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'OUT-42',
          name: 'Outlet 42',
        }),
      },
    });
    loyalty.processIntegrationBonus.mockResolvedValue({
      orderId: 'R-4',
      receiptId: 'R-4',
      redeemApplied: 0,
      earnApplied: 10,
      balanceBefore: 0,
      balanceAfter: 10,
      alreadyProcessed: false,
    });

    const dto: any = {
      merchantCustomerId: merchantCustomer.id,
      orderId: 'INV-42',
      total: 420,
      outletId: 'OUT-42',
      items: [{ id_product: 'SKU', qty: 1, price: 420 }],
    };
    const resp = await controller.bonus(dto, { ...baseReq, body: dto });

    expect(resp.invoice_num).toBe('INV-42');
    expect(resp.order_id).toBe('R-4');
    expect(resp.outlet_name).toBe('Outlet 42');
    expect(resp.outletId).toBe('OUT-42');
  });

  it('возвращает invoice_num/order_id в ответе REFUND', async () => {
    const { controller, loyalty, prisma } = createController({
      receipt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'RID-1',
          orderId: 'INV-1',
          outletId: null,
          customerId: 'C-9',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    loyalty.refund.mockResolvedValue({
      pointsRestored: 30,
      pointsRevoked: 10,
      merchantCustomerId: 'MC-9',
    });

    const dto: any = { invoice_num: 'INV-1' };
    const resp = await controller.refund(dto, { ...baseReq, body: dto });

    expect(loyalty.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNum: 'INV-1',
        orderId: 'RID-1',
      }),
    );
    expect(resp.invoice_num).toBe('INV-1');
    expect(resp.order_id).toBe('RID-1');
    expect(resp.pointsRestored).toBe(30);
    expect(resp.pointsRevoked).toBe(10);
  });
});
