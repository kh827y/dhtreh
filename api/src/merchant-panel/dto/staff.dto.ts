import {
  StaffRole,
  StaffStatus,
  StaffOutletAccessStatus,
  AccessScope,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

const STAFF_STATUS_FILTERS = [...Object.values(StaffStatus), 'ALL'] as const;

type StaffStatusFilter = (typeof STAFF_STATUS_FILTERS)[number];

export class StaffListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Поиск по имени/телефону/email',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по статусу',
    enum: STAFF_STATUS_FILTERS,
  })
  @IsOptional()
  @IsIn(STAFF_STATUS_FILTERS as unknown as string[])
  status?: StaffStatusFilter;

  @ApiPropertyOptional({ description: 'Фильтр по торговой точке' })
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по группе доступа' })
  @IsOptional()
  @IsString()
  groupId?: string;

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

export class StaffOutletAccessDto {
  @ApiProperty({ description: 'Идентификатор доступа', example: 'soa_123' })
  id!: string;

  @ApiProperty({ description: 'Идентификатор торговой точки' })
  outletId!: string;

  @ApiPropertyOptional({ description: 'Название торговой точки' })
  outletName?: string | null;

  @ApiPropertyOptional({
    description: 'PIN-код кассира для точки',
    minLength: 4,
    maxLength: 4,
  })
  pinCode?: string | null;

  @ApiProperty({
    enum: StaffOutletAccessStatus,
    description: 'Статус доступа к точке',
  })
  status!: StaffOutletAccessStatus;

  @ApiPropertyOptional({
    description: 'Дата последней операции кассира по точке',
  })
  lastTxnAt?: string | null;

  @ApiPropertyOptional({ description: 'Количество операций по точке' })
  transactionsTotal?: number | null;
}

export class StaffGroupDto {
  @ApiProperty({ description: 'Идентификатор группы доступа' })
  id!: string;

  @ApiProperty({ description: 'Название группы' })
  name!: string;

  @ApiProperty({ enum: AccessScope, description: 'Область действия группы' })
  scope!: AccessScope;
}

export class StaffSummaryDto {
  @ApiProperty({ description: 'Идентификатор сотрудника' })
  id!: string;

  @ApiPropertyOptional({ description: 'Логин' })
  login?: string | null;

  @ApiPropertyOptional({ description: 'Email' })
  email?: string | null;

  @ApiPropertyOptional({ description: 'Телефон' })
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Имя' })
  firstName?: string | null;

  @ApiPropertyOptional({ description: 'Фамилия' })
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Должность' })
  position?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на аватар' })
  avatarUrl?: string | null;

  @ApiProperty({ enum: StaffRole, description: 'Роль сотрудника' })
  role!: StaffRole;

  @ApiProperty({ enum: StaffStatus, description: 'Статус сотрудника' })
  status!: StaffStatus;

  @ApiProperty({ description: 'Доступ в портал включён' })
  portalAccessEnabled!: boolean;

  @ApiProperty({ description: 'Может ли авторизоваться в портале' })
  canAccessPortal!: boolean;

  @ApiProperty({ description: 'Может ли войти в портал прямо сейчас' })
  portalLoginEnabled!: boolean;

  @ApiProperty({ description: 'Является владельцем аккаунта мерчанта' })
  isOwner!: boolean;

  @ApiPropertyOptional({ description: 'Персональный PIN сотрудника' })
  pinCode?: string | null;

  @ApiPropertyOptional({ description: 'Последняя активность сотрудника' })
  lastActivityAt?: string | null;

  @ApiPropertyOptional({ description: 'Дата последнего входа в портал' })
  lastPortalLoginAt?: string | null;

  @ApiPropertyOptional({ description: 'Количество активных торговых точек' })
  outletsCount?: number | null;

  @ApiProperty({
    type: () => [StaffOutletAccessDto],
    description: 'Список доступов по точкам',
  })
  accesses!: StaffOutletAccessDto[];

  @ApiProperty({
    type: () => [StaffGroupDto],
    description: 'Группы доступа сотрудника',
  })
  groups!: StaffGroupDto[];
}

export class StaffDetailDto extends StaffSummaryDto {
  @ApiPropertyOptional({ description: 'Комментарий' })
  comment?: string | null;
}

export class StaffCountersDto {
  @ApiProperty({ description: 'Активные сотрудники' })
  active!: number;

  @ApiProperty({ description: 'Новые сотрудники (ожидают приглашение)' })
  pending!: number;

  @ApiProperty({ description: 'Заблокированные сотрудники' })
  suspended!: number;

  @ApiProperty({ description: 'Уволенные сотрудники' })
  fired!: number;

  @ApiProperty({ description: 'Архив' })
  archived!: number;

  @ApiProperty({ description: 'С доступом в портал' })
  portalEnabled!: number;
}

export class StaffListResponseDto extends createPaginatedResponseDto(
  StaffSummaryDto,
  StaffCountersDto,
) {}

export class UpsertStaffInput {
  @ApiPropertyOptional({ description: 'Логин для входа' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsEmail()
  login?: string | null;

  @ApiPropertyOptional({ description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ description: 'Телефон' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Имя' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string | null;

  @ApiPropertyOptional({ description: 'Фамилия' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Должность' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  position?: string | null;

  @ApiPropertyOptional({ description: 'Комментарий' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;

  @ApiPropertyOptional({ description: 'Ссылка на аватар' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    description: 'Может ли сотрудник использовать портал',
  })
  @IsOptional()
  @IsBoolean()
  canAccessPortal?: boolean;

  @ApiPropertyOptional({ description: 'Доступ в портал включён' })
  @IsOptional()
  @IsBoolean()
  portalAccessEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Список точек' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  outletIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Список групп доступа' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessGroupIds?: string[];

  @ApiPropertyOptional({
    description: 'Стратегия обработки PIN при обновлении',
    enum: ['KEEP', 'ROTATE'],
  })
  @IsOptional()
  @IsIn(['KEEP', 'ROTATE'])
  pinStrategy?: 'KEEP' | 'ROTATE';

  @ApiPropertyOptional({ description: 'Новый пароль сотрудника', minLength: 6 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string | null;

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

export class ChangeStaffStatusInput {
  @ApiProperty({ enum: StaffStatus })
  @IsEnum(StaffStatus)
  status!: StaffStatus;

  @ApiPropertyOptional({ description: 'Идентификатор инициатора операции' })
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ChangeStaffStatusDto extends ChangeStaffStatusInput {}
