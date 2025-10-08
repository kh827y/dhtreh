import {
  StaffRole,
  StaffStatus,
  StaffOutletAccessStatus,
  AccessScope,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArgsType,
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
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
} from '../../common/dto/pagination.dto';

registerEnumType(StaffStatus, { name: 'StaffStatus' });
registerEnumType(StaffRole, { name: 'StaffRole' });
registerEnumType(StaffOutletAccessStatus, { name: 'StaffOutletAccessStatus' });
registerEnumType(AccessScope, { name: 'AccessScope' });

const STAFF_STATUS_FILTERS = [...Object.values(StaffStatus), 'ALL'] as const;

type StaffStatusFilter = (typeof STAFF_STATUS_FILTERS)[number];

@ArgsType()
export class StaffListQueryDto extends PaginationQueryDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Поиск по имени/телефону/email',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Фильтр по статусу',
    enum: STAFF_STATUS_FILTERS,
  })
  @IsOptional()
  @IsIn(STAFF_STATUS_FILTERS as unknown as string[])
  status?: StaffStatusFilter;

  @Field(() => ID, { nullable: true })
  @ApiPropertyOptional({ description: 'Фильтр по торговой точке' })
  @IsOptional()
  @IsString()
  outletId?: string;

  @Field(() => ID, { nullable: true })
  @ApiPropertyOptional({ description: 'Фильтр по группе доступа' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Только сотрудники с доступом в портал' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  portalOnly?: boolean;
}

@InputType()
export class StaffListFiltersInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => StaffStatus, { nullable: true })
  status?: StaffStatus;

  @Field(() => ID, { nullable: true })
  outletId?: string;

  @Field(() => ID, { nullable: true })
  groupId?: string;

  @Field(() => Boolean, { nullable: true })
  portalOnly?: boolean;
}

@ObjectType()
export class StaffOutletAccessDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор доступа', example: 'soa_123' })
  id!: string;

  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор торговой точки' })
  outletId!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Название торговой точки' })
  outletName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'PIN-код кассира для точки',
    minLength: 4,
    maxLength: 4,
  })
  pinCode?: string | null;

  @Field(() => StaffOutletAccessStatus)
  @ApiProperty({
    enum: StaffOutletAccessStatus,
    description: 'Статус доступа к точке',
  })
  status!: StaffOutletAccessStatus;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Дата последней операции кассира по точке',
  })
  lastTxnAt?: string | null;

  @Field(() => Int, { nullable: true })
  @ApiPropertyOptional({ description: 'Количество операций по точке' })
  transactionsTotal?: number | null;
}

@ObjectType()
export class StaffGroupDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор группы доступа' })
  id!: string;

  @Field(() => String)
  @ApiProperty({ description: 'Название группы' })
  name!: string;

  @Field(() => AccessScope)
  @ApiProperty({ enum: AccessScope, description: 'Область действия группы' })
  scope!: AccessScope;
}

@ObjectType()
export class StaffSummaryDto {
  @Field(() => ID)
  @ApiProperty({ description: 'Идентификатор сотрудника' })
  id!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Логин' })
  login?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Email' })
  email?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Телефон' })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Имя' })
  firstName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Фамилия' })
  lastName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Должность' })
  position?: string | null;

  @Field(() => StaffRole)
  @ApiProperty({ enum: StaffRole, description: 'Роль сотрудника' })
  role!: StaffRole;

  @Field(() => StaffStatus)
  @ApiProperty({ enum: StaffStatus, description: 'Статус сотрудника' })
  status!: StaffStatus;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Доступ в портал включён' })
  portalAccessEnabled!: boolean;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Может ли авторизоваться в портале' })
  canAccessPortal!: boolean;

  @Field(() => Boolean)
  @ApiProperty({ description: 'Является владельцем аккаунта мерчанта' })
  isOwner!: boolean;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Персональный PIN сотрудника' })
  pinCode?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Последняя активность сотрудника' })
  lastActivityAt?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Дата последнего входа в портал' })
  lastPortalLoginAt?: string | null;

  @Field(() => Int, { nullable: true })
  @ApiPropertyOptional({ description: 'Количество активных торговых точек' })
  outletsCount?: number | null;

  @Field(() => [StaffOutletAccessDto])
  @ApiProperty({
    type: () => [StaffOutletAccessDto],
    description: 'Список доступов по точкам',
  })
  accesses!: StaffOutletAccessDto[];

  @Field(() => [StaffGroupDto])
  @ApiProperty({
    type: () => [StaffGroupDto],
    description: 'Группы доступа сотрудника',
  })
  groups!: StaffGroupDto[];
}

@ObjectType()
export class StaffDetailDto extends StaffSummaryDto {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Комментарий' })
  comment?: string | null;
}

@ObjectType()
export class StaffCountersDto {
  @Field(() => Int)
  @ApiProperty({ description: 'Активные сотрудники' })
  active!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Новые сотрудники (ожидают приглашение)' })
  pending!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Заблокированные сотрудники' })
  suspended!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Уволенные сотрудники' })
  fired!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'Архив' })
  archived!: number;

  @Field(() => Int)
  @ApiProperty({ description: 'С доступом в портал' })
  portalEnabled!: number;
}

@ObjectType()
export class StaffListResponseDto extends createPaginatedResponseDto(
  StaffSummaryDto,
  StaffCountersDto,
) {}

@InputType()
export class UpsertStaffInput {
  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Логин для входа' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  login?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Телефон' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Имя' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Фамилия' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Должность' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  position?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Комментарий' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;

  @Field(() => StaffRole, { nullable: true })
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @Field(() => StaffStatus, { nullable: true })
  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({
    description: 'Может ли сотрудник использовать портал',
  })
  @IsOptional()
  @IsBoolean()
  canAccessPortal?: boolean;

  @Field(() => Boolean, { nullable: true })
  @ApiPropertyOptional({ description: 'Доступ в портал включён' })
  @IsOptional()
  @IsBoolean()
  portalAccessEnabled?: boolean;

  @Field(() => [ID], { nullable: true })
  @ApiPropertyOptional({ type: [String], description: 'Список точек' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  outletIds?: string[];

  @Field(() => [ID], { nullable: true })
  @ApiPropertyOptional({ type: [String], description: 'Список групп доступа' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  accessGroupIds?: string[];

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Стратегия обработки PIN при обновлении',
    enum: ['KEEP', 'ROTATE'],
  })
  @IsOptional()
  @IsIn(['KEEP', 'ROTATE'])
  pinStrategy?: 'KEEP' | 'ROTATE';

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ description: 'Новый пароль сотрудника', minLength: 6 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string | null;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({
    description: 'Текущий пароль сотрудника для подтверждения',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string | null;
}

export class UpsertStaffDto extends UpsertStaffInput {}

export class AssignStaffAccessDto {
  @ApiProperty({ description: 'Идентификатор торговой точки' })
  @IsString()
  @MaxLength(100)
  outletId!: string;
}

@ObjectType()
@InputType()
export class ChangeStaffStatusInput {
  @Field(() => StaffStatus)
  @ApiProperty({ enum: StaffStatus })
  @IsEnum(StaffStatus)
  status!: StaffStatus;

  @Field(() => ID, { nullable: true })
  @ApiPropertyOptional({ description: 'Идентификатор инициатора операции' })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ChangeStaffStatusDto extends ChangeStaffStatusInput {}
