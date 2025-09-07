import { IsInt, Max, Min } from 'class-validator';

export class UpdateMerchantSettingsDto {
  @IsInt() @Min(0) @Max(10000)
  earnBps!: number;           // 10000 б.п. = 100%

  @IsInt() @Min(0) @Max(10000)
  redeemLimitBps!: number;    // 5000 = 50%
}
