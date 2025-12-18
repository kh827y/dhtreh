import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

@ValidatorConstraint({ name: 'ClientIdentifier', async: false })
class ClientIdentifierConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: any) {
    const obj = args?.object ?? {};
    const userToken =
      typeof obj?.userToken === 'string' && obj.userToken.trim().length > 0;
    const idClient =
      typeof obj?.id_client === 'string' && obj.id_client.trim().length > 0;
    return userToken || idClient;
  }

  defaultMessage() {
    return 'Укажите userToken или id_client';
  }
}

@ValidatorConstraint({ name: 'BonusContext', async: false })
class BonusContextConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: any) {
    const obj = args?.object ?? {};
    const outletId =
      typeof obj?.outletId === 'string' && obj.outletId.trim().length > 0;
    const deviceId =
      typeof obj?.deviceId === 'string' && obj.deviceId.trim().length > 0;
    const managerId =
      typeof obj?.managerId === 'string' && obj.managerId.trim().length > 0;
    return outletId || deviceId || managerId;
  }

  defaultMessage() {
    return 'Нужно передать outletId или deviceId или managerId';
  }
}

export class IntegrationItemDto {
  @ApiPropertyOptional({
    description: 'Внешний ID товара (id_product / артикул)',
  })
  @IsOptional()
  @IsString()
  id_product?: string;

  @ApiPropertyOptional({ description: 'Внутренний ID товара' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'ID категории' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Название товара' })
  @IsOptional()
  @IsString()
  name?: string;

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
}

export class IntegrationBonusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Validate(ClientIdentifierConstraint)
  userToken?: string;

  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  @Transform(
    ({ value, obj }) =>
      value ??
      obj?.idClient ??
      obj?.customerId ??
      obj?.customerId ??
      obj?.merchant_customer_id,
  )
  @IsOptional()
  @IsString()
  id_client?: string;

  @Validate(ClientIdentifierConstraint)
  _clientIdentifierValidator?: string;

  @ApiPropertyOptional({
    description: 'Кастомный номер чека от мерчанта (опционально)',
    name: 'invoice_num',
  })
  @Transform(({ value, obj }) => {
    return (
      value ??
      obj?.invoice_num ??
      obj?.invoiceNum ??
      obj?.orderId ??
      obj?.order_id ??
      null
    );
  })
  @IsOptional()
  @IsString()
  invoice_num?: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  total!: number;

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
    description: 'Идентификатор сотрудника/кассира (managerId)',
    name: 'managerId',
  })
  @Transform(({ value, obj }) => value ?? obj?.id_manager ?? obj?.manager_id)
  @IsOptional()
  @IsString()
  managerId?: string;

  @Validate(BonusContextConstraint)
  _bonusContextValidator?: string;

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

export class IntegrationCalculateActionItemDto {
  @ApiProperty({
    description: 'Внешний ID товара (артикул id_product)',
  })
  @IsString()
  id_product!: string;

  @ApiProperty({
    description: 'Количество',
  })
  @IsNumber()
  qty!: number;

  @ApiProperty({
    description: 'Цена за единицу',
  })
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    description: 'Внешний ID категории товара',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Название товара',
  })
  @IsOptional()
  @IsString()
  name?: string;
}

export class IntegrationCalculateActionDto {
  @ApiProperty({
    type: [IntegrationCalculateActionItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationCalculateActionItemDto)
  items!: IntegrationCalculateActionItemDto[];

  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности (для client-based промо)',
    name: 'id_client',
  })
  @Transform(
    ({ value, obj }) =>
      value ??
      obj?.idClient ??
      obj?.customerId ??
      obj?.customerId ??
      obj?.merchant_customer_id ??
      null,
  )
  @IsOptional()
  @IsString()
  id_client?: string;

  @ApiPropertyOptional({
    description: 'Опциональный контекст точки (для правил по торговой точке)',
  })
  @IsOptional()
  @IsString()
  outletId?: string;
}

export class IntegrationCalculateBonusItemDto {
  @ApiProperty({
    description: 'Внешний ID товара (артикул id_product)',
  })
  @IsString()
  id_product!: string;

