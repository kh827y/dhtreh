import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../../shared/common/transform.util';

export class ReferralProgramLevelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  reward?: number;
}

export class UpdateStaffMotivationDto {
  @ApiPropertyOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  pointsForNewCustomer!: number;

  @ApiPropertyOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  pointsForExistingCustomer!: number;

  @ApiPropertyOptional()
  @Transform(toTrimmedString)
  @IsString()
  leaderboardPeriod!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  customDays?: number | null;
}

export class UpdateReferralProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rewardTrigger?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rewardType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  rewardValue?: number;

  @ApiPropertyOptional({ type: () => [ReferralProgramLevelDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferralProgramLevelDto)
  levels?: ReferralProgramLevelDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  friendReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  stackWithRegistration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  placeholders?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shareMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  minPurchaseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  multiLevel?: boolean;
}

export class UpdateSupportSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supportTelegram?: string;
}
