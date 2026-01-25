import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../shared/common/transform.util';

export class PromotionPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  segmentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  targetTierId?: string | null;

  @ApiPropertyOptional({ enum: PromotionStatus })
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;

  @ApiPropertyOptional({ enum: PromotionRewardType })
  @IsOptional()
  @IsEnum(PromotionRewardType)
  rewardType?: PromotionRewardType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  rewardValue?: number | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rewardMetadata?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  pointsExpireInDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  pushTemplateStartId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  pushTemplateReminderId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  pushOnStart?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  pushReminderEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  reminderOffsetHours?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  autoLaunch?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startAt?: string | Date | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endAt?: string | Date | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: unknown;
}

export class PromotionStatusDto {
  @ApiProperty({ enum: PromotionStatus })
  @IsEnum(PromotionStatus)
  status!: PromotionStatus;
}

export class PromotionBulkStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ enum: PromotionStatus })
  @IsEnum(PromotionStatus)
  status!: PromotionStatus;
}

export class TierPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  thresholdAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  earnRatePercent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  redeemRatePercent?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  minPaymentAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isInitial?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  color?: string | null;
}

export class RedeemLimitsUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  ttlEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  ttlDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  allowSameReceipt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  delayEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  delayDays?: number;
}
