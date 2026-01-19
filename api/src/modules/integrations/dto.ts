import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const pick = (obj: unknown, keys: string[]): unknown => {
  const record = toRecord(obj);
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
};

const pickValue = (value: unknown, obj: unknown, keys: string[]): unknown =>
  value ?? pick(obj, keys);

const isNonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

@ValidatorConstraint({ name: 'ClientIdentifier', async: false })
class ClientIdentifierConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const obj = args?.object ?? null;
    const userToken = isNonEmptyString(pick(obj, ['user_token', 'userToken']));
    const idClient = isNonEmptyString(pick(obj, ['id_client']));
    return userToken || idClient;
  }

  defaultMessage() {
    return 'Укажите user_token или id_client';
  }
}

@ValidatorConstraint({ name: 'CalculateClientIdentifier', async: false })
class CalculateClientIdentifierConstraint
  implements ValidatorConstraintInterface
{
  validate(_: unknown, args: ValidationArguments) {
    const obj = args?.object ?? null;
    const userToken = isNonEmptyString(pick(obj, ['user_token', 'userToken']));
    const idClient = isNonEmptyString(pick(obj, ['id_client']));
    const phone = isNonEmptyString(
      pick(obj, ['phone', 'phone_number', 'phoneNumber']),
    );
    return userToken || idClient || phone;
  }

  defaultMessage() {
    return 'Укажите user_token, id_client или phone';
  }
}

@ValidatorConstraint({ name: 'BonusContext', async: false })
class BonusContextConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const obj = args?.object ?? null;
    const outletId = isNonEmptyString(pick(obj, ['outlet_id', 'outletId']));
    const deviceId = isNonEmptyString(pick(obj, ['device_id', 'deviceId']));
    const managerId = isNonEmptyString(pick(obj, ['manager_id', 'managerId']));
    return outletId || deviceId || managerId;
  }

  defaultMessage() {
    return 'Нужно передать outlet_id или device_id или manager_id';
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

  @ApiPropertyOptional({ description: 'Название товара' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Количество', example: 1 })
  @Transform(({ value, obj }) => pickValue(value, obj, ['quantity', 'qty']))
  @IsNumber()
  qty!: number;

  @ApiProperty({ description: 'Цена за единицу', example: 450 })
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    description: 'Цена до применения акции (опционально)',
    name: 'base_price',
  })
  @IsOptional()
  @IsNumber()
  base_price?: number;

  @ApiPropertyOptional({
    description: 'ID применённых акций',
    isArray: true,
    name: 'actions',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['actions', 'actions_id', 'actionsId']),
  )
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  @ApiPropertyOptional({
    description: 'Названия применённых акций',
    isArray: true,
    name: 'action_names',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, [
      'action_names',
      'actions_names',
      'actionNames',
      'actionsNames',
    ]),
  )
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  action_names?: string[];
}

export class IntegrationCodeRequestDto {
  @ApiProperty()
  @IsString()
  @Transform(({ value, obj }) => pickValue(value, obj, ['userToken']))
  user_token!: string;
}

export class IntegrationBonusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Validate(ClientIdentifierConstraint)
  @Transform(({ value, obj }) => pickValue(value, obj, ['userToken']))
  user_token?: string;

  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['idClient', 'customerId', 'merchant_customer_id']),
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
  @Transform(
    ({ value, obj }) =>
      pickValue(value, obj, [
        'invoice_num',
        'invoiceNum',
        'orderId',
        'order_id',
      ]) ?? null,
  )
  @IsOptional()
  @IsString()
  invoice_num?: string;

  @ApiProperty({
    description: 'Уникальный ключ идемпотентности операции',
    name: 'idempotency_key',
  })
  @Transform(({ value, obj }) => pickValue(value, obj, ['idempotencyKey']))
  @IsString()
  idempotency_key!: string;

  @ApiPropertyOptional({
    description: 'Сумма заказа (если не передана — считаем по items)',
    name: 'total',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
    name: 'device_id',
  })
  @Transform(({ value, obj }) => pickValue(value, obj, ['deviceId']))
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional()
  @Transform(({ value, obj }) => pickValue(value, obj, ['outletId']))
  @IsOptional()
  @IsString()
  outlet_id?: string;

  @ApiPropertyOptional({
    description: 'Название торговой точки (опционально)',
    name: 'outlet_name',
  })
  @IsOptional()
  @IsString()
  outlet_name?: string;

  @ApiPropertyOptional({
    description: 'Идентификатор сотрудника/кассира (managerId)',
    name: 'manager_id',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['id_manager', 'manager_id', 'managerId']),
  )
  @IsOptional()
  @IsString()
  manager_id?: string;

  @ApiPropertyOptional({
    description: 'Имя сотрудника (опционально)',
    name: 'manager_name',
  })
  @IsOptional()
  @IsString()
  manager_name?: string;

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
    name: 'operation_date',
  })
  @Transform(({ value, obj }) => pickValue(value, obj, ['operationDate']))
  @IsOptional()
  @IsString()
  operation_date?: string;

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
  @Transform(({ value, obj }) => pickValue(value, obj, ['quantity']))
  @IsNumber()
  qty!: number;

  @ApiProperty({
    description: 'Цена за единицу',
  })
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({
    description: 'Название товара',
  })
  @IsOptional()
  @IsString()
  name?: string;
}

