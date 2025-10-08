import { Prisma } from '@prisma/client';
import { PortalCatalogService } from './catalog.service';
import { ProductBulkAction } from './catalog.dto';

describe('PortalCatalogService', () => {
  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
    recordHttp: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates slug when creating category', async () => {
    const createMock = jest.fn(async ({ data }) => ({
      id: 'cat-1',
      merchantId: 'm-1',
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.imageUrl,
      parentId: data.parentId,
      order: data.order,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }));
    const tx: any = {
      productCategory: {
        findFirst: jest.fn(async () => ({ order: 1000 })),
        create: createMock,
      },
      product: {
        findFirst: jest.fn(async () => ({ order: 500 })),
      },
      outlet: {
        findFirst: jest.fn(async () => ({ id: 'outlet-1' })),
      },
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      productVariant: { deleteMany: jest.fn(), createMany: jest.fn() },
      productStock: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      productCategory: { findMany: jest.fn(), updateMany: jest.fn() },
      product: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
      outlet: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      productVariant: { deleteMany: jest.fn(), createMany: jest.fn() },
      productStock: { deleteMany: jest.fn(), create: jest.fn() },
    };

    const service = new PortalCatalogService(prisma, metrics);
    const result = await service.createCategory('m-1', { name: 'Супы' } as any);

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].data;
    expect(payload.slug).toBe('supy');
    expect(payload.order).toBe(1010);
    expect(result.slug).toBe('supy');
    expect(metrics.inc).toHaveBeenCalledWith(
      'portal_catalog_categories_changed_total',
      { action: 'create' },
    );
  });

  it('applies bulk product action', async () => {
    const prisma: any = {
      product: {
        updateMany: jest.fn(async () => ({ count: 2 })),
      },
    };
    const service = new PortalCatalogService(prisma, metrics);
    const response = await service.bulkProductAction('m-42', {
      action: ProductBulkAction.SHOW,
      ids: ['p1', 'p2'],
    });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] }, merchantId: 'm-42', deletedAt: null },
      data: { visible: true },
    });
    expect(response).toEqual({ ok: true, updated: 2 });
    expect(metrics.inc).toHaveBeenCalledWith(
      'portal_catalog_products_changed_total',
      { action: ProductBulkAction.SHOW },
    );
  });

  it('creates outlet with trimmed data and schedule flags', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const updatedAt = new Date('2024-01-01T01:00:00Z');
    const createMock = jest.fn(async ({ data }) => ({
      id: 'out-1',
      merchantId: 'm-99',
      name: data.name,
      address: data.address,
      status: data.status,
      hidden: data.hidden,
      description: data.description,
      phone: data.phone,
      adminEmails: data.adminEmails,
      timezone: data.timezone,
      scheduleEnabled: data.scheduleEnabled,
      scheduleMode: data.scheduleMode,
      scheduleJson: data.scheduleJson,
      externalId: data.externalId,
      manualLocation: data.manualLocation,
      latitude: data.latitude,
      longitude: data.longitude,
      createdAt,
      updatedAt,
    }));
    const prisma: any = {
      outlet: {
        create: createMock,
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const service = new PortalCatalogService(prisma, metrics);

    const result = await service.createOutlet('m-99', {
      works: true,
      hidden: false,
      name: '  Точка  ',
      description: '  описание ',
      phone: '+7 000',
      address: ' Город, улица ',
      manualLocation: true,
      latitude: 55.7558,
      longitude: 37.6173,
      adminEmails: [' manager@example.com ', 'second@example.com'],
      timezone: 'UTC+03',
      showSchedule: true,
      schedule: {
        mode: 'CUSTOM',
        days: [{ day: 'mon', enabled: true, from: '10:00', to: '22:00' }],
      },
      externalId: '  BR-1  ',
    } as any);

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].data;
    expect(payload.name).toBe('Точка');
    expect(payload.address).toBe('Город, улица');
    expect(payload.adminEmails).toEqual([
      'manager@example.com',
      'second@example.com',
    ]);
    expect(payload.scheduleEnabled).toBe(true);
    expect(payload.scheduleJson).toEqual({
      mode: 'CUSTOM',
      days: [{ day: 'mon', enabled: true, from: '10:00', to: '22:00' }],
    });
    expect(payload.latitude).toBeInstanceOf(Prisma.Decimal);
    expect(payload.latitude?.toString()).toBe('55.7558');
    expect(result.manualLocation).toBe(true);
    expect(result.showSchedule).toBe(true);
    expect(metrics.inc).toHaveBeenCalledWith('portal_outlets_changed_total', {
      action: 'create',
    });
  });
});
