import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const DEVICE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/;

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() imageUrl?: string | null;
  @ApiPropertyOptional() parentId?: string | null;
  @ApiProperty() order!: number;
  @ApiProperty() status!: 'ACTIVE' | 'ARCHIVED';
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({
    description: 'Если не указан — будет сгенерирован из name',
  })
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';
  @ApiPropertyOptional({ type: () => [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignProductIds?: string[];
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({ type: () => [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unassignProductIds?: string[];
}

export class ReorderCategoryDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsInt() order!: number;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: () => [ReorderCategoryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryDto)
  items!: ReorderCategoryDto[];
}

export class ProductImageInputDto {
  @ApiProperty() @IsString() url!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

export class ProductVariantInputDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

export class ProductStockInputDto {
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  balance?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateProductDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;
  @ApiPropertyOptional({ description: 'Штрихкод' })
  @IsOptional()
  @IsString()
  barcode?: string;
  @ApiPropertyOptional({ description: 'Единица измерения (шт, кг и т.п.)' })
  @IsOptional()
  @IsString()
  unit?: string;
  @ApiPropertyOptional({
    description: 'Провайдер внешней системы (iiko, r_keeper, MoySklad и т.п.)',
  })
  @IsOptional()
  @IsString()
  externalProvider?: string;
  @ApiPropertyOptional({ description: 'Внешний ID товара' })
  @IsOptional()
  @IsString()
  externalId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({
    description: 'Позиция в каталоге (чем меньше, тем выше)',
  })
  @IsOptional()
  @IsInt()
  order?: number;
  @ApiPropertyOptional({
    description: 'ID связанного товара в iiko (или другой системе)',
  })
  @IsOptional()
  @IsString()
  iikoProductId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priceEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
  @ApiPropertyOptional({
    description:
      'Тумблер «Запретить добавление в корзину» (false = можно добавлять)',
  })
  @IsOptional()
  @IsBoolean()
  disableCart?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accruePoints?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRedeem?: boolean;
  @ApiPropertyOptional({ description: 'Процент оплаты баллами 0..100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  redeemPercent?: number;
  @ApiPropertyOptional({ description: 'Вес' })
  @IsOptional()
  @IsNumber()
  weightValue?: number;
  @ApiPropertyOptional({ description: 'Единица измерения веса (г/кг)' })
  @IsOptional()
  @IsString()
  weightUnit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  heightCm?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  widthCm?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  depthCm?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  proteins?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fats?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  carbs?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  calories?: number;
  @ApiPropertyOptional({ type: () => [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional({ type: () => [ProductImageInputDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
  @ApiPropertyOptional({ type: () => [ProductVariantInputDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];
  @ApiPropertyOptional({ type: () => [ProductStockInputDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductStockInputDto)
  stocks?: ProductStockInputDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() categoryId?: string | null;
  @ApiPropertyOptional() categoryName?: string | null;
  @ApiPropertyOptional() previewImage?: string | null;
  @ApiProperty() accruePoints!: boolean;
  @ApiProperty() allowRedeem!: boolean;
  @ApiProperty() redeemPercent!: number;
  @ApiProperty() purchasesMonth!: number;
  @ApiProperty() purchasesTotal!: number;
  @ApiPropertyOptional() externalId?: string | null;
}

export class ProductDto extends ProductListItemDto {
  @ApiProperty() order!: number;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() iikoProductId?: string | null;
  @ApiProperty() hasVariants!: boolean;
  @ApiProperty() priceEnabled!: boolean;
  @ApiPropertyOptional() price?: number | null;
  @ApiProperty() disableCart!: boolean;
  @ApiPropertyOptional() weightValue?: number | null;
  @ApiPropertyOptional() weightUnit?: string | null;
  @ApiPropertyOptional() heightCm?: number | null;
  @ApiPropertyOptional() widthCm?: number | null;
  @ApiPropertyOptional() depthCm?: number | null;
  @ApiPropertyOptional() proteins?: number | null;
  @ApiPropertyOptional() fats?: number | null;
  @ApiPropertyOptional() carbs?: number | null;
  @ApiPropertyOptional() calories?: number | null;
  @ApiProperty({ type: () => [String] }) tags!: string[];
  @ApiProperty({ type: () => [ProductImageInputDto] })
  images!: ProductImageInputDto[];
  @ApiProperty({ type: () => [ProductVariantInputDto] })
  variants!: ProductVariantInputDto[];
  @ApiProperty({ type: () => [ProductStockInputDto] })
  stocks!: ProductStockInputDto[];
}

export class ProductListResponseDto {
  @ApiProperty({ type: () => [ProductListItemDto] })
  items!: ProductListItemDto[];
  @ApiProperty() total!: number;
}

export enum ProductBulkAction {
  ALLOW_REDEEM = 'allow_redeem',
  FORBID_REDEEM = 'forbid_redeem',
  DELETE = 'delete',
}

export class ProductBulkActionDto {
  @ApiProperty({ enum: ProductBulkAction })
  @IsEnum(ProductBulkAction)
  action!: ProductBulkAction;
  @ApiProperty({ type: () => [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

export class ListProductsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
  @ApiPropertyOptional({ enum: ['with_points', 'without_points', 'all'] })
  @IsOptional()
  @IsIn(['with_points', 'without_points', 'all'])
  points?: 'with_points' | 'without_points' | 'all';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
  @ApiPropertyOptional({ description: 'Фильтр по внешнему ID товара' })
  @IsOptional()
  @IsString()
  externalId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offset?: string;
}

export class CreatePortalDeviceDto {
  @ApiProperty({
    description: 'Идентификатор устройства (латиница/цифры/._-)',
    minLength: 2,
    maxLength: 64,
  })
  @IsString()
  @Matches(DEVICE_CODE_PATTERN)
  code!: string;
}

export class PortalDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreatePortalOutletDto {
  @ApiProperty() @IsBoolean() works!: boolean;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ type: () => [CreatePortalDeviceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePortalDeviceDto)
  devices?: CreatePortalDeviceDto[];
  @ApiPropertyOptional({
    description: 'Ссылки на карточки отзывов по площадкам',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
  })
  @IsOptional()
  reviewsShareLinks?: Record<string, string | null>;
}

export class UpdatePortalOutletDto extends PartialType(CreatePortalOutletDto) {}

export class PortalOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() works!: boolean;
  @ApiPropertyOptional() staffCount?: number;
  @ApiProperty({ type: () => [PortalDeviceDto] })
  devices!: PortalDeviceDto[];
  @ApiPropertyOptional({
    description: 'Ссылки на карточки отзывов по площадкам',
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    nullable: true,
  })
  reviewsShareLinks?: {
    yandex?: string | null;
    twogis?: string | null;
    google?: string | null;
  } | null;
}

export class PortalOutletListResponseDto {
  @ApiProperty({ type: () => [PortalOutletDto] }) items!: PortalOutletDto[];
  @ApiProperty() total!: number;
}

export class ImportProductDto {
  @ApiProperty() @IsString() externalId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
}

export class ImportCatalogDto {
  @ApiPropertyOptional({
    description: 'Провайдер внешней системы (будет переопределён роутом)',
  })
  @IsOptional()
  @IsString()
  externalProvider?: string;
  @ApiProperty({ type: () => [ImportProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductDto)
  products!: ImportProductDto[];
}
