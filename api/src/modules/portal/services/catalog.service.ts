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
  Outlet,
  StaffOutletAccessStatus,
} from '@prisma/client';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  ProductDto,
  ProductListResponseDto,
  ListProductsQueryDto,
  ProductBulkActionDto,
  ProductBulkAction,
  CreatePortalOutletDto,
  UpdatePortalOutletDto,
  PortalOutletDto,
  PortalOutletListResponseDto,
  ImportCatalogDto,
} from '../dto/catalog.dto';
import {
  normalizeDeviceCode,
  ensureUniqueDeviceCodes,
  type NormalizedDeviceCode,
} from '../../../shared/devices/device.util';
import { logEvent } from '../../../shared/logging/event-log.util';

const BULK_ACTION_MAP: Record<
  ProductBulkAction,
  Prisma.ProductUpdateManyMutationInput
> = {
  [ProductBulkAction.ALLOW_REDEEM]: { allowRedeem: true },
  [ProductBulkAction.FORBID_REDEEM]: { allowRedeem: false },
  [ProductBulkAction.DELETE]: { deletedAt: new Date() },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error);
  }
  return Object.prototype.toString.call(error) as string;
};

const readPrismaErrorCode = (error: unknown): string | null => {
  if (!isRecord(error)) return null;
  return typeof error.code === 'string' ? error.code : null;
};

const readPrismaErrorTarget = (error: unknown): string[] | null => {
  if (!isRecord(error)) return null;
  if (!isRecord(error.meta)) return null;
  const target = error.meta.target;
  return Array.isArray(target)
    ? target.filter((item): item is string => typeof item === 'string')
    : null;
};

@Injectable()
export class PortalCatalogService {
  private readonly logger = new Logger(PortalCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly cache: LookupCacheService,
  ) {}

  // ===== Helpers =====

  private clampPercent(value: number | undefined, fallback = 100): number {
    const numeric = Number.isFinite(value) ? Number(value) : fallback;
    if (Number.isNaN(numeric)) return fallback;
    return Math.min(100, Math.max(0, Math.round(numeric)));
  }

