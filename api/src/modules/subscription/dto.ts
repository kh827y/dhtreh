import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import {
  toOptionalBoolean,
  toTrimmedString,
} from '../../shared/common/transform.util';

export class CreateSubscriptionRequestDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue | null;
}

export class UpdateSubscriptionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue | null;
}

export class PlanRefDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  id?: string;
}
