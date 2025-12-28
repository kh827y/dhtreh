import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType, TxnType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export enum Mode {
  REDEEM = 'redeem',
  EARN = 'earn',
}

export class LoyaltyPositionDto {
  @ApiPropertyOptional({ description: 'Внутренний ID товара' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Провайдер внешней системы (iiko, r_keeper, MoySklad и т.п.)',
  })
  @IsOptional()
  @IsString()
  externalProvider?: string;

  @ApiPropertyOptional({
    description: 'Внешний ID товара в указанной системе',
  })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ description: 'Штрихкод товара' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Артикул/SKU товара' })
  @IsOptional()
  @IsString()
  sku?: string;

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

export class QuoteDto {
  @ApiProperty({ enum: Mode })
  @IsEnum(Mode)
  mode: Mode;
  @ApiProperty()
  @IsString()
  merchantId: string;
  @ApiProperty({ description: 'customerId или JWT' })
  @IsString()
  userToken: string; // customerId или JWT
  @ApiProperty()
  @IsString()
  orderId: string;
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  total: number;
  @ApiPropertyOptional({
    description: 'Сумма списания в баллах (в рублях)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  redeemAmount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;
  @ApiPropertyOptional({
    description: 'Идентификатор устройства (код из настроек торговой точки)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ type: () => [LoyaltyPositionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoyaltyPositionDto)
  positions?: LoyaltyPositionDto[];
}

export class CommitDto {
  @ApiProperty()
  @IsString()
  merchantId: string;
  @ApiProperty()
  @IsString()
  holdId: string;
  @ApiProperty()
  @IsString()
  orderId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ type: () => [LoyaltyPositionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoyaltyPositionDto)
  positions?: LoyaltyPositionDto[];
}

export class QrMintDto {
  @ApiProperty()
  @IsString()
  customerId: string;
  @ApiPropertyOptional({ minimum: 10 })
  @IsOptional()
  @Min(10)
  ttlSec?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string; // <— добавили
  @ApiPropertyOptional({
    description: 'Telegram initData для серверной проверки подписи',
  })
  @IsOptional()
  @IsString()
  initData?: string;
}

export class RefundDto {
  @ApiProperty()
  @IsString()
  merchantId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value, obj }) => {
    return (
      value ??
      obj?.invoice_num ??
      obj?.invoiceNum ??
      obj?.orderId ??
      obj?.order_id
    );
  })
  invoice_num?: string;
  @ApiPropertyOptional({
    description: 'ID операции лояльности (order_id/receiptId)',
  })
  @Transform(({ value, obj }) => value ?? obj?.order_id ?? obj?.receiptId)
  @IsOptional()
  @IsString()
  order_id?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;
  @ApiPropertyOptional({
    description: 'Идентификатор устройства, с которого оформляется возврат',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Дата операции (ISO 8601)',
  })
  @IsOptional()
  @IsString()
  operationDate?: string;
}

// ====== Swagger DTOs for responses ======

export class QuoteRedeemRespDto {
  @ApiProperty() canRedeem!: boolean;
  @ApiProperty() discountToApply!: number;
  @ApiProperty() pointsToBurn!: number;
  @ApiProperty() finalPayable!: number;
  @ApiPropertyOptional() postEarnPoints?: number;
  @ApiPropertyOptional() postEarnOnAmount?: number;
  @ApiPropertyOptional() holdId?: string;
  @ApiPropertyOptional() message?: string;
}

export class QuoteEarnRespDto {
  @ApiProperty() canEarn!: boolean;
  @ApiProperty() pointsToEarn!: number;
  @ApiPropertyOptional() holdId?: string;
  @ApiPropertyOptional() message?: string;
}

export class CommitRespDto {
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() alreadyCommitted?: boolean;
  @ApiPropertyOptional() receiptId?: string;
  @ApiPropertyOptional() redeemApplied?: number;
  @ApiPropertyOptional() earnApplied?: number;
}

export class RefundRespDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() share!: number;
  @ApiProperty() pointsRestored!: number;
  @ApiProperty() pointsRevoked!: number;
}

export class ReviewsSharePlatformOutletDto {
  @ApiProperty() outletId!: string;
  @ApiProperty() url!: string;
}

export class ReviewsSharePlatformDto {
  @ApiProperty() id!: string;
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) url?: string | null;
  @ApiProperty({ type: [ReviewsSharePlatformOutletDto] })
  outlets!: ReviewsSharePlatformOutletDto[];
}

export class ReviewsShareSettingsDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() threshold!: number;
  @ApiProperty({ type: [ReviewsSharePlatformDto] })
  platforms!: ReviewsSharePlatformDto[];
}

export class PublicSettingsDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() qrTtlSec!: number;
  @ApiPropertyOptional({ nullable: true }) miniappThemePrimary?: string | null;
  @ApiPropertyOptional({ nullable: true }) miniappThemeBg?: string | null;
  @ApiPropertyOptional({ nullable: true }) miniappLogoUrl?: string | null;
  @ApiPropertyOptional({ nullable: true })
  reviewsEnabled?: boolean | null;
  @ApiPropertyOptional({ type: ReviewsShareSettingsDto, nullable: true })
  reviewsShare?: ReviewsShareSettingsDto | null;
}

export class BalanceDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() balance!: number;
}

export class CashierCustomerResolveDto {
  @ApiProperty()
  @IsString()
  merchantId!: string;
  @ApiProperty()
  @IsString()
  userToken!: string;
}

