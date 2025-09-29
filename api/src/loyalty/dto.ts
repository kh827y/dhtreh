import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Mode { REDEEM = 'redeem', EARN = 'earn' }

export class QuoteDto {
  @ApiProperty({ enum: Mode })
  @IsEnum(Mode) mode: Mode;
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty({ description: 'customerId или JWT' })
  @IsString() userToken: string; // customerId или JWT
  @ApiProperty()
  @IsString() orderId: string;
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) total: number;
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) eligibleTotal: number;
  @ApiPropertyOptional()
  @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() staffId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() requestId?: string;
  @ApiPropertyOptional({ description: 'Категория товара/чека для правил' })
  @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ description: 'Опциональный промокод' })
  @IsOptional() @IsString() promoCode?: string;
}

export class CommitDto {
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty()
  @IsString() holdId: string;
  @ApiProperty()
  @IsString() orderId: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() receiptNumber?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() requestId?: string;
  @ApiPropertyOptional({ description: 'Опциональный промокод для фиксации использования' })
  @IsOptional() @IsString() promoCode?: string;
}

export class QrMintDto {
  @ApiProperty()
  @IsString() customerId: string;
  @ApiPropertyOptional({ minimum: 10 })
  @IsOptional() @Min(10) ttlSec?: number;
  @ApiPropertyOptional()
  @IsOptional() @IsString() merchantId?: string; // <— добавили
  @ApiPropertyOptional({ description: 'Telegram initData для серверной проверки подписи' })
  @IsOptional() @IsString() initData?: string;
}

export class RefundDto {
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty()
  @IsString() orderId: string;
  // сумма возврата по чеку; для частичного возврата укажи часть
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) refundTotal: number;
  // база возврата (если в исходном чеке были исключения); можно не указывать — возьмём пропорцию по total
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber() @Min(0) refundEligibleTotal?: number;
  // опциональная атрибуция устройства для проверки подписи Bridge при приоритете device.secret
  @ApiPropertyOptional()
  @IsOptional() @IsString() deviceId?: string;
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

export class PublicSettingsDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() qrTtlSec!: number;
}

export class BalanceDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() balance!: number;
}

export class OkDto { @ApiProperty() ok!: boolean; }

export class QrMintRespDto {
  @ApiProperty() token!: string;
  @ApiProperty() ttl!: number;
}

export class TransactionItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['EARN','REDEEM','REFUND','ADJUST'] }) type!: 'EARN'|'REDEEM'|'REFUND'|'ADJUST';
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() orderId?: string|null;
  @ApiProperty() customerId!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() outletId?: string|null;
  @ApiPropertyOptional() deviceId?: string|null;
  @ApiPropertyOptional() staffId?: string|null;
}

export class TransactionsRespDto {
  @ApiProperty({ type: [TransactionItemDto] }) items!: TransactionItemDto[];
  @ApiPropertyOptional({ nullable: true }) nextBefore?: string|null;
}

export class PublicOutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string;
}

export class PublicDeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiPropertyOptional() label?: string;
  @ApiPropertyOptional() outletId?: string;
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
