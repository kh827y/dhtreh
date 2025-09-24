import { AccessScope } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArgsType, Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto, createPaginatedResponseDto } from '../../common/dto/pagination.dto';

registerEnumType(AccessScope, { name: 'AccessScope' });

const ACCESS_SCOPE_FILTERS = [...Object.values(AccessScope), 'ALL'] as const;

type AccessScopeFilter = (typeof ACCESS_SCOPE_FILTERS)[number];

@ArgsType()
export class AccessGroupListQueryDto extends PaginationQueryDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Фильтр по области действия', enum: ACCESS_SCOPE_FILTERS })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(ACCESS_SCOPE_FILTERS as unknown as string[])
  scope?: AccessScopeFilter;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Поиск по названию', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

@ObjectType()
export class AccessGroupPermissionDto {
  @Field(() => String)
  @ApiProperty({ description: 'Ресурс', example: 'staff' })
  resource!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Действие', example: 'read' })
  action!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Условия доступа (JSON)' })
  conditions?: string | null;
}

@ObjectType()
export class AccessGroupDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор группы доступа' })
  id!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Название группы' })
  name!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Описание' })
  description?: string | null;

  @Field(() => AccessScope)
  @ApiProperty({ enum: AccessScope, description: 'Область действия' })
  scope!: AccessScope;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Системная группа (нельзя редактировать)' })
  isSystem!: boolean;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Группа по умолчанию' })
  isDefault!: boolean;

  @Field(() => Int)
  @ApiProperty({ description: 'Количество участников' })
  memberCount!: number;

  @Field(() => [AccessGroupPermissionDto])
  @ApiProperty({ type: () => [AccessGroupPermissionDto], description: 'Список разрешений' })
  permissions!: AccessGroupPermissionDto[];
}

@ObjectType()
export class AccessGroupListResponseDto extends createPaginatedResponseDto(AccessGroupDto) {}

@InputType()
export class AccessGroupPermissionInput {
  @Field(() => String)
  @ApiProperty({ description: 'Ресурс', example: 'staff' })
  @IsString()
  resource!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Действие', example: 'update' })
  @IsString()
  action!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Условия' })
  @IsOptional()
  @IsString()
  conditions?: string | null;
}

@InputType()
export class AccessGroupInput {
  @Field(() => String)
  @ApiProperty({ description: 'Название группы' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Описание' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @Field(() => AccessScope, { nullable: true })
  @ApiPropertyOptional({ enum: AccessScope })
  @IsOptional()
  @IsEnum(AccessScope)
  scope?: AccessScope;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Группа по умолчанию' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @Field(() => [AccessGroupPermissionInput])
  @ApiProperty({ type: () => [AccessGroupPermissionInput] })
  @IsArray()
  permissions!: AccessGroupPermissionInput[];
}

export class AccessGroupDtoInput extends AccessGroupInput {}

@InputType()
export class SetAccessGroupMembersInput {
  @Field(() => [ID])
  @ApiProperty({ type: [String], description: 'Идентификаторы сотрудников' })
  @IsArray()
  @IsString({ each: true })
  staffIds!: string[];
}

export class SetAccessGroupMembersDto extends SetAccessGroupMembersInput {}