  @ApiPropertyOptional({ description: 'Название товара' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Количество', default: 1 })
  @Transform(({ value, obj }) => {
    const raw = value ?? obj?.quantity ?? obj?.qty;
    return raw === undefined || raw === null ? 1 : raw;
  })
  @IsNumber()
  qty!: number;

  @ApiProperty({
    description: 'Цена после применения акций',
  })
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    description: 'Цена до применения акций',
    name: 'base_price',
  })
  @IsOptional()
  @IsNumber()
  base_price?: number;

  @ApiPropertyOptional({
    description: 'Можно ли начислять и списывать одновременно',
    name: 'allow_earn_and_pay',
  })
  @IsOptional()
  @IsBoolean()
  allow_earn_and_pay?: boolean;

  @ApiPropertyOptional({
    description: 'ID применённых акций',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  actions?: string[];

  @ApiPropertyOptional({
    description: 'Названия применённых акций',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  action_names?: string[];

  @ApiPropertyOptional({
    description: 'Множитель начисления (если акция x2/x3)',
  })
  @IsOptional()
  @IsNumber()
  earn_multiplier?: number;
}

export class IntegrationCalculateBonusDto {
  @ApiPropertyOptional({
    description: 'Токен клиента (QR)',
  })
  @IsOptional()
  @IsString()
  @Validate(ClientIdentifierConstraint)
  userToken?: string;

  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  @Transform(
    ({ value, obj }) =>
      value ??
      obj?.idClient ??
      obj?.customerId ??
      obj?.customerId ??
      obj?.merchant_customer_id,
  )
  @IsOptional()
  @IsString()
  id_client?: string;

  @Validate(ClientIdentifierConstraint)
  _clientIdentifierValidator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({
    description: 'Дата операции (ISO 8601)',
  })
  @IsOptional()
  @IsString()
  operationDate?: string;

  @ApiPropertyOptional({
    description: 'Сумма заказа (если items не передаётся)',
    name: 'total',
    minimum: 0,
  })
  @Transform(({ value, obj }) => value ?? obj?.to_pay ?? obj?.order_price)
  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @ApiPropertyOptional({
    description: 'Желаемое списание баллов (для расчёта остатка)',
    name: 'paid_bonus',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paid_bonus?: number;

  @ApiPropertyOptional({
    type: [IntegrationCalculateBonusItemDto],
    description: 'Состав заказа (опционально, если передан total)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationCalculateBonusItemDto)
  items?: IntegrationCalculateBonusItemDto[];
}

export class IntegrationRefundDto {
  @ApiPropertyOptional({
    description: 'Кастомный номер чека от мерчанта',
    name: 'invoice_num',
  })
  @Transform(({ value, obj }) => {
    return value ?? obj?.invoice_num ?? obj?.invoiceNum ?? obj?.orderId;
  })
  @IsOptional()
  @IsString()
  invoice_num?: string;

  @ApiPropertyOptional({
    description: 'ID операции лояльности (order_id)',
    name: 'order_id',
  })
  @Transform(({ value, obj }) => value ?? obj?.order_id ?? obj?.receiptId)
  @IsOptional()
  @IsString()
  order_id?: string;

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

export class IntegrationOutletManagerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Код/внешний ID' })
  code?: string | null;
}

export class IntegrationOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) address?: string | null;
  @ApiPropertyOptional({ nullable: true }) description?: string | null;
  @ApiPropertyOptional({
    description: 'Сотрудники, привязанные к точке',
    type: () => [IntegrationOutletManagerDto],
  })
  managers?: IntegrationOutletManagerDto[];
}

export class IntegrationOutletsRespDto {
  @ApiProperty({ type: [IntegrationOutletDto] })
  items!: IntegrationOutletDto[];
}

export class IntegrationDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'Код устройства (из настроек торговой точки, регистр сохраняется)',
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
    description: 'Поиск по invoice_num/receiptNumber',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => {
    return value ?? obj?.orderId ?? obj?.order_id ?? obj?.invoice_num;
  })
  invoice_num?: string;

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

  @ApiProperty({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  id_client!: string;

  @ApiProperty({
    description: 'Кастомный номер чека от мерчанта',
    name: 'invoice_num',
  })
  invoice_num!: string;

  @ApiProperty({
    description: 'Внутренний ID операции лояльности',
    name: 'order_id',
  })
  order_id!: string;

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
