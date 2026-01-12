import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ required: false, minimum: 1, maximum: 200, default: 20 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 20;
}

export class PageMetaDto {
  @ApiProperty({ description: 'Текущая страница', minimum: 1 })
  page!: number;

  @ApiProperty({ description: 'Размер страницы', minimum: 1, maximum: 200 })
  pageSize!: number;

  @ApiProperty({ description: 'Всего записей', minimum: 0 })
  total!: number;

  @ApiProperty({ description: 'Всего страниц', minimum: 1 })
  totalPages!: number;
}

export interface PaginatedResult<T, TCounter = unknown> {
  items: T[];
  meta: PageMetaDto;
  counters?: TCounter;
}

export function createPaginatedResponseDto<TItem, TCounter = unknown>(
  classRef: Type<TItem>,
  countersRef?: Type<TCounter>,
) {
  abstract class BasePaginatedResponseDto {
    @ApiProperty({ type: () => [classRef] })
    items!: TItem[];

    @ApiProperty({ type: () => PageMetaDto })
    meta!: PageMetaDto;
  }

  if (countersRef) {
    abstract class PaginatedResponseWithCountersDto extends BasePaginatedResponseDto {
      @ApiProperty({ type: () => countersRef, required: false, nullable: true })
      counters?: TCounter;
    }

    return PaginatedResponseWithCountersDto;
  }

  return BasePaginatedResponseDto;
}
