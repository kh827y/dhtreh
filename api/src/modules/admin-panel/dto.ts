import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../shared/common/transform.util';

export class AdminMerchantSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  qrTtlSec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  telegramBotToken?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  telegramBotUsername?: string | null;
}

export class AdminMerchantCreateDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  portalEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portalPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ type: () => AdminMerchantSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminMerchantSettingsDto)
  settings?: AdminMerchantSettingsDto;
}

export class AdminMerchantUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  portalEmail?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portalPassword?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  ownerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  archived?: boolean;
}

export class AdminRotateCashierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  regenerateLogin?: boolean;
}

export class AdminGrantSubscriptionDto {
  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(1)
  days!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  planId?: string;
}
