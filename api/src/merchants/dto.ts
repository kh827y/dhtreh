import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeviceType, StaffRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMerchantSettingsDto {
  @ApiProperty({ minimum: 0, maximum: 10000, description: '10000 б.п. = 100%' })
  @IsInt() @Min(0) @Max(10000)
  earnBps!: number;           // 10000 б.п. = 100%

  @ApiProperty({ minimum: 0, maximum: 10000, description: 'Лимит списания, 5000 = 50%' })
  @IsInt() @Min(0) @Max(10000)
  redeemLimitBps!: number;    // 5000 = 50%

  @ApiPropertyOptional({ minimum: 15, maximum: 600 })
  @IsOptional() @IsInt() @Min(15) @Max(600)
  qrTtlSec?: number;          // TTL QR по умолчанию

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  webhookKeyId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  webhookSecretNext?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  webhookKeyIdNext?: string;
  @ApiPropertyOptional()
  @IsOptional()
  useWebhookNext?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 86400 })
  @IsOptional() @IsInt() @Min(0) @Max(86400)
  redeemCooldownSec?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 86400 })
  @IsOptional() @IsInt() @Min(0) @Max(86400)
  earnCooldownSec?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  redeemDailyCap?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  earnDailyCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  requireJwtForQuote?: boolean;

  @ApiPropertyOptional({ description: 'JSON-правила для earnBps/redeemLimitBps' })
  @IsOptional()
  rulesJson?: any;

  @ApiPropertyOptional()
  @IsOptional()
  requireBridgeSig?: boolean;
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  bridgeSecret?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  bridgeSecretNext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  requireStaffKey?: boolean;

  @ApiPropertyOptional({ minimum: 0, description: 'TTL баллов (в днях). 0 или отсутствие — отключено' })
  @IsOptional() @IsInt() @Min(0)
  pointsTtlDays?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Задержка начисления (в днях). 0 или отсутствие — немедленно' })
  @IsOptional() @IsInt() @Min(0)
  earnDelayDays?: number;

  // Telegram/miniapp настройки
  @ApiPropertyOptional({ description: 'Telegram Bot Token для мини-аппы мерчанта' })
  @IsOptional() @IsString()
  telegramBotToken?: string;
  @ApiPropertyOptional({ description: 'Telegram Bot Username (например, @my_bot)' })
  @IsOptional() @IsString()
  telegramBotUsername?: string;
  @ApiPropertyOptional({ description: 'Требовать start_param при запуске мини-аппы' })
  @IsOptional()
  telegramStartParamRequired?: boolean;
  @ApiPropertyOptional({ description: 'Базовый URL мини-аппы (для Deep Link)' })
  @IsOptional() @IsString()
  miniappBaseUrl?: string;
  @ApiPropertyOptional({ description: 'Цвет основной темы мини-аппы (HEX)' })
  @IsOptional() @IsString()
  miniappThemePrimary?: string;
  @ApiPropertyOptional({ description: 'Цвет фона мини-аппы (HEX)' })
  @IsOptional() @IsString()
  miniappThemeBg?: string;
  @ApiPropertyOptional({ description: 'URL логотипа мини-аппы' })
  @IsOptional() @IsString()
  miniappLogoUrl?: string;
}

export class CreateOutletDto {
  @ApiProperty()
  @IsString() name!: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() address?: string;
}

export class UpdateOutletDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() address?: string;
}

export class CreateDeviceDto {
  @ApiProperty({ enum: DeviceType })
  @IsString() type!: keyof typeof DeviceType | string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() label?: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() label?: string;
}

export class CreateStaffDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() login?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional() @IsString() role?: keyof typeof StaffRole | string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() login?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional() @IsString() role?: keyof typeof StaffRole | string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() allowedOutletId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() allowedDeviceId?: string;
}

// ===== Response DTOs =====

