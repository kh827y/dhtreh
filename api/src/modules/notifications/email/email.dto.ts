import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { toTrimmedString } from '../../../shared/common/transform.util';

export class EmailAttachmentDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  filename!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  contentType?: string;
}

export class SendEmailRequestDto {
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  @ValidateIf((_, value) => Array.isArray(value))
  @IsArray()
  @IsString({ each: true })
  to!: string | string[];

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  subject!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  template!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ type: () => [EmailAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentDto)
  attachments?: EmailAttachmentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  campaignId?: string;
}

export class SendWelcomeEmailDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  customerId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  email!: string;
}

export class SendTransactionEmailDto {
  @ApiProperty({ enum: ['earn', 'redeem', 'refund'] })
  @IsIn(['earn', 'redeem', 'refund'])
  type!: 'earn' | 'redeem' | 'refund';
}

export class SendCampaignEmailDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  campaignId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  customerIds!: string[];

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  content!: string;
}

export class SendReportEmailDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  email!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  reportType!: string;

  @ApiProperty()
  @IsString()
  reportBuffer!: string;

  @ApiProperty({ enum: ['pdf', 'excel', 'csv'] })
  @IsIn(['pdf', 'excel', 'csv'])
  format!: 'pdf' | 'excel' | 'csv';
}

export class SendTestEmailDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  template?: string;
}
