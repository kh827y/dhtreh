import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeviceType, StaffRole } from '@prisma/client';

export class UpdateMerchantSettingsDto {
  @IsInt() @Min(0) @Max(10000)
  earnBps!: number;           // 10000 б.п. = 100%

  @IsInt() @Min(0) @Max(10000)
  redeemLimitBps!: number;    // 5000 = 50%

  @IsOptional() @IsInt() @Min(15) @Max(600)
  qrTtlSec?: number;          // TTL QR по умолчанию

  @IsOptional() @IsString()
  webhookUrl?: string;

  @IsOptional() @IsString()
  webhookSecret?: string;

  @IsOptional() @IsString()
  webhookKeyId?: string;

  @IsOptional() @IsInt() @Min(0) @Max(86400)
  redeemCooldownSec?: number;
  @IsOptional() @IsInt() @Min(0) @Max(86400)
  earnCooldownSec?: number;
  @IsOptional() @IsInt() @Min(0)
  redeemDailyCap?: number;
  @IsOptional() @IsInt() @Min(0)
  earnDailyCap?: number;

  @IsOptional()
  requireJwtForQuote?: boolean;

  @IsOptional()
  rulesJson?: any;

  @IsOptional()
  requireBridgeSig?: boolean;
  @IsOptional() @IsString()
  bridgeSecret?: string;
}

export class CreateOutletDto {
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
}

export class UpdateOutletDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
}

export class CreateDeviceDto {
  @IsString() type!: keyof typeof DeviceType | string;
  @IsOptional() @IsString() outletId?: string;
  @IsOptional() @IsString() label?: string;
}

export class UpdateDeviceDto {
  @IsOptional() @IsString() outletId?: string;
  @IsOptional() @IsString() label?: string;
}

export class CreateStaffDto {
  @IsOptional() @IsString() login?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() role?: keyof typeof StaffRole | string;
}

export class UpdateStaffDto {
  @IsOptional() @IsString() login?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() role?: keyof typeof StaffRole | string;
  @IsOptional() @IsString() status?: string;
}
