import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { toTrimmedString } from '../../../shared/common/transform.util';

export class TelegramMiniAppConnectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  token?: string;
}

export class TelegramMiniAppLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  outletId?: string;
}
