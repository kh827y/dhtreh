import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
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

export class SegmentPayloadDto {
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

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  rules?: Prisma.InputJsonValue;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  filters?: Prisma.InputJsonValue | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  color?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toTrimmedString)
  @IsString()
  actorId?: string;
}

export class SegmentActiveDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  active?: boolean;
}