export class MerchantSettingsRespDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() earnBps!: number;
  @ApiProperty() redeemLimitBps!: number;
  @ApiProperty() qrTtlSec!: number;
  @ApiPropertyOptional() webhookUrl?: string|null;
  @ApiPropertyOptional() webhookSecret?: string|null;
  @ApiPropertyOptional() webhookKeyId?: string|null;
  @ApiProperty() requireBridgeSig!: boolean;
  @ApiPropertyOptional() bridgeSecret?: string|null;
  @ApiProperty() redeemCooldownSec!: number;
  @ApiProperty() earnCooldownSec!: number;
  @ApiPropertyOptional() redeemDailyCap?: number|null;
  @ApiPropertyOptional() earnDailyCap?: number|null;
  @ApiProperty() requireJwtForQuote!: boolean;
  @ApiPropertyOptional() rulesJson?: any;
  @ApiProperty() requireStaffKey!: boolean;
  @ApiPropertyOptional({ description: 'TTL баллов (в днях). Предпросмотр через outbox, списание отключено.' }) pointsTtlDays?: number|null;
  @ApiPropertyOptional({ description: 'Задержка начисления (в днях)' }) earnDelayDays?: number|null;
  // Telegram/miniapp
  @ApiPropertyOptional() telegramBotToken?: string|null;
  @ApiPropertyOptional() telegramBotUsername?: string|null;
  @ApiPropertyOptional() telegramStartParamRequired?: boolean;
  @ApiPropertyOptional() miniappBaseUrl?: string|null;
  @ApiPropertyOptional() miniappThemePrimary?: string|null;
  @ApiPropertyOptional() miniappThemeBg?: string|null;
  @ApiPropertyOptional() miniappLogoUrl?: string|null;
  @ApiPropertyOptional() outboxPausedUntil?: Date|null;
}

export class OutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string|null;
  @ApiProperty() createdAt!: Date;
}

export class DeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() outletId?: string|null;
  @ApiProperty({ enum: DeviceType }) type!: keyof typeof DeviceType | string;
  @ApiPropertyOptional() label?: string|null;
  @ApiPropertyOptional() lastSeenAt?: Date|null;
  @ApiProperty() createdAt!: Date;
}

export class StaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() login?: string|null;
  @ApiPropertyOptional() email?: string|null;
  @ApiProperty({ enum: StaffRole }) role!: keyof typeof StaffRole | string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() allowedOutletId?: string|null;
  @ApiPropertyOptional() allowedDeviceId?: string|null;
  @ApiPropertyOptional() apiKeyHash?: string|null;
  @ApiProperty() createdAt!: Date;
}

export class SecretRespDto { @ApiProperty() secret!: string; }
export class TokenRespDto { @ApiProperty() token!: string; }
export class OkDto { @ApiProperty() ok!: boolean; }

export class OutboxEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() payload!: any;
  @ApiProperty() status!: string;
  @ApiProperty() retries!: number;
  @ApiPropertyOptional() nextRetryAt?: Date|null;
  @ApiPropertyOptional() lastError?: string|null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BulkUpdateRespDto { @ApiProperty() ok!: boolean; @ApiProperty() updated!: number; }

export class ReceiptDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional() receiptNumber?: string|null;
  @ApiProperty() total!: number;
  @ApiProperty() eligibleTotal!: number;
  @ApiProperty() redeemApplied!: number;
  @ApiProperty() earnApplied!: number;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() outletId?: string|null;
  @ApiPropertyOptional() deviceId?: string|null;
  @ApiPropertyOptional() staffId?: string|null;
}

export class CustomerSearchRespDto {
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional() phone?: string|null;
  @ApiProperty() balance!: number;
}

export class LedgerEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() customerId?: string|null;
  @ApiProperty() debit!: string;   // LedgerAccount
  @ApiProperty() credit!: string;  // LedgerAccount
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() orderId?: string|null;
  @ApiPropertyOptional() receiptId?: string|null;
  @ApiPropertyOptional() outletId?: string|null;
  @ApiPropertyOptional() deviceId?: string|null;
  @ApiPropertyOptional() staffId?: string|null;
  @ApiPropertyOptional() meta?: any;
  @ApiProperty() createdAt!: Date;
}

export class EarnLotDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() points!: number;
  @ApiProperty() consumedPoints!: number;
  @ApiProperty() earnedAt!: Date;
  @ApiPropertyOptional() expiresAt?: Date|null;
  @ApiPropertyOptional() orderId?: string|null;
  @ApiPropertyOptional() receiptId?: string|null;
  @ApiPropertyOptional() outletId?: string|null;
  @ApiPropertyOptional() deviceId?: string|null;
  @ApiPropertyOptional() staffId?: string|null;
  @ApiProperty() createdAt!: Date;
}
