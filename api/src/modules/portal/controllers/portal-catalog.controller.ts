import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { PortalCatalogService } from '../services/catalog.service';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
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
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCatalogController {
  constructor(
    private readonly catalog: PortalCatalogService,
    private readonly merchants: MerchantsService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // Catalog — Categories
  @Get('catalog/categories')
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  listCatalogCategories(@Req() req: PortalRequest) {
    return this.catalog.listCategories(this.helpers.getMerchantId(req));
  }

  @Post('catalog/categories')
  @ApiOkResponse({ type: CategoryDto })
  createCatalogCategory(
    @Req() req: PortalRequest,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalog.createCategory(this.helpers.getMerchantId(req), dto);
  }

  @Put('catalog/categories/:categoryId')
  @ApiOkResponse({ type: CategoryDto })
  updateCatalogCategory(
    @Req() req: PortalRequest,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(
      this.helpers.getMerchantId(req),
      categoryId,
      dto,
    );
  }

  @Post('catalog/categories/reorder')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, updated: { type: 'number' } },
    },
  })
  reorderCatalogCategories(
    @Req() req: PortalRequest,
    @Body() dto: ReorderCategoriesDto,
  ) {
    return this.catalog.reorderCategories(this.helpers.getMerchantId(req), dto);
  }

  @Delete('catalog/categories/:categoryId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogCategory(
    @Req() req: PortalRequest,
    @Param('categoryId') categoryId: string,
  ) {
    return this.catalog.deleteCategory(this.helpers.getMerchantId(req), categoryId);
  }

  // Catalog — Products
  @Get('catalog/products')
  @ApiOkResponse({ type: ProductListResponseDto })
  listCatalogProducts(
    @Req() req: PortalRequest,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.catalog.listProducts(this.helpers.getMerchantId(req), query);
  }

  @Get('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  getCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
  ) {
    return this.catalog.getProduct(this.helpers.getMerchantId(req), productId);
  }

  @Post('catalog/products')
  @ApiOkResponse({ type: ProductDto })
  createCatalogProduct(
    @Req() req: PortalRequest,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalog.createProduct(this.helpers.getMerchantId(req), dto);
  }

  @Put('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  updateCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(
      this.helpers.getMerchantId(req),
      productId,
      dto,
    );
  }

  @Delete('catalog/products/:productId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
  ) {
    return this.catalog.deleteProduct(this.helpers.getMerchantId(req), productId);
  }

  @Post('catalog/products/bulk')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, updated: { type: 'number' } },
    },
  })
  bulkCatalogProducts(
    @Req() req: PortalRequest,
    @Body() dto: ProductBulkActionDto,
  ) {
    return this.catalog.bulkProductAction(this.helpers.getMerchantId(req), dto);
  }

  @Post('catalog/import/commerce-ml')
  importCommerceMl(@Req() req: PortalRequest, @Body() dto: ImportCatalogDto) {
    return this.catalog.importCatalog(
      this.helpers.getMerchantId(req),
      'COMMERCE_ML',
      dto,
    );
  }

  @Post('catalog/import/moysklad')
  importMoySklad(@Req() req: PortalRequest, @Body() dto: ImportCatalogDto) {
    return this.catalog.importCatalog(
      this.helpers.getMerchantId(req),
      'MOYSKLAD',
      dto,
    );
  }

  // Outlets
  @Get('outlets')
  @ApiOkResponse({ type: PortalOutletListResponseDto })
  listOutlets(
    @Req() req: PortalRequest,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('search') search?: string,
  ) {
    const rawStatus =
      typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalized: 'active' | 'inactive' | 'all' =
      rawStatus === 'active'
        ? 'active'
        : rawStatus === 'inactive'
          ? 'inactive'
          : 'all';
    return this.catalog.listOutlets(
      this.helpers.getMerchantId(req),
      normalized,
      search,
    );
  }

  @Get('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  getOutlet(@Req() req: PortalRequest, @Param('outletId') outletId: string) {
    return this.catalog.getOutlet(this.helpers.getMerchantId(req), outletId);
  }

  @Post('outlets')
  @ApiOkResponse({ type: PortalOutletDto })
  createOutlet(@Req() req: PortalRequest, @Body() dto: CreatePortalOutletDto) {
    return this.catalog.createOutlet(this.helpers.getMerchantId(req), dto);
  }

  @Put('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutlet(
    @Req() req: PortalRequest,
    @Param('outletId') outletId: string,
    @Body() dto: UpdatePortalOutletDto,
  ) {
    return this.catalog.updateOutlet(
      this.helpers.getMerchantId(req),
      outletId,
      dto,
    );
  }

  @Delete('outlets/:outletId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteOutlet(@Req() req: PortalRequest, @Param('outletId') outletId: string) {
    return this.merchants.deleteOutlet(this.helpers.getMerchantId(req), outletId);
  }

  @Put('outlets/:outletId/status')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutletStatus(
    @Req() req: PortalRequest,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletStatusDto,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.merchants
      .updateOutletStatus(merchantId, outletId, dto.status)
      .then(() => this.catalog.getOutlet(merchantId, outletId));
  }
}
