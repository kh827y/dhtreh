import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { toTrimmedString } from '../../../shared/common/transform.util';

export class SendPushRequestDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  merchantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  title!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  body!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  data?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  image?: string;

  @ApiProperty()
  @IsIn(['TRANSACTION', 'MARKETING', 'CAMPAIGN', 'SYSTEM'])
  type!: 'TRANSACTION' | 'MARKETING' | 'CAMPAIGN' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['high', 'normal'])
  priority?: 'high' | 'normal';
}

export class PushTopicDto {
  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  title!: string;

  @ApiProperty()
  @Transform(toTrimmedString)
  @IsString()
  body!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  data?: Record<string, string>;
}
