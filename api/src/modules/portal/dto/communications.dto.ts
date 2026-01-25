import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  toOptionalBoolean,
  toOptionalNumber,
  toTrimmedString,
} from '../../../shared/common/transform.util';

export class NotificationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  html?: string;
}

export class NotificationsBroadcastDto {
  @ApiProperty({ enum: ['EMAIL', 'PUSH', 'ALL'] })
  @IsIn(['EMAIL', 'PUSH', 'ALL'])
  channel!: 'EMAIL' | 'PUSH' | 'ALL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  segmentId?: string;

  @ApiPropertyOptional({ type: () => NotificationTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  template?: NotificationTemplateDto;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  dryRun?: boolean;
}

export class PortalCampaignScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startAt?: string;
}

export class PortalPushCampaignDto extends PortalCampaignScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  audience?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  audienceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  audienceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class PortalTelegramCampaignDto extends PortalCampaignScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  audienceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(toTrimmedString)
  audienceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  media?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class TelegramNotifyInviteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  forceNew?: boolean;
}

export class TelegramNotifyPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  notifyOrders?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  notifyReviews?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  notifyReviewThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  notifyDailyDigest?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  notifyFraud?: boolean;
}
