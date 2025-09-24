import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Product, ProductCategory, ProductImage, ProductStock, ProductVariant, Outlet } from '@prisma/client';
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
} from './catalog.dto';

const BULK_ACTION_MAP: Record<ProductBulkAction, Prisma.ProductUpdateManyMutationInput> = {
  [ProductBulkAction.SHOW]: { visible: true },
  [ProductBulkAction.HIDE]: { visible: false },
  [ProductBulkAction.ALLOW_REDEEM]: { allowRedeem: true },
  [ProductBulkAction.FORBID_REDEEM]: { allowRedeem: false },
  [ProductBulkAction.DELETE]: { deletedAt: new Date() },
};

@Injectable()
export class PortalCatalogService {
  private readonly logger = new Logger(PortalCatalogService.name);

  constructor(private readonly prisma: PrismaService, private readonly metrics: MetricsService) {}

  // ===== Helpers =====
  private slugify(input: string): string {
    const map: Record<string, string> = {
      ё: 'e', й: 'i', ц: 'c', у: 'u', к: 'k', е: 'e', н: 'n', г: 'g', ш: 'sh', щ: 'sch', з: 'z', х: 'h', ъ: '',
      ф: 'f', ы: 'y', в: 'v', а: 'a', п: 'p', р: 'r', о: 'o', л: 'l', д: 'd', ж: 'zh', э: 'e', я: 'ya', ч: 'ch',
      с: 's', м: 'm', и: 'i', т: 't', ь: '', б: 'b', ю: 'yu',
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

  private decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
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
    };
  }

  private mapProductPreview(product: Product & { category?: ProductCategory | null; images: ProductImage[] }): ProductListItemDto {
    return {
      id: product.id,
      name: product.name,
      sku: product.sku ?? null,
      categoryId: product.categoryId ?? null,
      categoryName: product.category?.name ?? null,
      previewImage: product.images[0]?.url ?? null,
      visible: product.visible,
      accruePoints: product.accruePoints,
      allowRedeem: product.allowRedeem,
      purchasesMonth: product.purchasesMonth,
      purchasesTotal: product.purchasesTotal,
    };
  }

