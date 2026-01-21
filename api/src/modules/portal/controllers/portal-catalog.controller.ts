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
import { UpdateOutletStatusDto } from '../../merchants/dto';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalCatalogUseCase } from '../use-cases/portal-catalog.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCatalogController {
  constructor(private readonly useCase: PortalCatalogUseCase) {}

  // Catalog — Categories
  @Get('catalog/categories')
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  listCatalogCategories(@Req() req: PortalRequest) {
    return this.useCase.listCatalogCategories(req);
  }

  @Post('catalog/categories')
  @ApiOkResponse({ type: CategoryDto })
  createCatalogCategory(
    @Req() req: PortalRequest,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.useCase.createCatalogCategory(req, dto);
  }

  @Put('catalog/categories/:categoryId')
  @ApiOkResponse({ type: CategoryDto })
  updateCatalogCategory(
    @Req() req: PortalRequest,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.useCase.updateCatalogCategory(req, categoryId, dto);
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
    return this.useCase.reorderCatalogCategories(req, dto);
  }

  @Delete('catalog/categories/:categoryId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogCategory(
    @Req() req: PortalRequest,
    @Param('categoryId') categoryId: string,
  ) {
    return this.useCase.deleteCatalogCategory(req, categoryId);
  }

  // Catalog — Products
  @Get('catalog/products')
  @ApiOkResponse({ type: ProductListResponseDto })
  listCatalogProducts(
    @Req() req: PortalRequest,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.useCase.listCatalogProducts(req, query);
  }

  @Get('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  getCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
  ) {
    return this.useCase.getCatalogProduct(req, productId);
  }

  @Post('catalog/products')
  @ApiOkResponse({ type: ProductDto })
  createCatalogProduct(
    @Req() req: PortalRequest,
    @Body() dto: CreateProductDto,
  ) {
    return this.useCase.createCatalogProduct(req, dto);
  }

  @Put('catalog/products/:productId')
  @ApiOkResponse({ type: ProductDto })
  updateCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.useCase.updateCatalogProduct(req, productId, dto);
  }

  @Delete('catalog/products/:productId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteCatalogProduct(
    @Req() req: PortalRequest,
    @Param('productId') productId: string,
  ) {
    return this.useCase.deleteCatalogProduct(req, productId);
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
    return this.useCase.bulkCatalogProducts(req, dto);
  }

  @Post('catalog/import/commerce-ml')
  importCommerceMl(@Req() req: PortalRequest, @Body() dto: ImportCatalogDto) {
    return this.useCase.importCommerceMl(req, dto);
  }

  @Post('catalog/import/moysklad')
  importMoySklad(@Req() req: PortalRequest, @Body() dto: ImportCatalogDto) {
    return this.useCase.importMoySklad(req, dto);
  }

  // Outlets
  @Get('outlets')
  @ApiOkResponse({ type: PortalOutletListResponseDto })
  listOutlets(
    @Req() req: PortalRequest,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('search') search?: string,
  ) {
    return this.useCase.listOutlets(req, status, search);
  }

  @Get('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  getOutlet(@Req() req: PortalRequest, @Param('outletId') outletId: string) {
    return this.useCase.getOutlet(req, outletId);
  }

  @Post('outlets')
  @ApiOkResponse({ type: PortalOutletDto })
  createOutlet(@Req() req: PortalRequest, @Body() dto: CreatePortalOutletDto) {
    return this.useCase.createOutlet(req, dto);
  }

  @Put('outlets/:outletId')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutlet(
    @Req() req: PortalRequest,
    @Param('outletId') outletId: string,
    @Body() dto: UpdatePortalOutletDto,
  ) {
    return this.useCase.updateOutlet(req, outletId, dto);
  }

  @Delete('outlets/:outletId')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  deleteOutlet(@Req() req: PortalRequest, @Param('outletId') outletId: string) {
    return this.useCase.deleteOutlet(req, outletId);
  }

  @Put('outlets/:outletId/status')
  @ApiOkResponse({ type: PortalOutletDto })
  updateOutletStatus(
    @Req() req: PortalRequest,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletStatusDto,
  ) {
    return this.useCase.updateOutletStatus(req, outletId, dto);
  }
}
