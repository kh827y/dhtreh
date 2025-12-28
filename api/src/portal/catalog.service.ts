import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Product,
  ProductCategory,
  ProductImage,
  ProductStock,
  ProductVariant,
  Outlet,
  ProductExternalId,
  StaffOutletAccessStatus,
} from '@prisma/client';
import { MetricsService } from '../metrics.service';
import { PrismaService } from '../prisma.service';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
  CreateProductDto,
  UpdateProductDto,
  ProductDto,
  ProductListResponseDto,
  ProductListItemDto,
  ListProductsQueryDto,
  ProductBulkActionDto,
  ProductBulkAction,
  CreatePortalOutletDto,
  UpdatePortalOutletDto,
  PortalOutletDto,
  PortalOutletListResponseDto,
  ProductImageInputDto,
  ProductVariantInputDto,
  ProductStockInputDto,
  OutletScheduleDto,
  ImportCatalogDto,
  ImportProductDto,
} from './catalog.dto';
import {
  normalizeDeviceCode,
  ensureUniqueDeviceCodes,
  type NormalizedDeviceCode,
} from '../devices/device.util';

const BULK_ACTION_MAP: Record<
  ProductBulkAction,
  Prisma.ProductUpdateManyMutationInput
> = {
  [ProductBulkAction.SHOW]: { visible: true },
  [ProductBulkAction.HIDE]: { visible: false },
  [ProductBulkAction.ALLOW_REDEEM]: { allowRedeem: true },
  [ProductBulkAction.FORBID_REDEEM]: { allowRedeem: false },
  [ProductBulkAction.DELETE]: { deletedAt: new Date() },
};

