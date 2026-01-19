import { AccessScope } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  PaginationQueryDto,
  createPaginatedResponseDto,
} from '../../../shared/common/dto/pagination.dto';

const ACCESS_SCOPE_FILTERS = [...Object.values(AccessScope), 'ALL'] as const;

type AccessScopeFilter = (typeof ACCESS_SCOPE_FILTERS)[number];

export class AccessGroupListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Фильтр по области действия',
    enum: ACCESS_SCOPE_FILTERS,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : undefined,
  )
  @IsIn(ACCESS_SCOPE_FILTERS as unknown as string[])
  scope?: AccessScopeFilter;

  @ApiPropertyOptional({ description: 'Поиск по названию', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class AccessGroupPermissionDto {
  @ApiProperty({ description: 'Ресурс', example: 'staff' })
  resource!: string;

  @ApiProperty({ description: 'Действие', example: 'read' })
  action!: string;

  @ApiPropertyOptional({ description: 'Условия доступа (JSON)' })
  conditions?: string | null;
}

export class AccessGroupDto {
  @ApiProperty({ description: 'Идентификатор группы доступа' })
  id!: string;

  @ApiProperty({ description: 'Название группы' })
  name!: string;

  @ApiPropertyOptional({ description: 'Описание' })
  description?: string | null;

  @ApiProperty({ enum: AccessScope, description: 'Область действия' })
  scope!: AccessScope;

  @ApiProperty({ description: 'Системная группа (нельзя редактировать)' })
  isSystem!: boolean;

  @ApiProperty({ description: 'Группа по умолчанию' })
  isDefault!: boolean;

  @ApiProperty({ description: 'Количество участников' })
  memberCount!: number;

  @ApiProperty({
    type: () => [AccessGroupPermissionDto],
    description: 'Список разрешений',
  })
  permissions!: AccessGroupPermissionDto[];
}

export class AccessGroupListResponseDto extends createPaginatedResponseDto(
  AccessGroupDto,
) {}

export class AccessGroupPermissionInput {
  @ApiProperty({ description: 'Ресурс', example: 'staff' })
  @IsString()
  resource!: string;

  @ApiProperty({ description: 'Действие', example: 'update' })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ description: 'Условия' })
  @IsOptional()
  @IsString()
  conditions?: string | null;
}

export class AccessGroupInput {
  @ApiProperty({ description: 'Название группы' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Описание' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ enum: AccessScope })
  @IsOptional()
  @IsEnum(AccessScope)
  scope?: AccessScope;

  @ApiPropertyOptional({ description: 'Группа по умолчанию' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: () => [AccessGroupPermissionInput] })
  @IsArray()
  permissions!: AccessGroupPermissionInput[];
}

export class AccessGroupDtoInput extends AccessGroupInput {}

export class SetAccessGroupMembersInput {
  @ApiProperty({ type: [String], description: 'Идентификаторы сотрудников' })
  @IsArray()
  @IsString({ each: true })
  staffIds!: string[];
}

export class SetAccessGroupMembersDto extends SetAccessGroupMembersInput {}
