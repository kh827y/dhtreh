import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../shared/common/transform.util';

export class ReferralLevelRewardDto {
  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  level!: number;

  @ApiProperty()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  reward!: number;
}

export class CreateReferralProgramDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  description?: string;

  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  referrerReward!: number;

  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  refereeReward!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  minPurchaseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  maxReferrals?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'COMPLETED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'COMPLETED'])
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';

  @ApiPropertyOptional({ enum: ['first', 'all'] })
  @IsOptional()
  @IsIn(['first', 'all'])
  rewardTrigger?: 'first' | 'all';

  @ApiPropertyOptional({ enum: ['FIXED', 'PERCENT'] })
  @IsOptional()
  @IsIn(['FIXED', 'PERCENT'])
  rewardType?: 'FIXED' | 'PERCENT';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  multiLevel?: boolean;

  @ApiPropertyOptional({ type: () => [ReferralLevelRewardDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralLevelRewardDto)
  levelRewards?: ReferralLevelRewardDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  stackWithRegistration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  messageTemplate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  placeholders?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  shareMessage?: string;
}

export class UpdateReferralProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  referrerReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  refereeReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  minPurchaseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  maxReferrals?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'COMPLETED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'COMPLETED'])
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';

  @ApiPropertyOptional({ enum: ['first', 'all'] })
  @IsOptional()
  @IsIn(['first', 'all'])
  rewardTrigger?: 'first' | 'all';

  @ApiPropertyOptional({ enum: ['FIXED', 'PERCENT'] })
  @IsOptional()
  @IsIn(['FIXED', 'PERCENT'])
  rewardType?: 'FIXED' | 'PERCENT';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  multiLevel?: boolean;

  @ApiPropertyOptional({ type: () => [ReferralLevelRewardDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralLevelRewardDto)
  levelRewards?: ReferralLevelRewardDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  stackWithRegistration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  messageTemplate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  placeholders?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  shareMessage?: string;
}

export class ActivateReferralDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  refereeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  customerId?: string;
}

export class CompleteReferralDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  refereeId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty()
  @Transform(toOptionalNumber)
  @IsNumber()
  purchaseAmount!: number;
}
