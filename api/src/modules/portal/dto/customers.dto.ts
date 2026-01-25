import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
} from '../../../shared/common/transform.util';

export class ImportCustomersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  format?: 'csv' | 'excel';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  updateExisting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  sendWelcome?: boolean;
}

export class PortalCustomerPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

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
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  accrualsBlocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  redemptionsBlocked?: boolean;
}

export class ManualAccrualDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  purchaseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ManualRedeemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ManualComplimentaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  expiresInDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
