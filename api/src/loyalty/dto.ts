import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';

export enum Mode {
  REDEEM = 'redeem',
  EARN = 'earn',
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
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  eligibleTotal: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
  @ApiPropertyOptional({ description: 'Категория товара/чека для правил' })
  @IsOptional()
  @IsString()
  category?: string;
  @ApiPropertyOptional({ description: 'Опциональный промокод' })
  @IsOptional()
  @IsString()
  promoCode?: string;
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
  @ApiPropertyOptional({
    description: 'Опциональный промокод для фиксации использования',
  })
  @IsOptional()
  @IsString()
  promoCode?: string;
}

export class QrMintDto {
  @ApiProperty()
  @IsString()
  merchantCustomerId: string;
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
  orderId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;
  // сумма возврата по чеку; для частичного возврата укажи часть
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  refundTotal: number;
  // база возврата (если в исходном чеке были исключения); можно не указывать — возьмём пропорцию по total
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundEligibleTotal?: number;
}

// ====== Swagger DTOs for responses ======

export class QuoteRedeemRespDto {
  @ApiProperty() canRedeem!: boolean;
  @ApiProperty() discountToApply!: number;
  @ApiProperty() pointsToBurn!: number;
  @ApiProperty() finalPayable!: number;
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
  @ApiPropertyOptional({ type: ReviewsShareSettingsDto, nullable: true })
  reviewsShare?: ReviewsShareSettingsDto | null;
}

export class BalanceDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() merchantCustomerId!: string;
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
  merchantCustomerId!: string;
  @ApiProperty()
  customerId!: string;
  @ApiPropertyOptional({ nullable: true })
  name?: string | null;
  @ApiPropertyOptional({ nullable: true })
  balance?: number | null;
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
  @ApiProperty() merchantCustomerId!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() outletId?: string | null;
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
}

export class CustomerPhoneStatusDto {
  @ApiProperty()
  hasPhone!: boolean;
}

export class CustomerProfileSaveDto {
  @ApiProperty() @IsString() merchantId!: string;
  @ApiProperty() @IsString() merchantCustomerId!: string;
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
