import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArgsType,
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';
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
} from '../../common/dto/pagination.dto';

const OUTLET_STATUS_FILTERS = ['ACTIVE', 'INACTIVE', 'ALL'] as const;

type OutletStatusFilter = (typeof OUTLET_STATUS_FILTERS)[number];

@ArgsType()
export class OutletListQueryDto extends PaginationQueryDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Фильтр по статусу',
    enum: OUTLET_STATUS_FILTERS,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(OUTLET_STATUS_FILTERS as unknown as string[])
  status?: OutletStatusFilter;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Поиск по названию',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

@ObjectType()
export class OutletReviewsShareLinksDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Ссылка на карточку заведения на Яндекс.Картах',
  })
  yandex?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Ссылка на карточку заведения в 2ГИС' })
  twogis?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Ссылка на карточку заведения в Google' })
  google?: string | null;
}

@ObjectType()
export class OutletDeviceDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор устройства' })
  id!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Код устройства' })
  code!: string;
}

@ObjectType()
export class OutletDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор торговой точки' })
  id!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Название точки' })
  name!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Статус точки' })
  status!: string;

  @Field(() => Int, { nullable: true })
  @ApiPropertyOptional({ description: 'Количество сотрудников на точке' })
  staffCount?: number | null;

  @Field(() => [OutletDeviceDto], { nullable: true })
  @ApiPropertyOptional({ type: () => [OutletDeviceDto] })
  devices?: OutletDeviceDto[] | null;

  @Field(() => OutletReviewsShareLinksDto, { nullable: true })
  @ApiPropertyOptional({
    type: () => OutletReviewsShareLinksDto,
    description: 'Ссылки на внешние площадки для отзывов',
  })
  reviewsShareLinks?: OutletReviewsShareLinksDto | null;
}

@ObjectType()
export class OutletListResponseDto extends createPaginatedResponseDto(
  OutletDto,
) {}

@InputType()
export class OutletReviewsShareLinksInput {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Ссылка на Яндекс.Карты' })
  @IsOptional()
  @IsString()
  yandex?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Ссылка на 2ГИС' })
  @IsOptional()
  @IsString()
  twogis?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Ссылка на Google' })
  @IsOptional()
  @IsString()
  google?: string | null;
}

@InputType()
export class OutletDeviceInput {
  @Field(() => String)
  @ApiProperty({ description: 'Код устройства' })
  @IsString()
  @MaxLength(64)
  code!: string;
}

@InputType()
export class UpsertOutletInput {
  @Field(() => String)
  @ApiProperty({ description: 'Название точки' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Точка работает' })
  @IsOptional()
  @IsBoolean()
  works?: boolean;

  @Field(() => OutletReviewsShareLinksInput, { nullable: true })
  @ApiPropertyOptional({
    type: () => OutletReviewsShareLinksInput,
    description: 'Ссылки на внешние площадки для отзывов',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutletReviewsShareLinksInput)
  reviewsShareLinks?: OutletReviewsShareLinksInput | null;

  @Field(() => [OutletDeviceInput], { nullable: true })
  @ApiPropertyOptional({ type: () => [OutletDeviceInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutletDeviceInput)
  devices?: OutletDeviceInput[] | null;
}

export class UpsertOutletDto extends UpsertOutletInput {}