@Injectable()
export class PortalCatalogService {
  private readonly logger = new Logger(PortalCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  // ===== Helpers =====
  private slugify(input: string): string {
    const map: Record<string, string> = {
      ё: 'e',
      й: 'i',
      ц: 'c',
      у: 'u',
      к: 'k',
      е: 'e',
      н: 'n',
      г: 'g',
      ш: 'sh',
      щ: 'sch',
      з: 'z',
      х: 'h',
      ъ: '',
      ф: 'f',
      ы: 'y',
      в: 'v',
      а: 'a',
      п: 'p',
      р: 'r',
      о: 'o',
      л: 'l',
      д: 'd',
      ж: 'zh',
      э: 'e',
      я: 'ya',
      ч: 'ch',
      с: 's',
      м: 'm',
      и: 'i',
      т: 't',
      ь: '',
      б: 'b',
      ю: 'yu',
    };
    const base = (input || '').toString().trim().toLowerCase();
    const translit = base
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9\-\s]/g, '')
      .replace(/\s+/g, '-');
    const slug = translit.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug || 'item';
  }

  private clampPercent(value: number | undefined, fallback = 100): number {
    const numeric = Number.isFinite(value) ? Number(value) : fallback;
    if (Number.isNaN(numeric)) return fallback;
    return Math.min(100, Math.max(0, Math.round(numeric)));
  }

  private toDecimal(value: number | null | undefined): Prisma.Decimal | null {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value)) return null;
    return new Prisma.Decimal(value);
  }

  private decimalToNumber(
    value: Prisma.Decimal | null | undefined,
  ): number | null {
    if (value === undefined || value === null) return null;
    return Number(value);
  }

  private mapCategory(entity: ProductCategory): CategoryDto {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      description: entity.description ?? null,
      imageUrl: entity.imageUrl ?? null,
      parentId: entity.parentId ?? null,
      order: entity.order,
      status: entity.status,
    };
  }

  private mapProductPreview(
    product: Product & {
      category?: ProductCategory | null;
      images: ProductImage[];
      externalMappings?: ProductExternalId[];
    },
  ): ProductListItemDto {
    const externalMappings = (product as any).externalMappings as
      | ProductExternalId[]
      | undefined;
    const primaryExt = externalMappings?.[0];
    const externalId = product.externalId ?? primaryExt?.externalId ?? null;
    return {
      id: product.id,
      name: product.name,
      categoryId: product.categoryId ?? null,
      categoryName: product.category?.name ?? null,
      previewImage: product.images[0]?.url ?? null,
      visible: product.visible,
      accruePoints: product.accruePoints,
      allowRedeem: product.allowRedeem,
      redeemPercent: product.redeemPercent,
      purchasesMonth: product.purchasesMonth,
      purchasesTotal: product.purchasesTotal,
      externalId,
    };
  }

  private mapProductDetailed(
    product: Product & {
      category?: ProductCategory | null;
      images: ProductImage[];
      variants: ProductVariant[];
      stocks: (ProductStock & { outlet?: Outlet | null })[];
      externalMappings?: ProductExternalId[];
    },
  ): ProductDto {
    const images = product.images
      .sort((a, b) => a.position - b.position)
      .map<ProductImageInputDto>((img, index) => ({
        url: img.url,
        alt: img.alt ?? undefined,
        position: img.position ?? index,
      }));
    const variants = product.variants
      .sort((a, b) => a.position - b.position)
      .map<ProductVariantInputDto>((variant, index) => ({
        name: variant.name,
        sku: variant.sku ?? undefined,
        price: this.decimalToNumber(variant.price) ?? undefined,
        notes: variant.notes ?? undefined,
        position: variant.position ?? index,
      }));
    const stocks = product.stocks
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map<ProductStockInputDto>((stock) => ({
        label: stock.label,
        outletId: stock.outletId ?? undefined,
        price: this.decimalToNumber(stock.price) ?? undefined,
        balance: this.decimalToNumber(stock.balance) ?? undefined,
        currency: stock.currency ?? undefined,
      }));
    return {
      ...this.mapProductPreview(product),
      order: product.order,
      description: product.description ?? null,
      iikoProductId: product.iikoProductId ?? null,
      hasVariants: product.hasVariants,
      priceEnabled: product.priceEnabled,
      price: product.priceEnabled ? this.decimalToNumber(product.price) : null,
      disableCart: !product.allowCart,
      weightValue: this.decimalToNumber(product.weightValue),
      weightUnit: product.weightUnit ?? null,
      heightCm: this.decimalToNumber(product.heightCm),
      widthCm: this.decimalToNumber(product.widthCm),
      depthCm: this.decimalToNumber(product.depthCm),
      proteins: this.decimalToNumber(product.proteins),
      fats: this.decimalToNumber(product.fats),
      carbs: this.decimalToNumber(product.carbs),
      calories: this.decimalToNumber(product.calories),
      tags: product.tags ?? [],
      images,
      variants,
      stocks,
    };
  }

  private parseSchedule(entity: Outlet): OutletScheduleDto {
    const json = (entity.scheduleJson as any) || {};
    const days = Array.isArray(json.days)
      ? json.days.map((day: any) => ({
          day: String(day?.day || ''),
          enabled: Boolean(day?.enabled),
          from: day?.from ?? undefined,
          to: day?.to ?? undefined,
        }))
      : [];
    return {
      mode:
        (json.mode as '24_7' | 'CUSTOM') ||
        (entity.scheduleMode as '24_7' | 'CUSTOM') ||
        'CUSTOM',
      days,
    };
  }

  private isValidHttpUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 2048) return false;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      // базовая защита: без javascript:, data:, file:
      return true;
    } catch {
      return false;
    }
  }

  // Подготовка патча ссылок: сохраняем строки (валидные URL) и null, приводим ключи к lower-case
  private prepareReviewLinksPatch(
    input?: unknown,
  ): Record<string, string | null> | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const patch: Record<string, string | null> = {};
    const invalid: string[] = [];
    for (const [rawKey, rawValue] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const key = String(rawKey || '')
        .toLowerCase()
        .trim();
      if (!key) continue;
      if (rawValue == null) {
        patch[key] = null;
        continue;
      }
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (!trimmed) {
          patch[key] = null;
          continue;
        }
        if (!this.isValidHttpUrl(trimmed)) {
          invalid.push(key);
          continue;
        }
        patch[key] = trimmed;
        continue;
      }
      invalid.push(key);
    }
    if (invalid.length) {
      const label = invalid
        .map((key) => this.mapReviewPlatformLabel(key))
        .join(', ');
      throw new BadRequestException(
        `Некорректная ссылка для отзывов: ${label}`,
      );
    }
    return patch;
  }

  private mapReviewPlatformLabel(key: string) {
    const normalized = String(key || '').toLowerCase();
    if (normalized === 'yandex') return 'Яндекс';
    if (normalized === 'twogis' || normalized === '2gis' || normalized === 'gis')
      return '2ГИС';
    if (normalized === 'google') return 'Google';
    return normalized || 'ссылка';
  }

  private extractReviewLinks(payload: Prisma.JsonValue | null | undefined) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return {} as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [platform, value] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      if (!platform) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) result[platform] = trimmed;
      }
    }
    return result;
  }

  // Применение патча: строки = upsert, null = удалить ключ
  private applyReviewLinksPatch(
    existing: Prisma.JsonValue | null | undefined,
    patch: Record<string, string | null>,
  ) {
    const base = this.extractReviewLinks(existing);
    for (const [key, val] of Object.entries(patch)) {
      if (val == null) {
        delete base[key];
      } else {
        base[key] = val;
      }
    }
    return base;
  }

  private mapOutlet(
    entity: Outlet & { devices?: Array<any>; staffCount?: number },
  ): PortalOutletDto {
    return {
      id: entity.id,
      name: entity.name,
      address: entity.address ?? null,
      works: entity.status !== 'INACTIVE',
      hidden: entity.hidden,
      status: entity.status,
      staffCount:
        typeof entity.staffCount === 'number' ? entity.staffCount : undefined,
      posType: entity.posType ?? null,
      posLastSeenAt: entity.posLastSeenAt ?? null,
      bridgeSecretIssued: !!entity.bridgeSecret,
      bridgeSecretNextIssued: !!entity.bridgeSecretNext,
      bridgeSecretUpdatedAt: entity.bridgeSecretUpdatedAt ?? null,
      description: entity.description ?? null,
      phone: entity.phone ?? null,
      adminEmails: entity.adminEmails ?? [],
      timezone: entity.timezone ?? null,
      showSchedule: entity.scheduleEnabled,
      schedule: this.parseSchedule(entity),
      latitude: this.decimalToNumber(entity.latitude),
      longitude: this.decimalToNumber(entity.longitude),
      manualLocation: entity.manualLocation,
      externalId: entity.externalId ?? null,
      devices: this.mapDevices((entity as any).devices),
      reviewsShareLinks: (() => {
        const links = this.extractReviewLinks(entity.reviewLinks as any);
        if (!Object.keys(links).length) return null;
        return {
          yandex: links['yandex'] ?? null,
          twogis: links['twogis'] ?? null,
          google: links['google'] ?? null,
        };
      })(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private mapDevices(
    devices?: Array<{
      id: string;
      code: string;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const list = Array.isArray(devices) ? devices : [];
    return list
      .filter((device) => !device.archivedAt)
      .map((device) => ({
        id: device.id,
        code: device.code,
        archivedAt: device.archivedAt ?? null,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      }));
  }

  private async loadOutletWithDevices(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: outletId, merchantId },
      include: {
        devices: {
          where: { archivedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }

  private normalizeDevicesInput(
    devices?: Array<{ code?: string | null }>,
  ): NormalizedDeviceCode[] {
    if (!devices) return [];
    const normalized = devices
      .map((device) => {
        if (!device) return null;
        return normalizeDeviceCode(String(device.code ?? ''));
      })
      .filter((value): value is NormalizedDeviceCode => value !== null);
    ensureUniqueDeviceCodes(normalized);
    return normalized;
  }

  private async syncDevicesForOutlet(
    tx: Prisma.TransactionClient,
    merchantId: string,
    outletId: string,
    devices: NormalizedDeviceCode[],
  ) {
    ensureUniqueDeviceCodes(devices);
    const codes = devices.map((device) => device.normalized);
    if (!devices.length) {
      await tx.device.updateMany({
        where: { merchantId, outletId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      return;
    }
    const existing = await tx.device.findMany({
      where: { merchantId, codeNormalized: { in: codes } },
    });
    const conflict = existing.find(
      (device) => device.outletId !== outletId && !device.archivedAt,
    );
    if (conflict) {
      throw new BadRequestException(
        'Идентификатор устройства уже привязан к другой торговой точке',
      );
    }
    const now = new Date();
    for (const device of devices) {
      const matched = existing.find(
        (d) => d.codeNormalized === device.normalized,
      );
      if (matched) {
        await tx.device.update({
          where: { id: matched.id },
          data: {
            outletId,
            code: device.code,
            codeNormalized: device.normalized,
            archivedAt: null,
            updatedAt: now,
          },
        });
      } else {
        await tx.device.create({
          data: {
            merchantId,
            outletId,
            code: device.code,
            codeNormalized: device.normalized,
          },
        });
      }
    }
    await tx.device.updateMany({
      where: {
        merchantId,
        outletId,
        archivedAt: null,
        codeNormalized: { notIn: codes },
      },
      data: { archivedAt: now },
    });
  }

  private async ensureCategoryOwnership(
    tx: Prisma.TransactionClient,
    merchantId: string,
    categoryId: string,
  ) {
    const category = await tx.productCategory.findFirst({
      where: { id: categoryId, merchantId, deletedAt: null },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async ensureOutletOwnership(
    tx: Prisma.TransactionClient,
    merchantId: string,
    outletId: string,
  ) {
    const outlet = await tx.outlet.findFirst({
      where: { id: outletId, merchantId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }

  private async nextCategoryOrder(
    tx: Prisma.TransactionClient,
    merchantId: string,
  ) {
    const last = await tx.productCategory.findFirst({
      where: { merchantId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? 1000) + 10;
  }

  private async nextProductOrder(
    tx: Prisma.TransactionClient,
    merchantId: string,
  ) {
    const last = await tx.product.findFirst({
      where: { merchantId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? 1000) + 10;
  }

  private async syncProductExternal(
    tx: Prisma.TransactionClient,
    merchantId: string,
    productId: string,
    payload: {
      externalProvider?: string | null;
      externalId?: string | null;
      barcode?: string | null;
      sku?: string | null;
    },
  ) {
    const externalProvider = payload.externalProvider?.trim();
    const externalId = payload.externalId?.trim();
    if (!externalProvider || !externalId) return;
    await tx.productExternalId.upsert({
      where: {
        merchantId_externalProvider_externalId: {
          merchantId,
          externalProvider,
          externalId,
        },
      },
      update: {
        productId,
        barcode: payload.barcode ?? null,
        sku: payload.sku ?? null,
      },
      create: {
        merchantId,
        productId,
        externalProvider,
        externalId,
        barcode: payload.barcode ?? null,
        sku: payload.sku ?? null,
      },
    });
  }

  private async writeSyncLog(params: {
    merchantId: string;
    provider: string;
    endpoint: string;
    status: 'ok' | 'error';
    request?: any;
    response?: any;
    error?: any;
  }) {
    try {
      await this.prisma.syncLog.create({
        data: {
          merchantId: params.merchantId,
          provider: params.provider,
          direction: 'IN',
          endpoint: params.endpoint,
          status: params.status,
          request: params.request ?? null,
          response: params.response ?? null,
          error: params.error ? String(params.error) : null,
        },
      });
    } catch {}
  }

  // ===== Categories =====
  async listCategories(merchantId: string): Promise<CategoryDto[]> {
    const categories = await this.prisma.productCategory.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map((category) => this.mapCategory(category));
  }

  async createCategory(
    merchantId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');
    const slug = dto.slug ? dto.slug.toLowerCase() : this.slugify(name);
    return this.prisma.$transaction(async (tx) => {
      if (dto.parentId)
        await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
      const order = await this.nextCategoryOrder(tx, merchantId);
      try {
        const created = await tx.productCategory.create({
          data: {
            merchantId,
            name,
            slug,
            description: dto.description ?? null,
            imageUrl: dto.imageUrl ?? null,
            parentId: dto.parentId ?? null,
            order,
            status: dto.status ?? 'ACTIVE',
          },
        });
        this.logger.log(
          JSON.stringify({
            event: 'portal.catalog.category.create',
            merchantId,
            categoryId: created.id,
          }),
        );
        this.metrics.inc('portal_catalog_categories_changed_total', {
          action: 'create',
        });
        return this.mapCategory(created);
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new BadRequestException('Slug already exists');
        }
        throw error;
      }
    });
  }

  async updateCategory(
    merchantId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.prisma.$transaction(async (tx) => {
      const category = await this.ensureCategoryOwnership(
        tx,
        merchantId,
        categoryId,
      );
      const data: Prisma.ProductCategoryUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name)
          throw new BadRequestException('Category name cannot be empty');
        data.name = name;
      }
      if (dto.slug !== undefined) {
        const slug = dto.slug.trim().toLowerCase();
        if (!/^[a-z0-9\-]+$/.test(slug))
          throw new BadRequestException(
            'Slug should contain latin letters, numbers or dash',
          );
        data.slug = slug;
      }
      if (dto.description !== undefined)
        data.description = dto.description ?? null;
      if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl ?? null;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.parentId !== undefined) {
        if (dto.parentId) {
          if (dto.parentId === categoryId)
            throw new BadRequestException('Category cannot reference itself');
          await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
          data.parent = { connect: { id: dto.parentId } };
        } else {
          data.parent = { disconnect: true };
        }
      }
      if (Object.keys(data).length === 0) return this.mapCategory(category);
      try {
        const updated = await tx.productCategory.update({
          where: { id: categoryId },
          data,
        });
        this.logger.log(
          JSON.stringify({
            event: 'portal.catalog.category.update',
            merchantId,
            categoryId,
          }),
        );
        this.metrics.inc('portal_catalog_categories_changed_total', {
          action: 'update',
        });
        return this.mapCategory(updated);
      } catch (error: any) {
        if (error?.code === 'P2002')
          throw new BadRequestException('Slug already exists');
        throw error;
      }
    });
  }

  async reorderCategories(merchantId: string, dto: ReorderCategoriesDto) {
    if (!dto.items?.length) return { ok: true, updated: 0 };
    const ids = dto.items.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      const categories = await tx.productCategory.findMany({
        where: { id: { in: ids }, merchantId, deletedAt: null },
      });
      if (categories.length !== ids.length)
        throw new NotFoundException('One of categories not found');
      await Promise.all(
        dto.items.map((item) =>
          tx.productCategory.update({
            where: { id: item.id },
            data: { order: item.order },
          }),
        ),
      );
    });
    this.logger.log(
      JSON.stringify({
        event: 'portal.catalog.category.reorder',
        merchantId,
        count: dto.items.length,
      }),
    );
    this.metrics.inc('portal_catalog_categories_changed_total', {
      action: 'reorder',
    });
    return { ok: true, updated: dto.items.length };
  }

  async deleteCategory(merchantId: string, categoryId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ensureCategoryOwnership(tx, merchantId, categoryId);
      await tx.productCategory.update({
        where: { id: categoryId },
        data: { deletedAt: new Date() },
      });
      await tx.product.updateMany({
        where: { merchantId, categoryId },
        data: { categoryId: null },
      });
    });
    this.logger.log(
      JSON.stringify({
        event: 'portal.catalog.category.delete',
        merchantId,
        categoryId,
      }),
    );
    this.metrics.inc('portal_catalog_categories_changed_total', {
      action: 'delete',
    });
    return { ok: true };
  }

  // ===== Products =====
  async listProducts(
    merchantId: string,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    const where: Prisma.ProductWhereInput = { merchantId, deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status === 'visible') where.visible = true;
    if (query.status === 'hidden') where.visible = false;
    if (query.points === 'with_points') where.accruePoints = true;
    if (query.points === 'without_points') where.accruePoints = false;
    const andFilters: Prisma.ProductWhereInput[] = [];
    if (query.externalId) {
      const extId = query.externalId.trim();
      if (extId) {
        andFilters.push({
          OR: [
            { externalId: { contains: extId, mode: 'insensitive' } },
            {
              externalMappings: {
                some: {
                  externalId: { contains: extId, mode: 'insensitive' },
                },
              },
            },
          ],
        });
      }
    }
    if (query.search) {
      const term = query.search.trim();
      if (term) {
        const and: Prisma.ProductWhereInput[] = [];
        if (where.AND)
          and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
        and.push({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { externalId: { contains: term, mode: 'insensitive' } },
            {
              externalMappings: {
                some: { externalId: { contains: term, mode: 'insensitive' } },
              },
            },
          ],
        });
        where.AND = and;
      }
    }
    if (andFilters.length) {
      if (where.AND) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : [where.AND]),
          ...andFilters,
        ];
      } else {
        where.AND = andFilters;
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          category: true,
          images: { orderBy: { position: 'asc' } },
          externalMappings: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: items.map((product) => this.mapProductPreview(product)),
      total,
    };
  }

  async getProduct(merchantId: string, productId: string): Promise<ProductDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, merchantId, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: { orderBy: { position: 'asc' } },
        stocks: { include: { outlet: true } },
        externalMappings: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.mapProductDetailed(product);
  }

  private prepareProductCreateData(
    merchantId: string,
    dto: CreateProductDto,
    opts: { categoryId?: string | null },
  ): Prisma.ProductCreateInput {
    const hasVariants =
      dto.hasVariants ?? (dto.variants?.length ? true : false);
    const priceEnabled =
      dto.priceEnabled !== undefined ? dto.priceEnabled : true;
    const allowCart = dto.disableCart ? false : true;
    return {
      merchant: { connect: { id: merchantId } },
      name: dto.name.trim(),
      sku: dto.sku ? dto.sku.trim() : null,
      code: dto.code ? dto.code.trim() : null,
      barcode: dto.barcode ? dto.barcode.trim() : null,
      unit: dto.unit ? dto.unit.trim() : null,
      externalProvider: dto.externalProvider
        ? dto.externalProvider.trim()
        : null,
      externalId: dto.externalId ? dto.externalId.trim() : null,
      description: dto.description ?? null,
      order: dto.order ?? 0,
      iikoProductId: dto.iikoProductId ?? null,
      hasVariants,
      priceEnabled,
      price: priceEnabled ? this.toDecimal(dto.price ?? 0) : null,
      allowCart,
      visible: dto.visible ?? true,
      accruePoints: dto.accruePoints ?? true,
      allowRedeem: dto.allowRedeem ?? true,
      redeemPercent: this.clampPercent(dto.redeemPercent, 100),
      weightValue: this.toDecimal(dto.weightValue),
      weightUnit: dto.weightUnit ?? null,
      heightCm: this.toDecimal(dto.heightCm),
      widthCm: this.toDecimal(dto.widthCm),
      depthCm: this.toDecimal(dto.depthCm),
      proteins: this.toDecimal(dto.proteins),
      fats: this.toDecimal(dto.fats),
      carbs: this.toDecimal(dto.carbs),
      calories: this.toDecimal(dto.calories),
      tags: dto.tags ?? [],
      category: opts.categoryId
        ? { connect: { id: opts.categoryId } }
        : undefined,
      images: dto.images?.length
        ? {
            create: dto.images.map((img, index) => ({
              url: img.url,
              alt: img.alt ?? null,
              position: img.position ?? index,
            })),
          }
        : undefined,
      variants:
        hasVariants && dto.variants?.length
          ? {
              create: dto.variants.map((variant, index) => ({
                name: variant.name,
                sku: variant.sku ?? null,
                price: this.toDecimal(variant.price),
                notes: variant.notes ?? null,
                position: variant.position ?? index,
              })),
            }
          : undefined,
      stocks: dto.stocks?.length
        ? {
            create: dto.stocks.map((stock) => ({
              label: stock.label,
              outlet: stock.outletId
                ? { connect: { id: stock.outletId } }
                : undefined,
              price: this.toDecimal(stock.price),
              balance: this.toDecimal(stock.balance),
              currency: stock.currency ?? 'RUB',
            })),
          }
        : undefined,
    };
  }

  async createProduct(
    merchantId: string,
    dto: CreateProductDto,
  ): Promise<ProductDto> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Product name is required');
    return this.prisma.$transaction(async (tx) => {
      if (dto.categoryId)
        await this.ensureCategoryOwnership(tx, merchantId, dto.categoryId);
      if (dto.stocks) {
        for (const stock of dto.stocks) {
          if (stock.outletId)
            await this.ensureOutletOwnership(tx, merchantId, stock.outletId);
        }
      }
      const trimmedExternalId = dto.externalId?.trim() || null;
      if (trimmedExternalId) {
        const existing = await tx.product.findFirst({
          where: {
            merchantId,
            deletedAt: null,
            externalId: trimmedExternalId,
          },
          select: { id: true },
        });
        if (existing) {
          throw new BadRequestException(
            'Товар с таким внешним ID уже существует',
          );
        }
        const archived = await tx.product.findMany({
          where: {
            merchantId,
            deletedAt: { not: null },
            externalId: trimmedExternalId,
          },
          select: { id: true },
        });
        if (archived.length) {
          const archivedIds = archived.map((item) => item.id);
          await tx.product.updateMany({
            where: { id: { in: archivedIds } },
            data: { externalId: null, externalProvider: null },
          });
          await tx.productExternalId.deleteMany({
            where: { merchantId, productId: { in: archivedIds } },
          });
        }
      }
      const order = dto.order ?? (await this.nextProductOrder(tx, merchantId));
      const sanitizedDto: CreateProductDto = {
        ...dto,
        sku: undefined,
        code: undefined,
        barcode: undefined,
        unit: undefined,
        externalProvider: undefined,
        iikoProductId: undefined,
      };
      const data = this.prepareProductCreateData(
        merchantId,
        { ...sanitizedDto, order },
        { categoryId: dto.categoryId ?? null },
      );
      const created = await tx.product.create({
        data,
        include: {
          category: true,
          images: { orderBy: { position: 'asc' } },
          variants: { orderBy: { position: 'asc' } },
          stocks: { include: { outlet: true } },
          externalMappings: true,
        },
      });
      await this.syncProductExternal(tx, merchantId, created.id, {
        externalProvider: null,
        externalId: trimmedExternalId,
        barcode: null,
        sku: null,
      });
      const full = await tx.product.findFirst({
        where: { id: created.id },
        include: {
          category: true,
          images: { orderBy: { position: 'asc' } },
          variants: { orderBy: { position: 'asc' } },
          stocks: { include: { outlet: true } },
          externalMappings: true,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'portal.catalog.product.create',
          merchantId,
          productId: created.id,
        }),
      );
      this.metrics.inc('portal_catalog_products_changed_total', {
        action: 'create',
      });
      return this.mapProductDetailed(full || created);
    });
  }

  async updateProduct(
    merchantId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, merchantId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (dto.categoryId !== undefined) {
        if (dto.categoryId)
          await this.ensureCategoryOwnership(tx, merchantId, dto.categoryId);
      }
      if (dto.stocks) {
        for (const stock of dto.stocks) {
          if (stock.outletId)
            await this.ensureOutletOwnership(tx, merchantId, stock.outletId);
        }
      }
      const trimmedExternalId = dto.externalId?.trim() || null;
      if (dto.externalId !== undefined && trimmedExternalId) {
        const existing = await tx.product.findFirst({
          where: {
            merchantId,
            deletedAt: null,
            externalId: trimmedExternalId,
            NOT: { id: productId },
          },
          select: { id: true },
        });
        if (existing) {
          throw new BadRequestException(
            'Товар с таким внешним ID уже существует',
          );
        }
        const archived = await tx.product.findMany({
          where: {
            merchantId,
            deletedAt: { not: null },
            externalId: trimmedExternalId,
          },
          select: { id: true },
        });
        if (archived.length) {
          const archivedIds = archived.map((item) => item.id);
          await tx.product.updateMany({
            where: { id: { in: archivedIds } },
            data: { externalId: null, externalProvider: null },
          });
          await tx.productExternalId.deleteMany({
            where: { merchantId, productId: { in: archivedIds } },
          });
        }
      }
      const data: Prisma.ProductUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name)
          throw new BadRequestException('Product name cannot be empty');
        data.name = name;
      }
      if (dto.externalId !== undefined)
        (data as any).externalId = trimmedExternalId;
      if (dto.description !== undefined)
        data.description = dto.description ?? null;
      if (dto.order !== undefined) data.order = dto.order;
      if (dto.hasVariants !== undefined) data.hasVariants = dto.hasVariants;
      if (dto.priceEnabled !== undefined) data.priceEnabled = dto.priceEnabled;
      const priceEnabled =
        dto.priceEnabled !== undefined
          ? dto.priceEnabled
          : product.priceEnabled;
      if (dto.price !== undefined || dto.priceEnabled !== undefined) {
        const price =
          dto.price !== undefined
            ? dto.price
            : this.decimalToNumber(product.price);
        data.price = priceEnabled ? this.toDecimal(price ?? 0) : null;
      }
      if (dto.disableCart !== undefined) data.allowCart = !dto.disableCart;
      if (dto.visible !== undefined) data.visible = dto.visible;
      if (dto.accruePoints !== undefined) data.accruePoints = dto.accruePoints;
      if (dto.allowRedeem !== undefined) data.allowRedeem = dto.allowRedeem;
      if (dto.redeemPercent !== undefined)
        data.redeemPercent = this.clampPercent(
          dto.redeemPercent,
          product.redeemPercent,
        );
      if (dto.weightValue !== undefined)
        data.weightValue = this.toDecimal(dto.weightValue);
      if (dto.weightUnit !== undefined)
        data.weightUnit = dto.weightUnit ?? null;
      if (dto.heightCm !== undefined)
        data.heightCm = this.toDecimal(dto.heightCm);
      if (dto.widthCm !== undefined) data.widthCm = this.toDecimal(dto.widthCm);
      if (dto.depthCm !== undefined) data.depthCm = this.toDecimal(dto.depthCm);
      if (dto.proteins !== undefined)
        data.proteins = this.toDecimal(dto.proteins);
      if (dto.fats !== undefined) data.fats = this.toDecimal(dto.fats);
      if (dto.carbs !== undefined) data.carbs = this.toDecimal(dto.carbs);
      if (dto.calories !== undefined)
        data.calories = this.toDecimal(dto.calories);
      if (dto.tags !== undefined) data.tags = dto.tags;
      if (dto.categoryId !== undefined) {
        data.category = dto.categoryId
          ? { connect: { id: dto.categoryId } }
          : { disconnect: true };
      }
      if (Object.keys(data).length > 0) {
        await tx.product.update({ where: { id: productId }, data });
      }
      if (dto.images !== undefined) {
        await tx.productImage.deleteMany({ where: { productId } });
        if (dto.images?.length) {
          await tx.productImage.createMany({
            data: dto.images.map((img, index) => ({
              productId,
              url: img.url,
              alt: img.alt ?? null,
              position: img.position ?? index,
            })),
          });
        }
      }
      const hasVariants =
        dto.hasVariants !== undefined ? dto.hasVariants : product.hasVariants;
      if (dto.variants !== undefined || dto.hasVariants !== undefined) {
        await tx.productVariant.deleteMany({ where: { productId } });
        if (hasVariants && dto.variants?.length) {
          await tx.productVariant.createMany({
            data: dto.variants.map((variant, index) => ({
              productId,
              name: variant.name,
              sku: variant.sku ?? null,
              price: this.toDecimal(variant.price),
              notes: variant.notes ?? null,
              position: variant.position ?? index,
            })),
          });
        }
      }
      if (dto.stocks !== undefined) {
        await tx.productStock.deleteMany({ where: { productId } });
        if (dto.stocks?.length) {
          for (const stock of dto.stocks) {
            await tx.productStock.create({
              data: {
                productId,
                label: stock.label,
                outletId: stock.outletId ?? null,
                price: this.toDecimal(stock.price),
                balance: this.toDecimal(stock.balance),
                currency: stock.currency ?? 'RUB',
              },
            });
          }
        }
      }
      const updated = await tx.product.findFirst({
        where: { id: productId },
        include: {
          category: true,
          images: { orderBy: { position: 'asc' } },
          variants: { orderBy: { position: 'asc' } },
          stocks: { include: { outlet: true } },
          externalMappings: true,
        },
      });
      if (!updated) throw new NotFoundException('Product not found');
      this.logger.log(
        JSON.stringify({
          event: 'portal.catalog.product.update',
          merchantId,
          productId,
        }),
      );
      this.metrics.inc('portal_catalog_products_changed_total', {
        action: 'update',
      });
      return this.mapProductDetailed(updated);
    });
  }

  async deleteProduct(merchantId: string, productId: string) {
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, merchantId, deletedAt: null },
      data: { deletedAt: new Date(), externalId: null, externalProvider: null },
    });
    if (updated.count === 0) {
      const archived = await this.prisma.product.findFirst({
        where: { id: productId, merchantId, deletedAt: { not: null } },
        select: { id: true },
      });
      if (!archived) {
        throw new NotFoundException('Product not found');
      }
      await this.prisma.product.update({
        where: { id: productId },
        data: { externalId: null, externalProvider: null },
      });
    }
    await this.prisma.productExternalId.deleteMany({
      where: { merchantId, productId },
    });
    this.logger.log(
      JSON.stringify({
        event: 'portal.catalog.product.delete',
        merchantId,
        productId,
      }),
    );
    this.metrics.inc('portal_catalog_products_changed_total', {
      action: 'delete',
    });
    return { ok: true };
  }

  async bulkProductAction(merchantId: string, dto: ProductBulkActionDto) {
    const ids = dto.ids || [];
    if (!ids.length) return { ok: true, updated: 0 };
    if (dto.action === ProductBulkAction.DELETE) {
      const result = await this.prisma.product.updateMany({
        where: { id: { in: ids }, merchantId, deletedAt: null },
        data: { deletedAt: new Date(), externalId: null, externalProvider: null },
      });
      await this.prisma.productExternalId.deleteMany({
        where: { merchantId, productId: { in: ids } },
      });
      this.logger.log(
        JSON.stringify({
          event: 'portal.catalog.product.bulk',
          merchantId,
          action: dto.action,
          updated: result.count,
        }),
      );
      this.metrics.inc('portal_catalog_products_changed_total', {
        action: 'bulk_delete',
      });
      return { ok: true, updated: result.count };
    }
    const patch = BULK_ACTION_MAP[dto.action];
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids }, merchantId, deletedAt: null },
      data: patch,
    });
    this.logger.log(
      JSON.stringify({
        event: 'portal.catalog.product.bulk',
        merchantId,
        action: dto.action,
        updated: result.count,
      }),
    );
    this.metrics.inc('portal_catalog_products_changed_total', {
      action: dto.action,
    });
    return { ok: true, updated: result.count };
  }

  async importCatalog(
    merchantId: string,
    provider: string,
    dto: ImportCatalogDto,
  ) {
    const providerCode = dto.externalProvider?.trim() || provider || 'EXTERNAL';
    const productsInput = Array.isArray(dto.products) ? dto.products : [];
    const summary = {
      createdCategories: 0,
      updatedCategories: 0,
      createdProducts: 0,
      updatedProducts: 0,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const product of productsInput) {
          const externalId = (product.externalId || '').trim();
          const name = (product.name || '').trim();
          if (!externalId || !name) continue;
          const categoryId = null;
          const barcode = product.barcode?.trim() || null;
          const sku = product.sku?.trim() || null;
          const code = product.code?.trim() || null;
          const existing = await tx.product.findFirst({
            where: {
              merchantId,
              deletedAt: null,
              OR: [
                {
                  externalProvider: providerCode,
                  externalId,
                },
                {
                  externalMappings: {
                    some: { externalProvider: providerCode, externalId },
                  },
                },
              ],
            },
          });
          let resolved = existing;
          if (!resolved && barcode) {
            resolved = await tx.product.findFirst({
              where: { merchantId, deletedAt: null, barcode },
            });
          }
          if (!resolved && sku) {
            resolved = await tx.product.findFirst({
              where: { merchantId, deletedAt: null, sku },
            });
          }
          if (!resolved && code) {
            resolved = await tx.product.findFirst({
              where: { merchantId, deletedAt: null, code },
            });
          }

          if (resolved) {
            await tx.product.update({
              where: { id: resolved.id },
              data: {
                name,
                category: categoryId
                  ? { connect: { id: categoryId } }
                  : undefined,
                sku,
                code,
                barcode,
                unit: product.unit?.trim() || resolved.unit,
                externalProvider: providerCode,
                externalId,
                price: this.toDecimal(
                  product.price ?? this.decimalToNumber(resolved.price),
                ),
                priceEnabled: true,
              },
            });
            await this.syncProductExternal(tx, merchantId, resolved.id, {
              externalProvider: providerCode,
              externalId,
              barcode,
              sku,
            });
            summary.updatedProducts += 1;
          } else {
            const order = await this.nextProductOrder(tx, merchantId);
            const created = await tx.product.create({
              data: this.prepareProductCreateData(
                merchantId,
                {
                  name,
                  sku,
                  code,
                  barcode,
                  unit: product.unit,
                  priceEnabled: true,
                  price: product.price ?? 0,
                  hasVariants: false,
                  visible: true,
                  accruePoints: true,
                  allowRedeem: true,
                  externalProvider: providerCode,
                  externalId,
                  order,
                } as CreateProductDto,
                { categoryId },
              ),
              include: {
                category: true,
                images: { orderBy: { position: 'asc' } },
                variants: { orderBy: { position: 'asc' } },
                stocks: { include: { outlet: true } },
                externalMappings: true,
              },
            });
            await this.syncProductExternal(tx, merchantId, created.id, {
              externalProvider: providerCode,
              externalId,
              barcode,
              sku,
            });
            summary.createdProducts += 1;
          }
        }
      });
      await this.writeSyncLog({
        merchantId,
        provider: providerCode,
        endpoint: `catalog/import/${provider.toLowerCase()}`,
        status: 'ok',
        request: {
          products: productsInput.length,
          categories: 0,
        },
        response: summary,
      });
      return { ok: true, ...summary };
    } catch (error: any) {
      await this.writeSyncLog({
        merchantId,
        provider: providerCode,
        endpoint: `catalog/import/${provider.toLowerCase()}`,
        status: 'error',
        request: {
          products: productsInput.length,
          categories: 0,
        },
        response: summary,
        error: error?.message ?? String(error),
      });
      throw error;
    }
  }

  // ===== Outlets =====
  async listOutlets(
    merchantId: string,
    status?: 'active' | 'inactive' | 'all',
    search?: string,
  ): Promise<PortalOutletListResponseDto> {
    const where: Prisma.OutletWhereInput = { merchantId };
    if (status === 'active') where.status = 'ACTIVE';
    if (status === 'inactive') where.status = 'INACTIVE';
    if (search) {
      const term = search.trim();
      if (term) {
        const and: Prisma.OutletWhereInput[] = [];
        if (where.AND)
          and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
        and.push({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { address: { contains: term, mode: 'insensitive' } },
          ],
        });
        where.AND = and;
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.outlet.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          devices: {
            where: { archivedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.outlet.count({ where }),
    ]);
    const outletIds = items.map((outlet) => outlet.id);
    const staffCountMap = new Map<string, number>();
    if (outletIds.length) {
      const counts = await this.prisma.staffOutletAccess.groupBy({
        by: ['outletId'],
        where: {
          merchantId,
          outletId: { in: outletIds },
          status: StaffOutletAccessStatus.ACTIVE,
        },
        _count: { outletId: true },
      });
      counts.forEach((row) => {
        staffCountMap.set(row.outletId, row._count.outletId);
      });
    }
    return {
      items: items.map((outlet) =>
        this.mapOutlet({
          ...outlet,
          staffCount: staffCountMap.get(outlet.id) ?? 0,
        }),
      ),
      total,
    };
  }

  async getOutlet(
    merchantId: string,
    outletId: string,
  ): Promise<PortalOutletDto> {
    const outlet = await this.loadOutletWithDevices(merchantId, outletId);
    return this.mapOutlet(outlet);
  }

  async createOutlet(
    merchantId: string,
    dto: CreatePortalOutletDto,
  ): Promise<PortalOutletDto> {
    const name = dto.name?.trim();
    const address = dto.address?.trim() || null;
    if (!name) throw new BadRequestException('Outlet name is required');
    const devices = this.normalizeDevicesInput(dto.devices);
    const scheduleEnabled = dto.showSchedule ?? false;
    const schedule =
      dto.schedule && scheduleEnabled
        ? dto.schedule
        : { mode: 'CUSTOM', days: [] };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const createdOutlet = await tx.outlet.create({
          data: {
            merchantId,
            name,
            address,
            status: dto.works === false ? 'INACTIVE' : 'ACTIVE',
            hidden: dto.hidden ?? false,
            description: dto.description ?? null,
            phone: dto.phone ?? null,
            adminEmails:
              dto.adminEmails?.map((email) => email.trim()).filter(Boolean) ??
              [],
            timezone: dto.timezone ?? null,
            scheduleEnabled,
            scheduleMode: schedule.mode,
            scheduleJson: scheduleEnabled
              ? (schedule as unknown as Prisma.InputJsonValue)
              : (Prisma.DbNull as Prisma.NullableJsonNullValueInput),
            externalId: dto.externalId?.trim() || null,
            manualLocation: dto.manualLocation ?? false,
            latitude: this.toDecimal(dto.latitude),
            longitude: this.toDecimal(dto.longitude),
            reviewLinks: (() => {
              const patch = this.prepareReviewLinksPatch(dto.reviewsShareLinks);
              if (!patch)
                return Prisma.JsonNull as Prisma.NullableJsonNullValueInput;
              const merged = this.applyReviewLinksPatch(null, patch);
              return Object.keys(merged).length
                ? (merged as unknown as Prisma.InputJsonValue)
                : (Prisma.JsonNull as Prisma.NullableJsonNullValueInput);
            })(),
          },
        });
        await this.syncDevicesForOutlet(
          tx,
          merchantId,
          createdOutlet.id,
          devices,
        );
        return tx.outlet.findUnique({
          where: { id: createdOutlet.id },
          include: {
            devices: {
              where: { archivedAt: null },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      });
      if (!created) throw new NotFoundException('Outlet not found');
      this.logger.log(
        JSON.stringify({
          event: 'portal.outlet.create',
          merchantId,
          outletId: created.id,
        }),
      );
      this.metrics.inc('portal_outlets_changed_total', { action: 'create' });
      return this.mapOutlet(
        created as Outlet & { devices?: Prisma.DeviceUncheckedCreateInput[] },
      );
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target = error.meta?.target;
        if (
          Array.isArray(target) &&
          target.includes('Device_merchantId_codeNormalized_key')
        ) {
          throw new BadRequestException(
            'Устройство с таким идентификатором уже существует',
          );
        }
        throw new BadRequestException(
          'Outlet with this externalId already exists',
        );
      }
      throw error;
    }
  }

  async updateOutlet(
    merchantId: string,
    outletId: string,
    dto: UpdatePortalOutletDto,
  ): Promise<PortalOutletDto> {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: outletId, merchantId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const data: Prisma.OutletUpdateInput = {};
    const devices =
      dto.devices !== undefined
        ? this.normalizeDevicesInput(dto.devices || [])
        : null;
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Outlet name cannot be empty');
      data.name = name;
    }
    if (dto.address !== undefined) {
      const address = dto.address.trim();
      data.address = address ? address : null;
    }
    if (dto.description !== undefined)
      data.description = dto.description ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone ?? null;
    if (dto.adminEmails !== undefined) {
      data.adminEmails =
        dto.adminEmails?.map((email) => email.trim()).filter(Boolean) ?? [];
    }
    if (dto.timezone !== undefined) data.timezone = dto.timezone ?? null;
    if (dto.works !== undefined)
      data.status = dto.works ? 'ACTIVE' : 'INACTIVE';
    if (dto.hidden !== undefined) data.hidden = dto.hidden;
    if (dto.manualLocation !== undefined)
      data.manualLocation = dto.manualLocation;
    if (dto.latitude !== undefined)
      data.latitude = this.toDecimal(dto.latitude);
    if (dto.longitude !== undefined)
      data.longitude = this.toDecimal(dto.longitude);
    if (dto.externalId !== undefined)
      data.externalId = dto.externalId?.trim() || null;
    if (dto.reviewsShareLinks !== undefined) {
      const patch = this.prepareReviewLinksPatch(dto.reviewsShareLinks) || {};
      const merged = this.applyReviewLinksPatch(
        outlet.reviewLinks as any,
        patch,
      );
      data.reviewLinks = Object.keys(merged).length
        ? (merged as unknown as Prisma.InputJsonValue)
        : (Prisma.JsonNull as Prisma.NullableJsonNullValueInput);
    }
    const showSchedule =
      dto.showSchedule !== undefined
        ? dto.showSchedule
        : outlet.scheduleEnabled;
    if (dto.showSchedule !== undefined) data.scheduleEnabled = showSchedule;
    if (dto.schedule !== undefined) {
      const schedule = dto.schedule ?? { mode: 'CUSTOM', days: [] };
      data.scheduleMode = schedule.mode;
      data.scheduleJson = showSchedule
        ? (schedule as unknown as Prisma.InputJsonValue)
        : (Prisma.DbNull as Prisma.NullableJsonNullValueInput);
    } else if (dto.showSchedule !== undefined && !showSchedule) {
      data.scheduleJson = Prisma.DbNull as Prisma.NullableJsonNullValueInput;
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const hasPatch = Object.keys(data).length > 0;
        const saved = hasPatch
          ? await tx.outlet.update({
              where: { id: outletId },
              data,
            })
          : outlet;
        if (devices !== null) {
          await this.syncDevicesForOutlet(tx, merchantId, outletId, devices);
        }
        return tx.outlet.findUnique({
          where: { id: saved.id },
          include: {
            devices: {
              where: { archivedAt: null },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      });
      this.logger.log(
        JSON.stringify({ event: 'portal.outlet.update', merchantId, outletId }),
      );
      this.metrics.inc('portal_outlets_changed_total', { action: 'update' });
      return this.mapOutlet(updated as any);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target = error.meta?.target;
        if (
          Array.isArray(target) &&
          target.includes('Device_merchantId_codeNormalized_key')
        ) {
          throw new BadRequestException(
            'Устройство с таким идентификатором уже существует',
          );
        }
        throw new BadRequestException(
          'Outlet with this externalId already exists',
        );
      }
      throw error;
    }
  }
}
