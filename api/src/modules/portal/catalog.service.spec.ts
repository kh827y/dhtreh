import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { PortalCatalogService } from './catalog.service';
import { ProductBulkAction } from './catalog.dto';
import type {
  CreateCategoryDto,
  CreatePortalOutletDto,
  CreateProductDto,
} from './catalog.dto';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type PrismaStub = {
  product?: MockModel;
  productExternalId?: MockModel;
  [key: string]: MockModel | MockFn | undefined;
};
type MetricsStub = Pick<
  MetricsService,
  'inc' | 'observe' | 'setGauge' | 'recordHttp'
>;
type CategoryCreateData = {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  order?: number | null;
  status?: string | null;
};
type CategoryCreateArgs = { data: CategoryCreateData };
type ProductFindFirstArgs = {
  select?: { id?: boolean; order?: boolean };
};
type OutletCreateData = {
  name: string;
  status: string;
  reviewLinks: unknown;
};
type OutletCreateArgs = { data: OutletCreateData };
type OutletRecord = OutletCreateData & {
  id: string;
  merchantId: string;
  createdAt: Date;
  updatedAt: Date;
  devices?: unknown[];
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const mockFnWithImpl = <Return, Args extends unknown[]>(
  impl: (...args: Args) => Return,
) => mockFn<Return, Args>().mockImplementation(impl);
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const buildService = (prisma: PrismaStub, metrics: MetricsStub) =>
  new PortalCatalogService(asPrismaService(prisma), asMetricsService(metrics));

describe('PortalCatalogService', () => {
  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
    recordHttp: mockFn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates slug when creating category', async () => {
    const createMock = mockFnWithImpl(({ data }: CategoryCreateArgs) => ({
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
    const tx: PrismaStub = {
      productCategory: {
        findFirst: mockFnWithImpl(() => ({ order: 1000 })),
        create: createMock,
      },
      product: {
        findFirst: mockFnWithImpl(() => ({ order: 500 })),
      },
      outlet: {
        findFirst: mockFnWithImpl(() => ({ id: 'outlet-1' })),
      },
      productImage: { deleteMany: mockFn(), createMany: mockFn() },
      productVariant: { deleteMany: mockFn(), createMany: mockFn() },
      productStock: { deleteMany: mockFn(), create: mockFn() },
    };
    const prisma: PrismaStub = {
      $transaction: mockFnWithImpl((fn: (tx: PrismaStub) => unknown) => fn(tx)),
      productCategory: { findMany: mockFn(), updateMany: mockFn() },
      product: { findMany: mockFn(), count: mockFn(), updateMany: mockFn() },
      outlet: {
        findMany: mockFn(),
        count: mockFn(),
        create: mockFn(),
        update: mockFn(),
        findFirst: mockFn(),
      },
      productImage: { deleteMany: mockFn(), createMany: mockFn() },
      productVariant: { deleteMany: mockFn(), createMany: mockFn() },
      productStock: { deleteMany: mockFn(), create: mockFn() },
    };

    const service = buildService(prisma, metrics);
    const dto: CreateCategoryDto = { name: 'Супы' };
    const result = await service.createCategory('m-1', dto);

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
    const prisma: PrismaStub = {
      product: {
        updateMany: mockFnWithImpl(() => ({ count: 2 })),
      },
    };
    const service = buildService(prisma, metrics);
    const response = await service.bulkProductAction('m-42', {
      action: ProductBulkAction.ALLOW_REDEEM,
      ids: ['p1', 'p2'],
    });

    expect(prisma.product!.updateMany).toHaveBeenCalledWith({
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
    const productFindFirst = mockFnWithImpl((args?: ProductFindFirstArgs) => {
      if (args?.select?.id) return null;
      if (args?.select?.order) return { order: 1000 };
      return createdProduct;
    });
    const tx: PrismaStub = {
      product: {
        findMany: mockFnWithImpl(() => archivedIds),
        updateMany: mockFnWithImpl(() => ({ count: archivedIds.length })),
        findFirst: productFindFirst,
        create: mockFnWithImpl(() => createdProduct),
      },
      productExternalId: { deleteMany: mockFnWithImpl(() => ({ count: 2 })) },
    };
    const prisma: PrismaStub = {
      $transaction: mockFnWithImpl((fn: (tx: PrismaStub) => unknown) => fn(tx)),
    };
    const service = buildService(prisma, metrics);

    const dto: CreateProductDto = {
      name: 'Латте',
      externalId: 'latte-01',
    };
    await service.createProduct('m-1', dto);

    expect(tx.product!.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
      data: { externalId: null, externalProvider: null },
    });
    expect(tx.productExternalId!.deleteMany).toHaveBeenCalledWith({
      where: { merchantId: 'm-1', productId: { in: ['old-1', 'old-2'] } },
    });
  });

  it('nulls externalId and removes external mappings on delete', async () => {
    const prisma: PrismaStub = {
      product: {
        updateMany: mockFnWithImpl(() => ({ count: 1 })),
      },
      productExternalId: {
        deleteMany: mockFnWithImpl(() => ({ count: 1 })),
      },
    };
    const service = buildService(prisma, metrics);

    await service.deleteProduct('m-1', 'prod-1');

    expect(prisma.product!.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', merchantId: 'm-1', deletedAt: null },
      data: {
        deletedAt: expect.any(Date) as unknown as Date,
        externalId: null,
        externalProvider: null,
      },
    });
    expect(prisma.productExternalId!.deleteMany).toHaveBeenCalledWith({
      where: { merchantId: 'm-1', productId: 'prod-1' },
    });
  });

  it('creates outlet with trimmed data', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const updatedAt = new Date('2024-01-01T01:00:00Z');
    let createdOutlet: OutletRecord | null = null;
    const createMock = mockFnWithImpl(({ data }: OutletCreateArgs) => {
      createdOutlet = {
        id: 'out-1',
        merchantId: 'm-99',
        name: data.name,
        status: data.status,
        reviewLinks: data.reviewLinks,
        createdAt,
        updatedAt,
      };
      return createdOutlet;
    });
    const tx: PrismaStub = {
      outlet: {
        create: createMock,
        findUnique: mockFnWithImpl(() =>
          createdOutlet ? { ...createdOutlet, devices: [] } : null,
        ),
      },
      device: {
        updateMany: mockFn(),
        findMany: mockFn().mockResolvedValue([]),
        update: mockFn(),
        create: mockFn(),
      },
    };
    const prisma: PrismaStub = {
      $transaction: mockFnWithImpl((fn: (tx: PrismaStub) => unknown) => fn(tx)),
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ maxOutlets: null }),
      },
      outlet: {
        create: createMock,
        findMany: mockFn(),
        count: mockFn(),
      },
    };
    const service = buildService(prisma, metrics);

    const dto: CreatePortalOutletDto = {
      works: true,
      name: '  Точка  ',
      devices: [{ code: ' POS-1 ' }],
    };
    await service.createOutlet('m-99', dto);

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].data;
    expect(payload.name).toBe('Точка');
    expect(payload.status).toBe('ACTIVE');
    expect(metrics.inc).toHaveBeenCalledWith('portal_outlets_changed_total', {
      action: 'create',
    });
  });

  it('blocks outlet creation when limit reached', async () => {
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ maxOutlets: 1 }),
      },
      outlet: {
        count: mockFn().mockResolvedValue(1),
      },
      $transaction: mockFn(),
    };
    const service = buildService(prisma, metrics);
    const dto: CreatePortalOutletDto = { works: true, name: 'Outlet' };
    await expect(service.createOutlet('m-1', dto)).rejects.toThrow(
      'Вы достигли лимита торговых точек.',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
