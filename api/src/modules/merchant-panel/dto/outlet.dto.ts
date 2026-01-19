import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PaginationQueryDto,
  createPaginatedResponseDto,
} from '../../../shared/common/dto/pagination.dto';

const OUTLET_STATUS_FILTERS = ['ACTIVE', 'INACTIVE', 'ALL'] as const;

type OutletStatusFilter = (typeof OUTLET_STATUS_FILTERS)[number];

export class OutletListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Фильтр по статусу',
    enum: OUTLET_STATUS_FILTERS,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : undefined,
  )
  @IsIn(OUTLET_STATUS_FILTERS as unknown as string[])
  status?: OutletStatusFilter;

  @ApiPropertyOptional({
    description: 'Поиск по названию',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class OutletReviewsShareLinksDto {
  @ApiPropertyOptional({
    description: 'Ссылка на карточку заведения на Яндекс.Картах',
  })
  yandex?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на карточку заведения в 2ГИС' })
  twogis?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на карточку заведения в Google' })
  google?: string | null;
}

export class OutletDeviceDto {
  @ApiProperty({ description: 'Идентификатор устройства' })
  id!: string;

  @ApiProperty({ description: 'Код устройства' })
  code!: string;
}

export class OutletDto {
  @ApiProperty({ description: 'Идентификатор торговой точки' })
  id!: string;

  @ApiProperty({ description: 'Название точки' })
  name!: string;

  @ApiProperty({ description: 'Статус точки' })
  status!: string;

  @ApiPropertyOptional({ description: 'Количество сотрудников на точке' })
  staffCount?: number | null;

  @ApiPropertyOptional({ type: () => [OutletDeviceDto] })
  devices?: OutletDeviceDto[] | null;

  @ApiPropertyOptional({
    type: () => OutletReviewsShareLinksDto,
    description: 'Ссылки на внешние площадки для отзывов',
  })
  reviewsShareLinks?: OutletReviewsShareLinksDto | null;
}

export class OutletListResponseDto extends createPaginatedResponseDto(
  OutletDto,
) {}

export class OutletReviewsShareLinksInput {
  @ApiPropertyOptional({ description: 'Ссылка на Яндекс.Карты' })
  @IsOptional()
  @IsString()
  yandex?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на 2ГИС' })
  @IsOptional()
  @IsString()
  twogis?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на Google' })
  @IsOptional()
  @IsString()
  google?: string | null;
}

export class OutletDeviceInput {
  @ApiProperty({ description: 'Код устройства' })
  @IsString()
  @MaxLength(64)
  code!: string;
}

export class UpsertOutletInput {
  @ApiProperty({ description: 'Название точки' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Точка работает' })
  @IsOptional()
  @IsBoolean()
  works?: boolean;

  @ApiPropertyOptional({
    type: () => OutletReviewsShareLinksInput,
    description: 'Ссылки на внешние площадки для отзывов',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutletReviewsShareLinksInput)
  reviewsShareLinks?: OutletReviewsShareLinksInput | null;

  @ApiPropertyOptional({ type: () => [OutletDeviceInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutletDeviceInput)
  devices?: OutletDeviceInput[] | null;
}

export class UpsertOutletDto extends UpsertOutletInput {}
