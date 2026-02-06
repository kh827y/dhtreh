import { Injectable } from '@nestjs/common';
import { PortalCatalogService } from '../services/catalog.service';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  ProductListResponseDto,
  ProductDto,
  ListProductsQueryDto,
  ProductBulkActionDto,
  PortalOutletListResponseDto,
  PortalOutletDto,
  CreatePortalOutletDto,
  UpdatePortalOutletDto,
  ImportCatalogDto,
} from '../dto/catalog.dto';
import { MerchantsService } from '../../merchants/merchants.service';
import { UpdateOutletStatusDto } from '../../merchants/dto';
import type { PortalRequest } from '../portal.types';
import { PortalRequestHelper } from '../helpers/portal-request.helper';

@Injectable()
export class PortalCatalogUseCase {
  constructor(
    private readonly catalog: PortalCatalogService,
    private readonly merchants: MerchantsService,
    private readonly helpers: PortalRequestHelper,
  ) {}

  listCatalogCategories(req: PortalRequest): Promise<CategoryDto[]> {
    return this.catalog.listCategories(this.helpers.getMerchantId(req));
  }

  createCatalogCategory(
    req: PortalRequest,
    dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.catalog.createCategory(this.helpers.getMerchantId(req), dto);
  }

  updateCatalogCategory(
    req: PortalRequest,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.catalog.updateCategory(
      this.helpers.getMerchantId(req),
      categoryId,
      dto,
    );
  }

  deleteCatalogCategory(
    req: PortalRequest,
    categoryId: string,
  ): Promise<{ ok: boolean }> {
    return this.catalog.deleteCategory(
      this.helpers.getMerchantId(req),
      categoryId,
    );
  }

  listCatalogProducts(
    req: PortalRequest,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    return this.catalog.listProducts(this.helpers.getMerchantId(req), query);
  }

  getCatalogProduct(
    req: PortalRequest,
    productId: string,
  ): Promise<ProductDto> {
    return this.catalog.getProduct(this.helpers.getMerchantId(req), productId);
  }

  createCatalogProduct(
    req: PortalRequest,
    dto: CreateProductDto,
  ): Promise<ProductDto> {
    return this.catalog.createProduct(this.helpers.getMerchantId(req), dto);
  }

  updateCatalogProduct(
    req: PortalRequest,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.catalog.updateProduct(
      this.helpers.getMerchantId(req),
      productId,
      dto,
    );
  }

  deleteCatalogProduct(
    req: PortalRequest,
    productId: string,
  ): Promise<{ ok: boolean }> {
    return this.catalog.deleteProduct(
      this.helpers.getMerchantId(req),
      productId,
    );
  }

  bulkCatalogProducts(
    req: PortalRequest,
    dto: ProductBulkActionDto,
  ): Promise<{ ok: boolean; updated: number }> {
    return this.catalog.bulkProductAction(this.helpers.getMerchantId(req), dto);
  }

  importCommerceMl(req: PortalRequest, dto: ImportCatalogDto) {
    return this.catalog.importCatalog(
      this.helpers.getMerchantId(req),
      'COMMERCE_ML',
      dto,
    );
  }

  importMoySklad(req: PortalRequest, dto: ImportCatalogDto) {
    return this.catalog.importCatalog(
      this.helpers.getMerchantId(req),
      'MOYSKLAD',
      dto,
    );
  }

  listOutlets(
    req: PortalRequest,
    status?: 'active' | 'inactive' | 'all',
    search?: string,
    pageStr?: string,
    pageSizeStr?: string,
  ): Promise<PortalOutletListResponseDto> {
    const rawStatus =
      typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalized: 'active' | 'inactive' | 'all' =
      rawStatus === 'active'
        ? 'active'
        : rawStatus === 'inactive'
          ? 'inactive'
          : 'all';
    const rawPage = Number.parseInt(String(pageStr ?? ''), 10);
    const rawPageSize = Number.parseInt(String(pageSizeStr ?? ''), 10);
    const pagination =
      Number.isFinite(rawPage) || Number.isFinite(rawPageSize)
        ? {
            page: Number.isFinite(rawPage) ? rawPage : undefined,
            pageSize: Number.isFinite(rawPageSize) ? rawPageSize : undefined,
          }
        : undefined;
    return this.catalog.listOutlets(
      this.helpers.getMerchantId(req),
      normalized,
      search,
      pagination,
    );
  }

  getOutlet(req: PortalRequest, outletId: string): Promise<PortalOutletDto> {
    return this.catalog.getOutlet(this.helpers.getMerchantId(req), outletId);
  }

  createOutlet(
    req: PortalRequest,
    dto: CreatePortalOutletDto,
  ): Promise<PortalOutletDto> {
    return this.catalog.createOutlet(this.helpers.getMerchantId(req), dto);
  }

  updateOutlet(
    req: PortalRequest,
    outletId: string,
    dto: UpdatePortalOutletDto,
  ): Promise<PortalOutletDto> {
    return this.catalog.updateOutlet(
      this.helpers.getMerchantId(req),
      outletId,
      dto,
    );
  }

  deleteOutlet(req: PortalRequest, outletId: string) {
    return this.merchants.deleteOutlet(
      this.helpers.getMerchantId(req),
      outletId,
    );
  }

  updateOutletStatus(
    req: PortalRequest,
    outletId: string,
    dto: UpdateOutletStatusDto,
  ): Promise<PortalOutletDto> {
    const merchantId = this.helpers.getMerchantId(req);
    return this.merchants
      .updateOutletStatus(merchantId, outletId, dto.status)
      .then(() => this.catalog.getOutlet(merchantId, outletId));
  }
}
