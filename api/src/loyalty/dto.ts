import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Mode { REDEEM = 'redeem', EARN = 'earn' }

export class QuoteDto {
  @ApiProperty({ enum: Mode })
  @IsEnum(Mode) mode: Mode;
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty({ description: 'customerId или JWT' })
  @IsString() userToken: string; // customerId или JWT
  @ApiProperty()
  @IsString() orderId: string;
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) total: number;
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) eligibleTotal: number;
  @ApiPropertyOptional()
  @IsOptional() @IsString() outletId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() staffId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() requestId?: string;
  @ApiPropertyOptional({ description: 'Категория товара/чека для правил' })
  @IsOptional() @IsString() category?: string;
}

export class CommitDto {
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty()
  @IsString() holdId: string;
  @ApiProperty()
  @IsString() orderId: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() receiptNumber?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() requestId?: string;
}

export class QrMintDto {
  @ApiProperty()
  @IsString() customerId: string;
  @ApiPropertyOptional({ minimum: 10 })
  @IsOptional() @Min(10) ttlSec?: number;
  @ApiPropertyOptional()
  @IsOptional() @IsString() merchantId?: string; // <— добавили
}

export class RefundDto {
  @ApiProperty()
  @IsString() merchantId: string;
  @ApiProperty()
  @IsString() orderId: string;
  // сумма возврата по чеку; для частичного возврата укажи часть
  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0) refundTotal: number;
  // база возврата (если в исходном чеке были исключения); можно не указывать — возьмём пропорцию по total
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber() @Min(0) refundEligibleTotal?: number;
}
