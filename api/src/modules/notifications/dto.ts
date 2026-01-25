import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  toOptionalBoolean,
  toTrimmedString,
} from '../../shared/common/transform.util';

export class NotificationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  html?: string;
}

export class NotificationsBroadcastDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty({ enum: ['EMAIL', 'PUSH', 'ALL'] })
  @IsIn(['EMAIL', 'PUSH', 'ALL'])
  channel!: 'EMAIL' | 'PUSH' | 'ALL';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  segmentId?: string;

  @ApiPropertyOptional({ type: () => NotificationTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  template?: NotificationTemplateDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  dryRun?: boolean;
}

export class NotificationsTestDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty({ enum: ['EMAIL', 'PUSH'] })
  @IsIn(['EMAIL', 'PUSH'])
  channel!: 'EMAIL' | 'PUSH';

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  to!: string;

  @ApiPropertyOptional({ type: () => NotificationTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTemplateDto)
  template?: NotificationTemplateDto;
}
