import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min, IsUrl } from 'class-validator';

export class CreateGiftDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  merchantId!: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl()
  imageUrl?: string;

  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1)
  costPoints!: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodFrom?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodTo?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  perCustomerLimit?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  inventory?: number; // null = бесконечный
}

export class UpdateGiftDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl()
  imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  costPoints?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString()
  periodTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  perCustomerLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  inventory?: number;
}
