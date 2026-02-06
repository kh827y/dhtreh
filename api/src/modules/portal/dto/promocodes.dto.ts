import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../../shared/common/transform.util';

export class PortalPromoCodePayloadDto {
  @ApiProperty()
  @IsString()
  @Transform(toTrimmedString)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  awardPoints?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  burnEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  burnDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  levelEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  levelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  levelExpireDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  usageLimit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  usageLimitValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  perCustomerLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  usagePeriodEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  usagePeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  recentVisitEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  recentVisitHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  overwrite?: boolean;
}

export class PortalPromoCodeStatusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  promoCodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  code?: string;
}
