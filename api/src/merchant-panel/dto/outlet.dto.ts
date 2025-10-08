import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArgsType,
  Field,
  Float,
  ID,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
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

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Скрытые точки', example: false })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  hidden?: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Поиск по названию/адресу',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

@ObjectType()
export class OutletScheduleItemDto {
  @Field(() => Int)
  @ApiProperty({ description: 'День недели (0-6)' })
  day!: number;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Рабочий день' })
  enabled!: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Время открытия HH:mm' })
  opensAt?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Время закрытия HH:mm' })
  closesAt?: string | null;
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
export class OutletDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор торговой точки' })
  id!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Название точки' })
  name!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Описание' })
  description?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Адрес' })
  address?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Телефон' })
  phone?: string | null;

  @Field(() => [String])
  @ApiProperty({ type: [String], description: 'Email администраторов' })
  adminEmails!: string[];

  @Field(() => String)
  @ApiProperty({ description: 'Статус точки' })
  status!: string;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Скрыта в клиентском каталоге' })
  hidden!: boolean;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Режим работы включён' })
  scheduleEnabled!: boolean;

  @Field(() => String)
  @ApiProperty({ description: 'Режим (24_7/CUSTOM)' })
  scheduleMode!: string;

  @Field(() => [OutletScheduleItemDto], { nullable: true })
  @ApiPropertyOptional({
    type: () => [OutletScheduleItemDto],
    description: 'Расписание',
  })
  schedule?: OutletScheduleItemDto[] | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Часовой пояс' })
  timezone?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Внешний идентификатор' })
  externalId?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Провайдер интеграции' })
  integrationProvider?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Код локации интеграции' })
  integrationLocationCode?: string | null;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Координаты заданы вручную' })
  manualLocation!: boolean;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({ description: 'Широта' })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({ description: 'Долгота' })
  longitude?: number | null;

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
export class OutletScheduleItemInput {
  @Field(() => Int)
  @ApiProperty({ description: 'День недели (0-6)' })
  @IsNumber()
  day!: number;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Рабочий день' })
  @IsBoolean()
  enabled!: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Время открытия HH:mm' })
  @IsOptional()
  @IsString()
  opensAt?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Время закрытия HH:mm' })
  @IsOptional()
  @IsString()
  closesAt?: string | null;
}

@InputType()
export class OutletScheduleInput {
  @Field(() => String)
  @ApiProperty({ description: 'Режим работы', enum: ['24_7', 'CUSTOM'] })
  @IsString()
  @IsIn(['24_7', 'CUSTOM'])
  mode!: '24_7' | 'CUSTOM';

  @Field(() => [OutletScheduleItemInput])
  @ApiProperty({
    type: () => [OutletScheduleItemInput],
    description: 'Расписание по дням',
  })
  @IsArray()
  @ArrayMinSize(7)
  @ValidateNested({ each: true })
  @Type(() => OutletScheduleItemInput)
  days!: OutletScheduleItemInput[];
}

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
export class UpsertOutletInput {
  @Field(() => String)
  @ApiProperty({ description: 'Название точки' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Описание' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Адрес' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Телефон' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @Field(() => [String], { nullable: true })
  @ApiPropertyOptional({
    type: [String],
    description: 'Emails администраторов',
  })
  @IsOptional()
  @IsArray()
  @IsEmail(undefined, { each: true })
  adminEmails?: string[];

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Точка работает' })
  @IsOptional()
  @IsBoolean()
  works?: boolean;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Скрыть точку от клиентов' })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Часовой пояс' })
  @IsOptional()
  @IsString()
  timezone?: string | null;

  @Field(() => OutletScheduleInput, { nullable: true })
  @ApiPropertyOptional({ type: () => OutletScheduleInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutletScheduleInput)
  schedule?: OutletScheduleInput;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Внешний идентификатор' })
  @IsOptional()
  @IsString()
  externalId?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Провайдер интеграции' })
  @IsOptional()
  @IsString()
  integrationProvider?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Код локации интеграции' })
  @IsOptional()
  @IsString()
  integrationLocationCode?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Произвольные данные интеграции (JSON string)',
  })
  @IsOptional()
  @IsString()
  integrationPayload?: string | null;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Координаты задаются вручную' })
  @IsOptional()
  @IsBoolean()
  manualLocation?: boolean;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({ description: 'Широта' })
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({ description: 'Долгота' })
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @Field(() => OutletReviewsShareLinksInput, { nullable: true })
  @ApiPropertyOptional({
    type: () => OutletReviewsShareLinksInput,
    description: 'Ссылки на внешние площадки для отзывов',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutletReviewsShareLinksInput)
  reviewsShareLinks?: OutletReviewsShareLinksInput | null;
}

export class UpsertOutletDto extends UpsertOutletInput {}
