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
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() parentId?: string | null;
  @ApiProperty() status!: 'ACTIVE' | 'ARCHIVED';
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
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

export class CreateProductDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
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
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() categoryId?: string | null;
  @ApiPropertyOptional() categoryName?: string | null;
  @ApiProperty() accruePoints!: boolean;
  @ApiProperty() allowRedeem!: boolean;
  @ApiProperty() redeemPercent!: number;
  @ApiPropertyOptional() externalId?: string | null;
  @ApiPropertyOptional() price?: number | null;
}

export class ProductDto extends ProductListItemDto {}

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
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
}

export class ImportCatalogDto {
  @ApiProperty({ type: () => [ImportProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductDto)
  products!: ImportProductDto[];
}
