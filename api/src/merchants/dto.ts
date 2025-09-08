import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