export class CashierCustomerResolveRespDto {
  @ApiProperty()
  customerId!: string;
  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
  @ApiPropertyOptional({ nullable: true })
  balance?: number | null;
  @ApiPropertyOptional({ nullable: true })
  redeemLimitBps?: number | null;
  @ApiPropertyOptional({ nullable: true })
  minPaymentAmount?: number | null;
}

export class OkDto {
  @ApiProperty() ok!: boolean;
}

export class QrMintRespDto {
  @ApiProperty() token!: string;
  @ApiProperty() ttl!: number;
}

export class TransactionItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: [
      'EARN',
      'REDEEM',
      'REFUND',
      'ADJUST',
      'CAMPAIGN',
      'REFERRAL',
      'REGISTRATION',
    ],
  })
  type!:
    | 'EARN'
    | 'REDEEM'
    | 'REFUND'
    | 'ADJUST'
    | 'CAMPAIGN'
    | 'REFERRAL'
    | 'REGISTRATION';
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() orderId?: string | null;
  @ApiPropertyOptional({ nullable: true }) receiptNumber?: string | null;
  @ApiProperty() customerId!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() outletId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Идентификатор устройства (код)',
  })
  deviceId?: string | null;
  @ApiPropertyOptional({ enum: DeviceType, nullable: true }) outletPosType?:
    | keyof typeof DeviceType
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  outletLastSeenAt?: string | null;
  @ApiPropertyOptional() staffId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Идентификатор созданного отзыва',
  })
  reviewId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Рейтинг из созданного отзыва',
  })
  reviewRating?: number | null;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Дата и время создания отзыва',
  })
  reviewCreatedAt?: string | null;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Когда пользователь закрыл окно отзыва без оценки',
  })
  reviewDismissedAt?: string | null;
  @ApiPropertyOptional({
    description: 'Флаг отложенного начисления (на удержании)',
  })
  pending?: boolean;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Когда баллы будут зачислены',
  })
  maturesAt?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Сколько дней осталось до зачисления (округлено вверх)',
  })
  daysUntilMature?: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Источник операции из metadata (например MANUAL_ACCRUAL, COMPLIMENTARY)',
  })
  source?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Комментарий или описание операции из metadata',
  })
  comment?: string | null;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Когда операция была отменена (если применимо)',
  })
  canceledAt?: string | null;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Дата и время исходной операции (для возвратов)',
  })
  relatedOperationAt?: string | null;
}

export class TransactionsRespDto {
  @ApiProperty({ type: [TransactionItemDto] }) items!: TransactionItemDto[];
  @ApiPropertyOptional({ nullable: true }) nextBefore?: string | null;
}

export class CashierOutletTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: ['PURCHASE', 'REFUND', 'TXN'],
    description:
      'PURCHASE — агрегированная запись чека (earn/redeem вместе), REFUND — возврат по чеку (агрегировано), TXN — отдельная транзакция',
  })
  mode!: 'PURCHASE' | 'REFUND' | 'TXN';
  @ApiPropertyOptional({ enum: TxnType, nullable: true })
  type?: TxnType | null;
  @ApiPropertyOptional() amount?: number | null;
  @ApiPropertyOptional({ nullable: true }) orderId?: string | null;
  @ApiPropertyOptional({ nullable: true }) receiptNumber?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) outletId?: string | null;
  @ApiPropertyOptional({ nullable: true }) outletName?: string | null;
  @ApiPropertyOptional({ nullable: true }) purchaseAmount?: number | null;
  @ApiPropertyOptional({ nullable: true }) earnApplied?: number | null;
  @ApiPropertyOptional({ nullable: true }) redeemApplied?: number | null;
  @ApiPropertyOptional({ nullable: true }) refundEarn?: number | null;
  @ApiPropertyOptional({ nullable: true }) refundRedeem?: number | null;
  @ApiPropertyOptional({ nullable: true }) staffName?: string | null;
  @ApiPropertyOptional({ nullable: true }) customerName?: string | null;
}

export class CashierOutletTransactionsRespDto {
  @ApiProperty({ type: [CashierOutletTransactionDto] })
  items!: CashierOutletTransactionDto[];
  @ApiPropertyOptional({ nullable: true }) nextBefore?: string | null;
  @ApiProperty() allowSameReceipt!: boolean;
}

export class PublicOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string;
}

export class PublicStaffDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() login?: string;
  @ApiProperty() role!: string;
}

export class ConsentGetRespDto {
  @ApiProperty() granted!: boolean;
  @ApiPropertyOptional() consentAt?: string;
}

export class ErrorDto {
  @ApiProperty() error!: string;
  @ApiProperty() message!: string;
  @ApiProperty() statusCode!: number;
  @ApiPropertyOptional() requestId?: string;
  @ApiPropertyOptional() path?: string;
  @ApiPropertyOptional() timestamp?: string;
}

export class CustomerProfileDto {
  @ApiPropertyOptional({ nullable: true }) name?: string | null;
  @ApiPropertyOptional({ enum: ['male', 'female'], nullable: true }) gender?:
    | 'male'
    | 'female'
    | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  birthDate?: string | null; // YYYY-MM-DD
  @ApiPropertyOptional({ nullable: true }) customerId?: string | null;
}

export class CustomerPhoneStatusDto {
  @ApiProperty()
  hasPhone!: boolean;
}

export class CustomerProfileSaveDto {
  @ApiProperty() @IsString() merchantId!: string;
  @ApiProperty() @IsString() customerId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ['male', 'female'] }) @IsString() gender!:
    | 'male'
    | 'female';
  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  @IsString()
  birthDate!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}
