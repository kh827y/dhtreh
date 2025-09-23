import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() imageUrl?: string | null;
  @ApiPropertyOptional() parentId?: string | null;
  @ApiProperty() order!: number;
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ description: 'Если не указан — будет сгенерирован из name' })
  @IsOptional() @Matches(/^[a-z0-9\-]+$/)
  slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  parentId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

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
  @ApiPropertyOptional() @IsOptional() @IsString()
  alt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt()
  position?: number;
}

export class ProductVariantInputDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt()
  position?: number;
}

export class ProductStockInputDto {
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  outletId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  price?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  balance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString()
  currency?: string;
}

export class CreateProductDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;
  @ApiPropertyOptional({ description: 'Позиция в каталоге (чем меньше, тем выше)' })
  @IsOptional() @IsInt()
  order?: number;
  @ApiPropertyOptional({ description: 'ID связанного товара в iiko (или другой системе)' })
  @IsOptional() @IsString()
  iikoProductId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  hasVariants?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  priceEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  price?: number;
  @ApiPropertyOptional({ description: 'Тумблер «Запретить добавление в корзину» (false = можно добавлять)' })
  @IsOptional() @IsBoolean()
  disableCart?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  accruePoints?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  allowRedeem?: boolean;
  @ApiPropertyOptional({ description: 'Процент оплаты баллами 0..100' })
  @IsOptional() @IsInt() @Min(0) @Max(100)
  redeemPercent?: number;
  @ApiPropertyOptional({ description: 'Вес' })
  @IsOptional() @IsNumber()
  weightValue?: number;
  @ApiPropertyOptional({ description: 'Единица измерения веса (г/кг)' })
  @IsOptional() @IsString()
  weightUnit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  heightCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  widthCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  depthCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  proteins?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  fats?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  carbs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  calories?: number;
  @ApiPropertyOptional({ type: () => [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
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
  @ApiPropertyOptional() sku?: string | null;
  @ApiPropertyOptional() categoryId?: string | null;
  @ApiPropertyOptional() categoryName?: string | null;
  @ApiPropertyOptional() previewImage?: string | null;
  @ApiProperty() visible!: boolean;
  @ApiProperty() accruePoints!: boolean;
  @ApiProperty() allowRedeem!: boolean;
  @ApiProperty() purchasesMonth!: number;
  @ApiProperty() purchasesTotal!: number;
}

export class ProductDto extends ProductListItemDto {
  @ApiProperty() order!: number;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() iikoProductId?: string | null;
  @ApiProperty() hasVariants!: boolean;
  @ApiProperty() priceEnabled!: boolean;
  @ApiPropertyOptional() price?: number | null;
  @ApiProperty() disableCart!: boolean;
  @ApiProperty() redeemPercent!: number;
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
  @ApiProperty({ type: () => [ProductImageInputDto] }) images!: ProductImageInputDto[];
  @ApiProperty({ type: () => [ProductVariantInputDto] }) variants!: ProductVariantInputDto[];
  @ApiProperty({ type: () => [ProductStockInputDto] }) stocks!: ProductStockInputDto[];
}

export class ProductListResponseDto {
  @ApiProperty({ type: () => [ProductListItemDto] }) items!: ProductListItemDto[];
  @ApiProperty() total!: number;
}

export enum ProductBulkAction {
  SHOW = 'show',
  HIDE = 'hide',
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
  @ApiPropertyOptional() @IsOptional() @IsString()
  categoryId?: string;
  @ApiPropertyOptional({ enum: ['visible', 'hidden', 'all'] })
  @IsOptional() @IsIn(['visible', 'hidden', 'all'])
  status?: 'visible' | 'hidden' | 'all';
  @ApiPropertyOptional({ enum: ['with_points', 'without_points', 'all'] })
  @IsOptional() @IsIn(['with_points', 'without_points', 'all'])
  points?: 'with_points' | 'without_points' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;
}

export class OutletScheduleDayDto {
  @ApiProperty({ description: 'mon/tue/.../sun' })
  @IsString()
  day!: string;
  @ApiProperty() @IsBoolean()
  enabled!: boolean;
  @ApiPropertyOptional({ description: 'Формат HH:mm' })
  @IsOptional() @IsString()
  from?: string;
  @ApiPropertyOptional({ description: 'Формат HH:mm' })
  @IsOptional() @IsString()
  to?: string;
}

export class OutletScheduleDto {
  @ApiProperty({ enum: ['24_7', 'CUSTOM'] })
  @IsIn(['24_7', 'CUSTOM'])
  mode!: '24_7' | 'CUSTOM';
  @ApiProperty({ type: () => [OutletScheduleDayDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutletScheduleDayDto)
  days!: OutletScheduleDayDto[];
}

export class CreatePortalOutletDto {
  @ApiProperty() @IsBoolean() works!: boolean;
  @ApiProperty() @IsBoolean() hidden!: boolean;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;
  @ApiProperty() @IsString() address!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  manualLocation?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber()
  longitude?: number;
  @ApiPropertyOptional({ type: () => [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  adminEmails?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString()
  timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  showSchedule?: boolean;
  @ApiPropertyOptional({ type: () => OutletScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutletScheduleDto)
  schedule?: OutletScheduleDto;
  @ApiProperty() @IsString() externalId!: string;
}

export class UpdatePortalOutletDto extends PartialType(CreatePortalOutletDto) {}

export class PortalOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string | null;
  @ApiProperty() works!: boolean;
  @ApiProperty() hidden!: boolean;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty({ type: () => [String] }) adminEmails!: string[];
  @ApiPropertyOptional() timezone?: string | null;
  @ApiProperty() showSchedule!: boolean;
  @ApiProperty({ type: () => OutletScheduleDto })
  schedule!: OutletScheduleDto;
  @ApiPropertyOptional() latitude?: number | null;
  @ApiPropertyOptional() longitude?: number | null;
  @ApiProperty() manualLocation!: boolean;
  @ApiProperty() externalId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PortalOutletListResponseDto {
  @ApiProperty({ type: () => [PortalOutletDto] }) items!: PortalOutletDto[];
  @ApiProperty() total!: number;
}
