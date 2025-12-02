import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum IntegrationOperationMode {
  REDEEM = 'redeem',
  EARN = 'earn',
  MIXED = 'mixed',
}

export class IntegrationItemDto {
  @ApiPropertyOptional({
    description: 'Внешний ID товара (id_product / externalId)',
  })
  @IsOptional()
  @IsString()
  id_product?: string;

  @ApiPropertyOptional({ description: 'Альтернативный код товара' })
  @IsOptional()
  @IsString()
  productCode?: string;

  @ApiPropertyOptional({
    description: 'Провайдер внешней системы (iiko, r_keeper, MoySklad и т.п.)',
  })
  @IsOptional()
  @IsString()
  externalProvider?: string;

  @ApiPropertyOptional({ description: 'Внутренний ID товара' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'ID категории' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Внешний ID категории в указанной системе',
  })
  @IsOptional()
  @IsString()
  categoryExternalId?: string;

  @ApiPropertyOptional({ description: 'Название товара' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Штрихкод' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'SKU/артикул' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ description: 'Количество', example: 1 })
  @IsNumber()
  qty!: number;

  @ApiProperty({ description: 'Цена за единицу', example: 450 })
  @IsNumber()
  price!: number;
}

export class IntegrationCodeRequestDto {
  @ApiProperty()
  @IsString()
  userToken!: string;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class IntegrationCalculateDto {
  @ApiProperty({ enum: IntegrationOperationMode })
  @IsEnum(IntegrationOperationMode)
  mode!: IntegrationOperationMode;

  @ApiProperty()
  @IsString()
  userToken!: string;

  @ApiProperty()
  @IsString()
  orderId!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  eligibleTotal!: number;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ type: [IntegrationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationItemDto)
  items?: IntegrationItemDto[];
}

export class IntegrationBonusDto {
  @ApiProperty({ enum: IntegrationOperationMode })
  @IsEnum(IntegrationOperationMode)
  mode!: IntegrationOperationMode;

  @ApiProperty()
  @IsString()
  userToken!: string;

  @ApiProperty()
  @IsString()
  orderId!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  total!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  eligibleTotal!: number;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ name: 'paid_bonus', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paid_bonus?: number;

  @ApiPropertyOptional({ name: 'bonus_value', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bonus_value?: number;

  @ApiPropertyOptional({
    description: 'Дата операции (ISO 8601), может быть в прошлом',
  })
  @IsOptional()
  @IsString()
  operationDate?: string;

  @ApiPropertyOptional({ type: [IntegrationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationItemDto)
  items?: IntegrationItemDto[];
}

export class IntegrationRefundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  refundTotal!: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundEligibleTotal?: number;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({
    description: 'Дата операции (ISO 8601), может быть в прошлом',
  })
  @IsOptional()
  @IsString()
  operationDate?: string;
}

export class IntegrationOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) address?: string | null;
  @ApiPropertyOptional({ nullable: true }) description?: string | null;
}

export class IntegrationOutletsRespDto {
  @ApiProperty({ type: [IntegrationOutletDto] })
  items!: IntegrationOutletDto[];
}

export class IntegrationDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'Код устройства (из настроек торговой точки, регистр сохраняется)',
  })
  code!: string;
  @ApiProperty() outletId!: string;
}

export class IntegrationDevicesQueryDto {
  @ApiPropertyOptional({
    description: 'Фильтр по торговой точке',
  })
  @IsOptional()
  @IsString()
  outletId?: string;
}

export class IntegrationDevicesRespDto {
  @ApiProperty({ type: [IntegrationDeviceDto] })
  items!: IntegrationDeviceDto[];
}

export class IntegrationOperationsQueryDto {
  @ApiPropertyOptional({
    description: 'Поиск по orderId/receiptNumber',
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Начало интервала (ISO 8601)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Конец интервала (ISO 8601)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по устройству (id или код)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по торговой точке',
  })
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({
    description: 'Ограничение количества записей (1–500)',
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class IntegrationOperationDto {
  @ApiProperty({ enum: ['purchase', 'refund'] })
  kind!: 'purchase' | 'refund';

  @ApiProperty()
  orderId!: string;

  @ApiPropertyOptional({ nullable: true })
  receiptId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  receiptNumber?: string | null;

  @ApiProperty({
    description: 'Дата и время операции (operationDate/createdAt)',
    type: String,
    format: 'date-time',
  })
  operationDate!: string;

  @ApiPropertyOptional({
    description: 'Сумма чека (для возврата — сумма возврата)',
    nullable: true,
  })
  total?: number | null;

  @ApiPropertyOptional({
    description: 'Списанные бонусы для покупки',
    nullable: true,
  })
  redeemApplied?: number | null;

  @ApiPropertyOptional({
    description: 'Начисленные бонусы для покупки',
    nullable: true,
  })
  earnApplied?: number | null;

  @ApiPropertyOptional({
    description: 'Восстановленные бонусы при возврате',
    nullable: true,
  })
  pointsRestored?: number | null;

  @ApiPropertyOptional({
    description: 'Списанные (отозванные) бонусы при возврате',
    nullable: true,
  })
  pointsRevoked?: number | null;

  @ApiPropertyOptional({
    description: 'Баланс до операции (если удалось восстановить)',
    nullable: true,
  })
  balanceBefore?: number | null;

  @ApiPropertyOptional({
    description: 'Баланс после операции (если удалось восстановить)',
    nullable: true,
  })
  balanceAfter?: number | null;

  @ApiPropertyOptional({ nullable: true })
  outletId?: string | null;

  @ApiPropertyOptional({
    description: 'ID устройства',
    nullable: true,
  })
  deviceId?: string | null;

  @ApiPropertyOptional({
    description: 'Код устройства (как в настройках)',
    nullable: true,
  })
  deviceCode?: string | null;

  @ApiPropertyOptional({
    description: 'Доля возврата (0..1) при REFUND',
    nullable: true,
  })
  refundShare?: number | null;

  @ApiPropertyOptional({
    description: 'Возвращаемая сумма (если передавалась в refund)',
    nullable: true,
  })
  refundTotal?: number | null;

  @ApiPropertyOptional({
    description: 'Возвращаемая сумма, участвующая в бонусах (refundEligibleTotal)',
    nullable: true,
  })
  refundEligibleTotal?: number | null;

  @ApiPropertyOptional({
    description: 'Пометка отменённого чека (full refund)',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  canceledAt?: string | null;

  @ApiPropertyOptional({
    description: 'Чистое изменение баланса по операции',
    nullable: true,
  })
  pointsDelta?: number | null;
}

export class IntegrationOperationsRespDto {
  @ApiProperty({ type: [IntegrationOperationDto] })
  items!: IntegrationOperationDto[];
}
