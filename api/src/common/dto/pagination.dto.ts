import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ArgsType, Field, Int, ObjectType } from '@nestjs/graphql';
import { Type as TransformType } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

@ArgsType()
export class PaginationQueryDto {
  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @ApiProperty({ required: false, minimum: 1, maximum: 200, default: 20 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 20;
}

@ObjectType()
export class PageMetaDto {
  @Field(() => Int)
  @ApiProperty({ description: 'Текущая страница', minimum: 1 })
  page!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Размер страницы', minimum: 1, maximum: 200 })
  pageSize!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Всего записей', minimum: 0 })
  total!: number;

  @Field(() => Int)
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
  @ObjectType({ isAbstract: true })
  abstract class BasePaginatedResponseDto {
    @Field(() => [classRef])
    @ApiProperty({ type: () => [classRef] })
    items!: TItem[];

    @Field(() => PageMetaDto)
    @ApiProperty({ type: () => PageMetaDto })
    meta!: PageMetaDto;
  }

  if (countersRef) {
    @ObjectType({ isAbstract: true })
    abstract class PaginatedResponseWithCountersDto extends BasePaginatedResponseDto {
      @Field(() => countersRef, { nullable: true })
      @ApiProperty({ type: () => countersRef, required: false, nullable: true })
      counters?: TCounter;
    }

    return PaginatedResponseWithCountersDto;
  }

  return BasePaginatedResponseDto;
}