  private normalizeProductIds(ids?: string[]) {
    if (!Array.isArray(ids)) return [];
    const unique = new Set<string>();
    ids.forEach((id) => {
      const normalized = String(id || '').trim();
      if (normalized) unique.add(normalized);
    });
    return Array.from(unique);
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

  private async assertOutletLimit(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { maxOutlets: true },
    });
    const limit = settings?.maxOutlets ?? null;
    if (limit == null || limit <= 0) return;
    const count = await this.prisma.outlet.count({ where: { merchantId } });
    if (count >= limit) {
      throw new BadRequestException('Вы достигли лимита торговых точек.');
    }
  }

  private mapCategory(entity: ProductCategory): CategoryDto {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description ?? null,
      parentId: entity.parentId ?? null,
      status: entity.status,
    };
  }

  private mapProduct(
    product: Product & {
      category?: ProductCategory | null;
    },
  ): ProductDto {
    return {
      id: product.id,
      name: product.name,
      categoryId: product.categoryId ?? null,
      categoryName: product.category?.name ?? null,
      accruePoints: product.accruePoints,
      allowRedeem: product.allowRedeem,
      redeemPercent: product.redeemPercent,
      externalId: product.externalId ?? null,
      price: this.decimalToNumber(product.price),
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
    } catch (err) {
      logIgnoredError(err, 'CatalogService invalid URL', this.logger, 'debug');
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
    if (
      normalized === 'twogis' ||
      normalized === '2gis' ||
      normalized === 'gis'
    )
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
    entity: Outlet & {
      devices?: Prisma.DeviceGetPayload<object>[];
      staffCount?: number;
    },
  ): PortalOutletDto {
    return {
      id: entity.id,
      name: entity.name,
      works: entity.status !== 'INACTIVE',
      staffCount:
        typeof entity.staffCount === 'number' ? entity.staffCount : undefined,
      devices: this.mapDevices(entity.devices),
      reviewsShareLinks: (() => {
        const links = this.extractReviewLinks(entity.reviewLinks);
        if (!Object.keys(links).length) return null;
        return {
          yandex: links['yandex'] ?? null,
          twogis: links['twogis'] ?? null,
          google: links['google'] ?? null,
        };
      })(),
    };
  }

  private mapDevices(devices?: Prisma.DeviceGetPayload<object>[]) {
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

  private async writeSyncLog(params: {
    merchantId: string;
    provider: string;
    endpoint: string;
    status: 'ok' | 'error';
    request?: Prisma.InputJsonValue | null;
    response?: Prisma.InputJsonValue | null;
    error?: unknown;
  }) {
    try {
      const errorMessage = params.error ? readErrorMessage(params.error) : null;
      await this.prisma.syncLog.create({
        data: {
          merchantId: params.merchantId,
          provider: params.provider,
          direction: 'IN',
          endpoint: params.endpoint,
          status: params.status,
          request: params.request == null ? Prisma.DbNull : params.request,
          response: params.response == null ? Prisma.DbNull : params.response,
          error: errorMessage,
        },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'PortalCatalogService sync log',
        this.logger,
        'debug',
      );
    }
  }

  // ===== Categories =====
  async listCategories(merchantId: string): Promise<CategoryDto[]> {
    const categories = await this.prisma.productCategory.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
    });
    return categories.map((category) => this.mapCategory(category));
  }

  async createCategory(
    merchantId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');
    const assignIds = this.normalizeProductIds(dto.assignProductIds);
    return this.prisma.$transaction(async (tx) => {
      if (dto.parentId)
        await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
      const created = await tx.productCategory.create({
        data: {
          merchantId,
          name,
          description: dto.description?.trim() || null,
          parentId: dto.parentId ?? null,
          status: dto.status ?? 'ACTIVE',
        },
      });
      if (assignIds.length) {
        await tx.product.updateMany({
          where: {
            id: { in: assignIds },
            merchantId,
            deletedAt: null,
          },
          data: { categoryId: created.id },
        });
      }
      logEvent(this.logger, 'portal.catalog.category.create', {
        merchantId,
        categoryId: created.id,
      });
      this.metrics.inc('portal_catalog_categories_changed_total', {
        action: 'create',
      });
      return this.mapCategory(created);
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
      const assignIds = this.normalizeProductIds(dto.assignProductIds);
      let unassignIds = this.normalizeProductIds(dto.unassignProductIds);
      if (assignIds.length && unassignIds.length) {
        const assignSet = new Set(assignIds);
        unassignIds = unassignIds.filter((id) => !assignSet.has(id));
      }
      const data: Prisma.ProductCategoryUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name)
          throw new BadRequestException('Category name cannot be empty');
        data.name = name;
      }
      if (dto.description !== undefined)
        data.description = dto.description?.trim() || null;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.parentId !== undefined) {
        if (dto.parentId) {
          if (dto.parentId === categoryId)
            throw new BadRequestException('Category cannot reference itself');
          await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
          const categories = await tx.productCategory.findMany({
            where: { merchantId, deletedAt: null },
            select: { id: true, parentId: true },
          });
          const childrenMap = new Map<string, string[]>();
          categories.forEach((item) => {
            if (!item.parentId) return;
            const list = childrenMap.get(item.parentId) ?? [];
            list.push(item.id);
            childrenMap.set(item.parentId, list);
          });
          const descendants = new Set<string>();
          const stack = [categoryId];
          while (stack.length) {
            const current = stack.pop() ?? '';
            const children = childrenMap.get(current) ?? [];
            for (const child of children) {
              if (descendants.has(child)) continue;
              descendants.add(child);
              stack.push(child);
            }
          }
          if (descendants.has(dto.parentId)) {
            throw new BadRequestException(
              'Category cannot reference its descendant',
            );
          }
          data.parent = { connect: { id: dto.parentId } };
        } else {
          data.parent = { disconnect: true };
        }
      }
      if (
        Object.keys(data).length === 0 &&
        assignIds.length === 0 &&
        unassignIds.length === 0
      )
        return this.mapCategory(category);
      const updated =
        Object.keys(data).length > 0
          ? await tx.productCategory.update({
              where: { id: categoryId },
              data,
            })
          : category;
      if (assignIds.length) {
        await tx.product.updateMany({
          where: {
            id: { in: assignIds },
            merchantId,
            deletedAt: null,
          },
          data: { categoryId },
        });
      }
      if (unassignIds.length) {
        await tx.product.updateMany({
          where: {
            id: { in: unassignIds },
            merchantId,
            deletedAt: null,
            categoryId,
          },
          data: { categoryId: null },
        });
      }
      logEvent(this.logger, 'portal.catalog.category.update', {
        merchantId,
        categoryId,
      });
      this.metrics.inc('portal_catalog_categories_changed_total', {
        action: 'update',
      });
      return this.mapCategory(updated);
    });
  }

  async deleteCategory(merchantId: string, categoryId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ensureCategoryOwnership(tx, merchantId, categoryId);
      const childCount = await tx.productCategory.count({
        where: { merchantId, parentId: categoryId, deletedAt: null },
      });
      if (childCount > 0) {
        throw new BadRequestException('Category has child categories');
      }
      await tx.productCategory.update({
        where: { id: categoryId },
        data: { deletedAt: new Date() },
      });
      await tx.product.updateMany({
        where: { merchantId, categoryId },
        data: { categoryId: null },
      });
    });
    logEvent(this.logger, 'portal.catalog.category.delete', {
      merchantId,
      categoryId,
    });
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
    const limitRaw = query.limit ? Number(query.limit) : NaN;
    const offsetRaw = query.offset ? Number(query.offset) : NaN;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
      : null;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.floor(offsetRaw))
      : 0;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.points === 'with_points') where.accruePoints = true;
    if (query.points === 'without_points') where.accruePoints = false;
    const andFilters: Prisma.ProductWhereInput[] = [];
    if (query.externalId) {
      const extId = query.externalId.trim();
      if (extId) {
        andFilters.push({
          externalId: { contains: extId, mode: 'insensitive' },
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
        orderBy: [{ createdAt: 'asc' }],
        take: limit ?? undefined,
        skip: offset || undefined,
        include: {
          category: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: items.map((product) => this.mapProduct(product)),
      total,
    };
  }

  async getProduct(merchantId: string, productId: string): Promise<ProductDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, merchantId, deletedAt: null },
      include: {
        category: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.mapProduct(product);
  }

  private prepareProductCreateData(
    merchantId: string,
    dto: CreateProductDto,
    opts: { categoryId?: string | null },
  ): Prisma.ProductCreateInput {
    return {
      merchant: { connect: { id: merchantId } },
      name: dto.name.trim(),
      externalId: dto.externalId ? dto.externalId.trim() : null,
      price: this.toDecimal(dto.price ?? null),
      accruePoints: dto.accruePoints ?? true,
      allowRedeem: dto.allowRedeem ?? true,
      redeemPercent: this.clampPercent(dto.redeemPercent, 100),
      category: opts.categoryId
        ? { connect: { id: opts.categoryId } }
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
            data: { externalId: null },
          });
        }
      }
      const data = this.prepareProductCreateData(merchantId, dto, {
        categoryId: dto.categoryId ?? null,
      });
      const created = await tx.product.create({
        data,
        include: {
          category: true,
        },
      });
      logEvent(this.logger, 'portal.catalog.product.create', {
        merchantId,
        productId: created.id,
      });
      this.metrics.inc('portal_catalog_products_changed_total', {
        action: 'create',
      });
      return this.mapProduct(created);
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
            data: { externalId: null },
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
      if (dto.externalId !== undefined) data.externalId = trimmedExternalId;
      if (dto.price !== undefined) data.price = this.toDecimal(dto.price);
      if (dto.accruePoints !== undefined) data.accruePoints = dto.accruePoints;
      if (dto.allowRedeem !== undefined) data.allowRedeem = dto.allowRedeem;
      if (dto.redeemPercent !== undefined)
        data.redeemPercent = this.clampPercent(
          dto.redeemPercent,
          product.redeemPercent ?? 100,
        );
      if (dto.categoryId !== undefined) {
        data.category = dto.categoryId
          ? { connect: { id: dto.categoryId } }
          : { disconnect: true };
      }
      if (Object.keys(data).length > 0) {
        await tx.product.update({ where: { id: productId }, data });
      }
      const updated = await tx.product.findFirst({
        where: { id: productId },
        include: {
          category: true,
        },
      });
      if (!updated) throw new NotFoundException('Product not found');
      logEvent(this.logger, 'portal.catalog.product.update', {
        merchantId,
        productId,
      });
      this.metrics.inc('portal_catalog_products_changed_total', {
        action: 'update',
      });
      return this.mapProduct(updated);
    });
  }

  async deleteProduct(merchantId: string, productId: string) {
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, merchantId, deletedAt: null },
      data: { deletedAt: new Date(), externalId: null },
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
        data: { externalId: null },
      });
    }
    logEvent(this.logger, 'portal.catalog.product.delete', {
      merchantId,
      productId,
    });
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
        data: {
          deletedAt: new Date(),
          externalId: null,
        },
      });
      logEvent(this.logger, 'portal.catalog.product.bulk', {
        merchantId,
        action: dto.action,
        updated: result.count,
      });
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
    logEvent(this.logger, 'portal.catalog.product.bulk', {
      merchantId,
      action: dto.action,
      updated: result.count,
    });
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
    const providerCode = provider || 'EXTERNAL';
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
          const existing = await tx.product.findFirst({
            where: {
              merchantId,
              deletedAt: null,
              externalId,
            },
          });

          if (existing) {
            await tx.product.update({
              where: { id: existing.id },
              data: {
                name,
                category: categoryId
                  ? { connect: { id: categoryId } }
                  : undefined,
                externalId,
                price: this.toDecimal(
                  product.price ?? this.decimalToNumber(existing.price),
                ),
              },
            });
            summary.updatedProducts += 1;
          } else {
            await tx.product.create({
              data: this.prepareProductCreateData(
                merchantId,
                {
                  name,
                  price: product.price ?? null,
                  accruePoints: true,
                  allowRedeem: true,
                  externalId,
                } as CreateProductDto,
                { categoryId },
              ),
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
    } catch (error: unknown) {
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
        error,
      });
      throw error;
    }
  }

  // ===== Outlets =====
  async listOutlets(
    merchantId: string,
    status?: 'active' | 'inactive' | 'all',
    search?: string,
    pagination?: { page?: number; pageSize?: number },
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
          OR: [{ name: { contains: term, mode: 'insensitive' } }],
        });
        where.AND = and;
      }
    }
    const hasPagination =
      pagination?.page !== undefined || pagination?.pageSize !== undefined;
    const page = Math.max(1, Math.floor(pagination?.page ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(200, Math.floor(pagination?.pageSize ?? 20)),
    );
    const [items, total] = await Promise.all([
      this.prisma.outlet.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...(hasPagination
          ? {
              skip: (page - 1) * pageSize,
              take: pageSize,
            }
          : {}),
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
    if (!name) throw new BadRequestException('Outlet name is required');
    await this.assertOutletLimit(merchantId);
    const devices = this.normalizeDevicesInput(dto.devices);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const createdOutlet = await tx.outlet.create({
          data: {
            merchantId,
            name,
            status: dto.works === false ? 'INACTIVE' : 'ACTIVE',
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
      logEvent(this.logger, 'portal.outlet.create', {
        merchantId,
        outletId: created.id,
      });
      this.metrics.inc('portal_outlets_changed_total', { action: 'create' });
      this.cache.invalidateOutlet(merchantId, created.id);
      return this.mapOutlet(created);
    } catch (error: unknown) {
      if (readPrismaErrorCode(error) === 'P2002') {
        const target = readPrismaErrorTarget(error);
        if (target?.includes('Device_merchantId_codeNormalized_key')) {
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
    if (dto.works !== undefined)
      data.status = dto.works ? 'ACTIVE' : 'INACTIVE';
    if (dto.reviewsShareLinks !== undefined) {
      const patch = this.prepareReviewLinksPatch(dto.reviewsShareLinks) || {};
      const merged = this.applyReviewLinksPatch(outlet.reviewLinks, patch);
      data.reviewLinks = Object.keys(merged).length
        ? (merged as unknown as Prisma.InputJsonValue)
        : (Prisma.JsonNull as Prisma.NullableJsonNullValueInput);
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
      logEvent(this.logger, 'portal.outlet.update', {
        merchantId,
        outletId,
      });
      this.metrics.inc('portal_outlets_changed_total', { action: 'update' });
      if (!updated) throw new NotFoundException('Outlet not found');
      this.cache.invalidateOutlet(merchantId, outletId);
      return this.mapOutlet(updated);
    } catch (error: unknown) {
      if (readPrismaErrorCode(error) === 'P2002') {
        const target = readPrismaErrorTarget(error);
        if (target?.includes('Device_merchantId_codeNormalized_key')) {
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