export class IntegrationCalculateActionDto {
  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['idClient', 'customerId', 'merchant_customer_id']),
  )
  @IsOptional()
  @IsString()
  id_client?: string;

  @ApiPropertyOptional({
    description: 'Телефон клиента',
    name: 'phone',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['phone_number', 'phoneNumber']),
  )
  @IsOptional()
  @IsString()
  phone?: string;

  @Validate(CalculateClientIdentifierConstraint)
  _clientIdentifierValidator?: string;

  @ApiProperty({
    type: [IntegrationCalculateActionItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationCalculateActionItemDto)
  items!: IntegrationCalculateActionItemDto[];

  @ApiPropertyOptional({
    description: 'ID торговой точки (опционально)',
    name: 'outlet_id',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['outlet_id', 'outletId']),
  )
  @IsOptional()
  @IsString()
  outlet_id?: string;
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
    const raw = pickValue(value, obj, ['quantity', 'qty']);
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
    description: 'ID применённых акций',
    isArray: true,
    name: 'actions',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['actions', 'actions_id', 'actionsId']),
  )
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  @ApiPropertyOptional({
    description: 'Названия применённых акций',
    isArray: true,
    name: 'action_names',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, [
      'action_names',
      'actions_names',
      'actionNames',
      'actionsNames',
    ]),
  )
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  action_names?: string[];
}

export class IntegrationCalculateBonusDto {
  @ApiPropertyOptional({
    description: 'Токен клиента (QR)',
  })
  @IsOptional()
  @IsString()
  @Validate(CalculateClientIdentifierConstraint)
  @Transform(({ value, obj }) => pickValue(value, obj, ['userToken']))
  user_token?: string;

  @ApiPropertyOptional({
    description: 'ID клиента в системе лояльности',
    name: 'id_client',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['idClient', 'customerId', 'merchant_customer_id']),
  )
  @IsOptional()
  @IsString()
  id_client?: string;

  @ApiPropertyOptional({
    description: 'Телефон клиента',
    name: 'phone',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['phone_number', 'phoneNumber']),
  )
  @IsOptional()
  @IsString()
  phone?: string;

  @Validate(CalculateClientIdentifierConstraint)
  _clientIdentifierValidator?: string;

  @ApiPropertyOptional()
  @Transform(({ value, obj }) => pickValue(value, obj, ['outletId']))
  @IsOptional()
  @IsString()
  outlet_id?: string;

  @ApiPropertyOptional({
    description: 'Сумма заказа (если items не передаётся)',
    name: 'total',
    minimum: 0,
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['to_pay', 'order_price']),
  )
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
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['invoice_num', 'invoiceNum', 'orderId']),
  )
  @IsOptional()
  @IsString()
  invoice_num?: string;

  @ApiPropertyOptional({
    description: 'ID операции лояльности (order_id)',
    name: 'order_id',
  })
  @Transform(({ value, obj }) =>
    pickValue(value, obj, ['order_id', 'receiptId']),
  )
  @IsOptional()
  @IsString()
  order_id?: string;

  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
    name: 'device_id',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => pickValue(value, obj, ['deviceId']))
  device_id?: string;

  @ApiPropertyOptional({ name: 'outlet_id' })
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => pickValue(value, obj, ['outletId']))
  outlet_id?: string;

  @ApiPropertyOptional({
    description: 'Дата операции (ISO 8601), может быть в прошлом',
    name: 'operation_date',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => pickValue(value, obj, ['operationDate']))
  operation_date?: string;
}
