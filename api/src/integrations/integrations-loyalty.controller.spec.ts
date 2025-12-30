import { BadRequestException } from '@nestjs/common';
import { IntegrationsLoyaltyController } from './integrations-loyalty.controller';

type PrismaMock = Record<string, any>;

function createPrismaMock(overrides: PrismaMock = {}) {
  return {
    customer: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    qrNonce: {
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(null),
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
  const controller = new IntegrationsLoyaltyController(loyalty, prisma);
  return { controller, prisma, loyalty };
}

describe('IntegrationsLoyaltyController', () => {
  const baseReq = {
    integrationMerchantId: 'M-1',
    headers: {},
    requestId: 'req-1',
  } as any;

  it('использует id_client при отсутствии userToken', async () => {
    const customer = {
      id: 'MC-1',
      merchantId: 'M-1',
      customerId: 'C-1',
      customer: { id: 'C-1' },
    };
    const { controller, prisma, loyalty } = createController({
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
      },
    });
    loyalty.calculateBonusPreview.mockResolvedValue({
      items: [],
      max_pay_bonus: 0,
      bonus_value: 0,
      final_payable: 0,
    });

    const dto: any = {
      id_client: customer.id,
      items: [{ id_product: 'P1', qty: 1, price: 100 }],
    };
    const resp = await controller.calculateBonusPreview(dto, {
      ...baseReq,
      body: dto,
    });

    expect(resp.status).toBe('ok');
    expect(loyalty.calculateBonusPreview).toHaveBeenCalledWith(
      expect.objectContaining({
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
    const { controller, loyalty, prisma } = createController({
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
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

    const dto: any = {
      id_client: customer.id,
      invoice_num: 'ORDER-1',
      idempotency_key: 'idem-1',
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
    const customer = {
      id: 'MC-3',
      merchantId: 'M-1',
      customerId: 'C-3',
      customer: { id: 'C-3' },
    };
    const { controller, loyalty, prisma } = createController({
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
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

    const dto: any = {
      id_client: customer.id,
      invoice_num: 'ORDER-2',
      idempotency_key: 'idem-2',
      total: 200,
      manager_id: 'STAFF-1',
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

  it('возвращает invoice_num/order_id и client в ответе BONUS', async () => {
    const customer = {
      id: 'MC-4',
      merchantId: 'M-1',
      customerId: 'C-4',
      customer: { id: 'C-4' },
    };
    const { controller, loyalty, prisma } = createController({
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
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
      invoiceNum: 'INV-42',
      redeemApplied: 0,
      earnApplied: 10,
      balanceBefore: 0,
      balanceAfter: 10,
      alreadyProcessed: false,
    });

    const dto: any = {
      id_client: customer.id,
      invoice_num: 'INV-42',
      idempotency_key: 'idem-42',
      total: 420,
      outlet_id: 'OUT-42',
      items: [{ id_product: 'SKU', qty: 1, price: 420 }],
    };
    const resp = await controller.bonus(dto, { ...baseReq, body: dto });

    expect(resp.invoice_num).toBe('INV-42');
    expect(resp.order_id).toBe('R-4');
    expect(resp.client.id_client).toBe(customer.id);
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
      customerId: 'MC-9',
    });
    loyalty.balance.mockResolvedValue({ balance: 100 });

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
    expect(resp.points_restored).toBe(30);
    expect(resp.points_revoked).toBe(10);
  });

  it('calculate action нормализует позиции и возвращает статус ok', async () => {
    const { controller, loyalty } = createController(
      {
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'C-1',
            merchantId: 'M-1',
          }),
        },
        outlet: {
          findFirst: jest.fn().mockResolvedValue({ id: 'OUT-1' }),
        },
      },
      {
        calculateAction: jest.fn().mockResolvedValue({
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

    const dto: any = {
      id_client: 'C-1',
      outlet_id: 'OUT-1',
      items: [
        {
          id_product: 'p1',
          name: 'Латте',
          quantity: 2,
          price: 100,
        },
      ],
    };

    const resp = await controller.calculateAction(dto, {
      ...baseReq,
      body: dto,
    });

    expect(resp.status).toBe('ok');
    expect(loyalty.calculateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'M-1',
        customerId: 'C-1',
        items: [
          expect.objectContaining({
            externalId: 'p1',
            qty: 2,
            price: 100,
            name: 'Латте',
          }),
        ],
      }),
    );

    const passedItems = (loyalty.calculateAction as jest.Mock).mock.calls[0][0]
      .items;
    expect(passedItems[0].categoryId).toBeUndefined();
    expect(passedItems[0].basePrice).toBeUndefined();
  });

  it('code требует JWT при включённом requireJwtForQuote', async () => {
    const { controller } = createController({
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ requireJwtForQuote: true }),
      },
    });
    jest
      .spyOn(controller as any, 'resolveFromToken')
      .mockResolvedValue({
        kind: 'short',
        customerId: 'C-1',
        merchantAud: 'M-1',
      });

    await expect(
      controller.code({ user_token: 'qr' } as any, {
        ...baseReq,
        body: { user_token: 'qr' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('code возвращает профиль клиента при валидном токене', async () => {
    const { controller } = createController({
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ requireJwtForQuote: false }),
      },
    });
    jest
      .spyOn(controller as any, 'resolveFromToken')
      .mockResolvedValue({
        kind: 'short',
        customerId: 'C-2',
        merchantAud: 'M-1',
      });
    jest
      .spyOn(controller as any, 'ensureCustomer')
      .mockResolvedValue({ id: 'C-2' });
    jest
      .spyOn(controller as any, 'buildClientPayload')
      .mockResolvedValue({ id_client: 'C-2' });
    jest
      .spyOn(controller as any, 'verifyBridgeSignatureIfRequired')
      .mockResolvedValue(undefined);

    const resp = await controller.code({ user_token: 'qr' } as any, {
      ...baseReq,
      body: { user_token: 'qr' },
    });

    expect(resp.type).toBe('bonus');
    expect(resp.client).toEqual({ id_client: 'C-2' });
  });
});
