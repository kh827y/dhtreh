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
      status: data.status,
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
    expect(payload.status).toBe('ACTIVE');
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
      action: ProductBulkAction.ALLOW_REDEEM,
      ids: ['p1', 'p2'],
    });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] }, merchantId: 'm-42', deletedAt: null },
      data: { allowRedeem: true },
    });
    expect(response).toEqual({ ok: true, updated: 2 });
    expect(metrics.inc).toHaveBeenCalledWith(
      'portal_catalog_products_changed_total',
      { action: ProductBulkAction.ALLOW_REDEEM },
    );
  });

  it('clears externalId for archived products before create', async () => {
    const archivedIds = [{ id: 'old-1' }, { id: 'old-2' }];
    const createdProduct = {
      id: 'prod-1',
      merchantId: 'm-1',
      name: 'Латте',
      categoryId: null,
      category: null,
      description: null,
      iikoProductId: null,
      hasVariants: false,
      priceEnabled: true,
      price: 0,
      allowCart: true,
      accruePoints: true,
      allowRedeem: true,
      redeemPercent: 100,
      weightValue: null,
      weightUnit: null,
      heightCm: null,
      widthCm: null,
      depthCm: null,
      proteins: null,
      fats: null,
      carbs: null,
      calories: null,
      tags: [],
      purchasesMonth: 0,
      purchasesTotal: 0,
      order: 1010,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      images: [],
      variants: [],
      stocks: [],
      externalMappings: [],
    };
    const productFindFirst = jest.fn(async (args) => {
      if (args?.select?.id) return null;
      if (args?.select?.order) return { order: 1000 };
      return createdProduct;
    });
    const tx: any = {
      product: {
        findMany: jest.fn(async () => archivedIds),
        updateMany: jest.fn(async () => ({ count: archivedIds.length })),
        findFirst: productFindFirst,
        create: jest.fn(async () => createdProduct),
      },
      productExternalId: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new PortalCatalogService(prisma, metrics);

    await service.createProduct('m-1', {
      name: 'Латте',
      externalId: 'latte-01',
    } as any);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
      data: { externalId: null, externalProvider: null },
    });
    expect(tx.productExternalId.deleteMany).toHaveBeenCalledWith({
      where: { merchantId: 'm-1', productId: { in: ['old-1', 'old-2'] } },
    });
  });

  it('nulls externalId and removes external mappings on delete', async () => {
    const prisma: any = {
      product: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      productExternalId: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new PortalCatalogService(prisma, metrics);

    await service.deleteProduct('m-1', 'prod-1');

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', merchantId: 'm-1', deletedAt: null },
      data: {
        deletedAt: expect.any(Date),
        externalId: null,
        externalProvider: null,
      },
    });
    expect(prisma.productExternalId.deleteMany).toHaveBeenCalledWith({
      where: { merchantId: 'm-1', productId: 'prod-1' },
    });
  });

  it('creates outlet with trimmed data and schedule flags', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const updatedAt = new Date('2024-01-01T01:00:00Z');
    let createdOutlet: any = null;
    const createMock = jest.fn(async ({ data }) => {
      createdOutlet = {
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
      };
      return createdOutlet;
    });
    const tx: any = {
      outlet: {
        create: createMock,
        findUnique: jest.fn(async () => ({
          ...createdOutlet,
          devices: [],
        })),
      },
      device: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ maxOutlets: null }),
      },
      outlet: {
        create: createMock,
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const service = new PortalCatalogService(prisma, metrics);

    const result = await service.createOutlet('m-99', {
      works: true,
      name: '  Точка  ',
      devices: [{ code: ' POS-1 ' }],
    } as any);

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].data;
    expect(payload.name).toBe('Точка');
    expect(payload.status).toBe('ACTIVE');
    expect(metrics.inc).toHaveBeenCalledWith('portal_outlets_changed_total', {
      action: 'create',
    });
  });

  it('blocks outlet creation when limit reached', async () => {
    const prisma: any = {
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ maxOutlets: 1 }),
      },
      outlet: {
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(),
    };
    const service = new PortalCatalogService(prisma, metrics);
    await expect(
      service.createOutlet('m-1', { name: 'Outlet' } as any),
    ).rejects.toThrow('Вы достигли лимита торговых точек.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