  private mapProductDetailed(
    product: Product & {
      category?: ProductCategory | null;
      images: ProductImage[];
      variants: ProductVariant[];
      stocks: (ProductStock & { outlet?: Outlet | null })[];
    },
  ): ProductDto {
    const images = product.images
      .sort((a, b) => a.position - b.position)
      .map<ProductImageInputDto>((img, index) => ({ url: img.url, alt: img.alt ?? undefined, position: img.position ?? index }));
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
      redeemPercent: product.redeemPercent,
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
      mode: (json.mode as '24_7' | 'CUSTOM') || (entity.scheduleMode as '24_7' | 'CUSTOM') || 'CUSTOM',
      days,
    };
  }

  private mapOutlet(entity: Outlet): PortalOutletDto {
    return {
      id: entity.id,
      name: entity.name,
      address: entity.address ?? null,
      works: entity.status !== 'INACTIVE',
      hidden: entity.hidden,
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
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private async ensureCategoryOwnership(tx: Prisma.TransactionClient, merchantId: string, categoryId: string) {
    const category = await tx.productCategory.findFirst({ where: { id: categoryId, merchantId, deletedAt: null } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async ensureOutletOwnership(tx: Prisma.TransactionClient, merchantId: string, outletId: string) {
    const outlet = await tx.outlet.findFirst({ where: { id: outletId, merchantId } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }

  private async nextCategoryOrder(tx: Prisma.TransactionClient, merchantId: string) {
    const last = await tx.productCategory.findFirst({
      where: { merchantId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? 1000) + 10;
  }

  private async nextProductOrder(tx: Prisma.TransactionClient, merchantId: string) {
    const last = await tx.product.findFirst({
      where: { merchantId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? 1000) + 10;
  }

  // ===== Categories =====
  async listCategories(merchantId: string): Promise<CategoryDto[]> {
    const categories = await this.prisma.productCategory.findMany({
      where: { merchantId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map((category) => this.mapCategory(category));
  }

  async createCategory(merchantId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');
    const slug = dto.slug ? dto.slug.toLowerCase() : this.slugify(name);
    return this.prisma.$transaction(async (tx) => {
      if (dto.parentId) await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
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
          },
        });
        this.logger.log(JSON.stringify({ event: 'portal.catalog.category.create', merchantId, categoryId: created.id }));
        this.metrics.inc('portal_catalog_categories_changed_total', { action: 'create' });
        return this.mapCategory(created);
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new BadRequestException('Slug already exists');
        }
        throw error;
      }
    });
  }

  async updateCategory(merchantId: string, categoryId: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    return this.prisma.$transaction(async (tx) => {
      const category = await this.ensureCategoryOwnership(tx, merchantId, categoryId);
      const data: Prisma.ProductCategoryUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw new BadRequestException('Category name cannot be empty');
        data.name = name;
      }
      if (dto.slug !== undefined) {
        const slug = dto.slug.trim().toLowerCase();
        if (!/^[a-z0-9\-]+$/.test(slug)) throw new BadRequestException('Slug should contain latin letters, numbers or dash');
        data.slug = slug;
      }
      if (dto.description !== undefined) data.description = dto.description ?? null;
      if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl ?? null;
      if (dto.parentId !== undefined) {
        if (dto.parentId) {
          if (dto.parentId === categoryId) throw new BadRequestException('Category cannot reference itself');
          await this.ensureCategoryOwnership(tx, merchantId, dto.parentId);
          data.parent = { connect: { id: dto.parentId } };
        } else {
          data.parent = { disconnect: true };
        }
      }
      if (Object.keys(data).length === 0) return this.mapCategory(category);
      try {
        const updated = await tx.productCategory.update({ where: { id: categoryId }, data });
        this.logger.log(JSON.stringify({ event: 'portal.catalog.category.update', merchantId, categoryId }));
        this.metrics.inc('portal_catalog_categories_changed_total', { action: 'update' });
        return this.mapCategory(updated);
      } catch (error: any) {
        if (error?.code === 'P2002') throw new BadRequestException('Slug already exists');
        throw error;
      }
    });
  }

  async reorderCategories(merchantId: string, dto: ReorderCategoriesDto) {
    if (!dto.items?.length) return { ok: true, updated: 0 };
    const ids = dto.items.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      const categories = await tx.productCategory.findMany({ where: { id: { in: ids }, merchantId, deletedAt: null } });
      if (categories.length !== ids.length) throw new NotFoundException('One of categories not found');
      await Promise.all(
        dto.items.map((item) =>
          tx.productCategory.update({ where: { id: item.id }, data: { order: item.order } }),
        ),
      );
    });
    this.logger.log(JSON.stringify({ event: 'portal.catalog.category.reorder', merchantId, count: dto.items.length }));
    this.metrics.inc('portal_catalog_categories_changed_total', { action: 'reorder' });
    return { ok: true, updated: dto.items.length };
  }

  async deleteCategory(merchantId: string, categoryId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ensureCategoryOwnership(tx, merchantId, categoryId);
      await tx.productCategory.update({ where: { id: categoryId }, data: { deletedAt: new Date() } });
      await tx.product.updateMany({ where: { merchantId, categoryId }, data: { categoryId: null } });
    });
    this.logger.log(JSON.stringify({ event: 'portal.catalog.category.delete', merchantId, categoryId }));
    this.metrics.inc('portal_catalog_categories_changed_total', { action: 'delete' });
    return { ok: true };
  }

  // ===== Products =====
  async listProducts(merchantId: string, query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    const where: Prisma.ProductWhereInput = { merchantId, deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status === 'visible') where.visible = true;
    if (query.status === 'hidden') where.visible = false;
    if (query.points === 'with_points') where.accruePoints = true;
    if (query.points === 'without_points') where.accruePoints = false;
    if (query.search) {
      const term = query.search.trim();
      if (term) {
        const and: Prisma.ProductWhereInput[] = [];
        if (where.AND) and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
        and.push({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
          ],
        });
        where.AND = and;
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { category: true, images: { orderBy: { position: 'asc' } } },
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
    const hasVariants = dto.hasVariants ?? (dto.variants?.length ? true : false);
    const priceEnabled = dto.priceEnabled !== undefined ? dto.priceEnabled : true;
    const allowCart = dto.disableCart ? false : true;
    return {
      merchant: { connect: { id: merchantId } },
      name: dto.name.trim(),
      sku: dto.sku ? dto.sku.trim() : null,
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
      category: opts.categoryId ? { connect: { id: opts.categoryId } } : undefined,
      images: dto.images?.length
        ? {
            create: dto.images.map((img, index) => ({
              url: img.url,
              alt: img.alt ?? null,
              position: img.position ?? index,
            })),
          }
        : undefined,
      variants: hasVariants && dto.variants?.length
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
              outlet: stock.outletId ? { connect: { id: stock.outletId } } : undefined,
              price: this.toDecimal(stock.price),
              balance: this.toDecimal(stock.balance),
              currency: stock.currency ?? 'RUB',
            })),
          }
        : undefined,
    };
  }

  async createProduct(merchantId: string, dto: CreateProductDto): Promise<ProductDto> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Product name is required');
    return this.prisma.$transaction(async (tx) => {
      if (dto.categoryId) await this.ensureCategoryOwnership(tx, merchantId, dto.categoryId);
      if (dto.stocks) {
        for (const stock of dto.stocks) {
          if (stock.outletId) await this.ensureOutletOwnership(tx, merchantId, stock.outletId);
        }
      }
      const order = dto.order ?? (await this.nextProductOrder(tx, merchantId));
      const data = this.prepareProductCreateData(merchantId, { ...dto, order }, { categoryId: dto.categoryId ?? null });
      const created = await tx.product.create({
        data,
        include: {
          category: true,
          images: { orderBy: { position: 'asc' } },
          variants: { orderBy: { position: 'asc' } },
          stocks: { include: { outlet: true } },
        },
      });
      this.logger.log(JSON.stringify({ event: 'portal.catalog.product.create', merchantId, productId: created.id }));
      this.metrics.inc('portal_catalog_products_changed_total', { action: 'create' });
      return this.mapProductDetailed(created);
    });
  }

  async updateProduct(merchantId: string, productId: string, dto: UpdateProductDto): Promise<ProductDto> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, merchantId, deletedAt: null } });
      if (!product) throw new NotFoundException('Product not found');
      if (dto.categoryId !== undefined) {
        if (dto.categoryId) await this.ensureCategoryOwnership(tx, merchantId, dto.categoryId);
      }
      if (dto.stocks) {
        for (const stock of dto.stocks) {
          if (stock.outletId) await this.ensureOutletOwnership(tx, merchantId, stock.outletId);
        }
      }
      const data: Prisma.ProductUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw new BadRequestException('Product name cannot be empty');
        data.name = name;
      }
      if (dto.sku !== undefined) data.sku = dto.sku ? dto.sku.trim() : null;
      if (dto.description !== undefined) data.description = dto.description ?? null;
      if (dto.order !== undefined) data.order = dto.order;
      if (dto.iikoProductId !== undefined) data.iikoProductId = dto.iikoProductId ?? null;
      if (dto.hasVariants !== undefined) data.hasVariants = dto.hasVariants;
      if (dto.priceEnabled !== undefined) data.priceEnabled = dto.priceEnabled;
      const priceEnabled = dto.priceEnabled !== undefined ? dto.priceEnabled : product.priceEnabled;
      if (dto.price !== undefined || dto.priceEnabled !== undefined) {
        const price = dto.price !== undefined ? dto.price : this.decimalToNumber(product.price);
        data.price = priceEnabled ? this.toDecimal(price ?? 0) : null;
      }
      if (dto.disableCart !== undefined) data.allowCart = !dto.disableCart;
      if (dto.visible !== undefined) data.visible = dto.visible;
      if (dto.accruePoints !== undefined) data.accruePoints = dto.accruePoints;
      if (dto.allowRedeem !== undefined) data.allowRedeem = dto.allowRedeem;
      if (dto.redeemPercent !== undefined) data.redeemPercent = this.clampPercent(dto.redeemPercent, product.redeemPercent);
      if (dto.weightValue !== undefined) data.weightValue = this.toDecimal(dto.weightValue);
      if (dto.weightUnit !== undefined) data.weightUnit = dto.weightUnit ?? null;
      if (dto.heightCm !== undefined) data.heightCm = this.toDecimal(dto.heightCm);
      if (dto.widthCm !== undefined) data.widthCm = this.toDecimal(dto.widthCm);
      if (dto.depthCm !== undefined) data.depthCm = this.toDecimal(dto.depthCm);
      if (dto.proteins !== undefined) data.proteins = this.toDecimal(dto.proteins);
      if (dto.fats !== undefined) data.fats = this.toDecimal(dto.fats);
      if (dto.carbs !== undefined) data.carbs = this.toDecimal(dto.carbs);
      if (dto.calories !== undefined) data.calories = this.toDecimal(dto.calories);
      if (dto.tags !== undefined) data.tags = dto.tags;
      if (dto.categoryId !== undefined) {
        data.category = dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true };
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
      const hasVariants = dto.hasVariants !== undefined ? dto.hasVariants : product.hasVariants;
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
        },
      });
      if (!updated) throw new NotFoundException('Product not found');
      this.logger.log(JSON.stringify({ event: 'portal.catalog.product.update', merchantId, productId }));
      this.metrics.inc('portal_catalog_products_changed_total', { action: 'update' });
      return this.mapProductDetailed(updated);
    });
  }

  async deleteProduct(merchantId: string, productId: string) {
    const updated = await this.prisma.product.updateMany({
      where: { id: productId, merchantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundException('Product not found');
    this.logger.log(JSON.stringify({ event: 'portal.catalog.product.delete', merchantId, productId }));
    this.metrics.inc('portal_catalog_products_changed_total', { action: 'delete' });
    return { ok: true };
  }

  async bulkProductAction(merchantId: string, dto: ProductBulkActionDto) {
    const ids = dto.ids || [];
    if (!ids.length) return { ok: true, updated: 0 };
    if (dto.action === ProductBulkAction.DELETE) {
      const result = await this.prisma.product.updateMany({
        where: { id: { in: ids }, merchantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      this.logger.log(JSON.stringify({ event: 'portal.catalog.product.bulk', merchantId, action: dto.action, updated: result.count }));
      this.metrics.inc('portal_catalog_products_changed_total', { action: 'bulk_delete' });
      return { ok: true, updated: result.count };
    }
    const patch = BULK_ACTION_MAP[dto.action];
    const result = await this.prisma.product.updateMany({
      where: { id: { in: ids }, merchantId, deletedAt: null },
      data: patch,
    });
    this.logger.log(JSON.stringify({ event: 'portal.catalog.product.bulk', merchantId, action: dto.action, updated: result.count }));
    this.metrics.inc('portal_catalog_products_changed_total', { action: dto.action });
    return { ok: true, updated: result.count };
  }

  // ===== Outlets =====
  async listOutlets(merchantId: string, status?: 'active' | 'inactive' | 'all', search?: string): Promise<PortalOutletListResponseDto> {
    const where: Prisma.OutletWhereInput = { merchantId };
    if (status === 'active') where.status = 'ACTIVE';
    if (status === 'inactive') where.status = 'INACTIVE';
    if (search) {
      const term = search.trim();
      if (term) {
        const and: Prisma.OutletWhereInput[] = [];
        if (where.AND) and.push(...(Array.isArray(where.AND) ? where.AND : [where.AND]));
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
      this.prisma.outlet.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.outlet.count({ where }),
    ]);
    return { items: items.map((outlet) => this.mapOutlet(outlet)), total };
  }

  async getOutlet(merchantId: string, outletId: string): Promise<PortalOutletDto> {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, merchantId } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return this.mapOutlet(outlet);
  }

  async createOutlet(merchantId: string, dto: CreatePortalOutletDto): Promise<PortalOutletDto> {
    const name = dto.name?.trim();
    const address = dto.address?.trim();
    if (!name) throw new BadRequestException('Outlet name is required');
    if (!address) throw new BadRequestException('Outlet address is required');
    const scheduleEnabled = dto.showSchedule ?? false;
    const schedule = dto.schedule && scheduleEnabled ? dto.schedule : { mode: 'CUSTOM', days: [] };
    try {
      const created = await this.prisma.outlet.create({
        data: {
          merchantId,
          name,
          address,
          status: dto.works ? 'ACTIVE' : 'INACTIVE',
          hidden: dto.hidden ?? false,
          description: dto.description ?? null,
          phone: dto.phone ?? null,
          adminEmails: dto.adminEmails?.map((email) => email.trim()).filter(Boolean) ?? [],
          timezone: dto.timezone ?? null,
          scheduleEnabled,
          scheduleMode: schedule.mode,
          scheduleJson: scheduleEnabled
            ? (schedule as unknown as Prisma.InputJsonValue)
            : (Prisma.DbNull as Prisma.NullableJsonNullValueInput),
          externalId: dto.externalId?.trim() ?? null,
          manualLocation: dto.manualLocation ?? false,
          latitude: this.toDecimal(dto.latitude),
          longitude: this.toDecimal(dto.longitude),
        },
      });
      this.logger.log(JSON.stringify({ event: 'portal.outlet.create', merchantId, outletId: created.id }));
      this.metrics.inc('portal_outlets_changed_total', { action: 'create' });
      return this.mapOutlet(created);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Outlet with this externalId already exists');
      throw error;
    }
  }

  async updateOutlet(merchantId: string, outletId: string, dto: UpdatePortalOutletDto): Promise<PortalOutletDto> {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, merchantId } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const data: Prisma.OutletUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Outlet name cannot be empty');
      data.name = name;
    }
    if (dto.address !== undefined) {
      const address = dto.address.trim();
      if (!address) throw new BadRequestException('Outlet address cannot be empty');
      data.address = address;
    }
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone ?? null;
    if (dto.adminEmails !== undefined) {
      data.adminEmails = dto.adminEmails?.map((email) => email.trim()).filter(Boolean) ?? [];
    }
    if (dto.timezone !== undefined) data.timezone = dto.timezone ?? null;
    if (dto.works !== undefined) data.status = dto.works ? 'ACTIVE' : 'INACTIVE';
    if (dto.hidden !== undefined) data.hidden = dto.hidden;
    if (dto.manualLocation !== undefined) data.manualLocation = dto.manualLocation;
    if (dto.latitude !== undefined) data.latitude = this.toDecimal(dto.latitude);
    if (dto.longitude !== undefined) data.longitude = this.toDecimal(dto.longitude);
    if (dto.externalId !== undefined) data.externalId = dto.externalId?.trim() || null;
    const showSchedule = dto.showSchedule !== undefined ? dto.showSchedule : outlet.scheduleEnabled;
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
      const updated = await this.prisma.outlet.update({ where: { id: outletId }, data });
      this.logger.log(JSON.stringify({ event: 'portal.outlet.update', merchantId, outletId }));
      this.metrics.inc('portal_outlets_changed_total', { action: 'update' });
      return this.mapOutlet(updated);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new BadRequestException('Outlet with this externalId already exists');
      throw error;
    }
  }
}
