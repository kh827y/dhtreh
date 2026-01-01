import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Length,
} from 'class-validator';
import { DeviceType, StaffRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RUSSIA_TIMEZONES } from '../timezone/russia-timezones';

export class UpdateMerchantSettingsDto {
  @ApiProperty({ minimum: 0, maximum: 10000, description: '10000 б.п. = 100%' })
  @IsInt()
  @Min(0)
  @Max(10000)
  earnBps!: number; // 10000 б.п. = 100%

  @ApiProperty({
    minimum: 0,
    maximum: 10000,
    description: 'Лимит списания, 5000 = 50%',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  redeemLimitBps!: number; // 5000 = 50%

  @ApiPropertyOptional({ minimum: 15, maximum: 600 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(600)
  qrTtlSec?: number; // TTL QR по умолчанию

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookKeyId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecretNext?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookKeyIdNext?: string;
  @ApiPropertyOptional()
  @IsOptional()
  useWebhookNext?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  redeemCooldownSec?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  earnCooldownSec?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  redeemDailyCap?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  earnDailyCap?: number;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Максимальное количество торговых точек (без лимита, если не задано)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutlets?: number;

  @ApiPropertyOptional()
  @IsOptional()
  requireJwtForQuote?: boolean;

  @ApiPropertyOptional({
    description: 'JSON-правила для earnBps/redeemLimitBps',
  })
  @IsOptional()
  rulesJson?: any;

  @ApiPropertyOptional()
  @IsOptional()
  requireBridgeSig?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bridgeSecret?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bridgeSecretNext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  requireStaffKey?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'TTL баллов (в днях). 0 или отсутствие — отключено',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsTtlDays?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Задержка начисления (в днях). 0 или отсутствие — немедленно',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  earnDelayDays?: number;

  // Telegram/miniapp настройки
  @ApiPropertyOptional({
    description: 'Telegram Bot Token для мини-аппы мерчанта',
  })
  @IsOptional()
  @IsString()
  telegramBotToken?: string;
  @ApiPropertyOptional({
    description: 'Telegram Bot Username (например, @my_bot)',
  })
  @IsOptional()
  @IsString()
  telegramBotUsername?: string;
  @ApiPropertyOptional({
    description: 'Требовать start_param при запуске мини-аппы',
  })
  @IsOptional()
  telegramStartParamRequired?: boolean;
  @ApiPropertyOptional({ description: 'Базовый URL мини-аппы (для Deep Link)' })
  @IsOptional()
  @IsString()
  miniappBaseUrl?: string;
  @ApiPropertyOptional({ description: 'Цвет основной темы мини-аппы (HEX)' })
  @IsOptional()
  @IsString()
  miniappThemePrimary?: string;
  @ApiPropertyOptional({ description: 'Цвет фона мини-аппы (HEX)' })
  @IsOptional()
  @IsString()
  miniappThemeBg?: string;
  @ApiPropertyOptional({ description: 'URL логотипа мини-аппы' })
  @IsOptional()
  @IsString()
  miniappLogoUrl?: string;

  @ApiPropertyOptional({
    description: 'Часовой пояс мерчанта в формате «МСК±N»',
    enum: RUSSIA_TIMEZONES.map((tz) => tz.code),
  })
  @IsOptional()
  @IsIn(RUSSIA_TIMEZONES.map((tz) => tz.code))
  timezone?: string;
}

export class CreateOutletDto {
  @ApiProperty()
  @IsString()
  name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateOutletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  login?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsString()
  role?: keyof typeof StaffRole | string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canAccessPortal?: boolean;
  @ApiPropertyOptional({
    description: 'Пароль для входа в портал (минимум 6 символов)',
  })
  @IsOptional()
  @IsString()
  password?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  login?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsString()
  role?: keyof typeof StaffRole | string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional({
    description: 'Ограничение доступа сотрудника на конкретную торговую точку',
  })
  @IsOptional()
  @IsString()
  allowedOutletId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canAccessPortal?: boolean;
  @ApiPropertyOptional({ description: 'Новый пароль для входа в портал' })
  @IsOptional()
  @IsString()
  password?: string;
  @ApiPropertyOptional({
    description: 'Текущий пароль (для смены пользователем)',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

// ===== Response DTOs =====

export class MerchantSettingsRespDto {
  @ApiProperty() merchantId!: string;
  @ApiProperty() earnBps!: number;
  @ApiProperty() redeemLimitBps!: number;
  @ApiProperty() qrTtlSec!: number;
  @ApiPropertyOptional() webhookUrl?: string | null;
  @ApiPropertyOptional() webhookSecret?: string | null;
  @ApiPropertyOptional() webhookKeyId?: string | null;
  @ApiProperty() requireBridgeSig!: boolean;
  @ApiPropertyOptional() bridgeSecret?: string | null;
  @ApiProperty() redeemCooldownSec!: number;
  @ApiProperty() earnCooldownSec!: number;
  @ApiPropertyOptional() redeemDailyCap?: number | null;
  @ApiPropertyOptional() earnDailyCap?: number | null;
  @ApiPropertyOptional({ description: 'Максимальное количество торговых точек' })
  maxOutlets?: number | null;
  @ApiProperty() requireJwtForQuote!: boolean;
  @ApiPropertyOptional() rulesJson?: any;
  @ApiProperty() requireStaffKey!: boolean;
  @ApiPropertyOptional({
    description:
      'TTL баллов (в днях). Предпросмотр через outbox, списание отключено.',
  })
  pointsTtlDays?: number | null;
  @ApiPropertyOptional({ description: 'Задержка начисления (в днях)' })
  earnDelayDays?: number | null;
  // Telegram/miniapp
  @ApiPropertyOptional() telegramBotToken?: string | null;
  @ApiPropertyOptional() telegramBotUsername?: string | null;
  @ApiPropertyOptional() telegramStartParamRequired?: boolean;
  @ApiPropertyOptional() miniappBaseUrl?: string | null;
  @ApiPropertyOptional() miniappThemePrimary?: string | null;
  @ApiPropertyOptional() miniappThemeBg?: string | null;
  @ApiPropertyOptional() miniappLogoUrl?: string | null;
  @ApiPropertyOptional() outboxPausedUntil?: Date | null;
  @ApiProperty({
    description: 'Код часового пояса в формате «МСК±N»',
    enum: RUSSIA_TIMEZONES.map((tz) => tz.code),
  })
  timezone!: string;
}

export class OutletDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() hidden!: boolean;
  @ApiPropertyOptional({ enum: DeviceType, nullable: true }) posType?:
    | keyof typeof DeviceType
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  posLastSeenAt?: Date | null;
  @ApiProperty() bridgeSecretIssued!: boolean;
  @ApiProperty() bridgeSecretNextIssued!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  bridgeSecretUpdatedAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class StaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() login?: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty({ enum: StaffRole }) role!: keyof typeof StaffRole | string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({
    description: 'Ограничение доступа сотрудника на конкретную торговую точку',
  })
  allowedOutletId?: string | null;
  @ApiPropertyOptional() apiKeyHash?: string | null;
  @ApiProperty() createdAt!: Date;
}

export class SecretRespDto {
  @ApiProperty() secret!: string;
}
export class TokenRespDto {
  @ApiProperty() token!: string;
}
export class OkDto {
  @ApiProperty() ok!: boolean;
}

export class UpdateMerchantNameDto {
  @ApiProperty({
    description: 'Новое название компании в портале мерчанта',
    minLength: 2,
    maxLength: 120,
  })
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class UpdateTimezoneDto {
  @ApiProperty({ enum: RUSSIA_TIMEZONES.map((tz) => tz.code) })
  @IsIn(RUSSIA_TIMEZONES.map((tz) => tz.code))
  code!: string;
}

export class UpdateOutletPosDto {
  @ApiPropertyOptional({
    enum: DeviceType,
    description: 'Последний активный POS-тип',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  posType?: keyof typeof DeviceType | string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Метка последней активности POS',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  posLastSeenAt?: string | null;
}

export class UpdateOutletStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class OutboxEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() payload!: any;
  @ApiProperty() status!: string;
  @ApiProperty() retries!: number;
  @ApiPropertyOptional() nextRetryAt?: Date | null;
  @ApiPropertyOptional() lastError?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BulkUpdateRespDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() updated!: number;
}

export class ReceiptDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional() receiptNumber?: string | null;
  @ApiProperty() total!: number;
  @ApiProperty() redeemApplied!: number;
  @ApiProperty() earnApplied!: number;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() outletId?: string | null;
  @ApiPropertyOptional({ enum: DeviceType, nullable: true }) outletPosType?:
    | keyof typeof DeviceType
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  outletLastSeenAt?: Date | null;
  @ApiPropertyOptional() staffId?: string | null;
}

export class CustomerSearchRespDto {
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty() balance!: number;
}

export class LedgerEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() customerId?: string | null;
  @ApiProperty() debit!: string; // LedgerAccount
  @ApiProperty() credit!: string; // LedgerAccount
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() orderId?: string | null;
  @ApiPropertyOptional() receiptId?: string | null;
  @ApiPropertyOptional() outletId?: string | null;
  @ApiPropertyOptional({ enum: DeviceType, nullable: true }) outletPosType?:
    | keyof typeof DeviceType
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  outletLastSeenAt?: Date | null;
  @ApiPropertyOptional() staffId?: string | null;
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
  @ApiPropertyOptional() expiresAt?: Date | null;
  @ApiPropertyOptional() orderId?: string | null;
  @ApiPropertyOptional() receiptId?: string | null;
  @ApiPropertyOptional() outletId?: string | null;
  @ApiPropertyOptional({ enum: DeviceType, nullable: true }) outletPosType?:
    | keyof typeof DeviceType
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  outletLastSeenAt?: Date | null;
  @ApiPropertyOptional() staffId?: string | null;
  @ApiProperty() createdAt!: Date;
}
