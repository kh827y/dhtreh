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
  @IsOptional()
  requireStaffKey?: boolean;
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
