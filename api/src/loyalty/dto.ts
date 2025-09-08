import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum Mode { REDEEM = 'redeem', EARN = 'earn' }

export class QuoteDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() merchantId: string;
  @IsString() userToken: string; // customerId или JWT
  @IsString() orderId: string;
  @IsNumber() @Min(0) total: number;
  @IsNumber() @Min(0) eligibleTotal: number;
  @IsOptional() @IsString() outletId?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() requestId?: string;
}

export class CommitDto {
  @IsString() merchantId: string;
  @IsString() holdId: string;
  @IsString() orderId: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() requestId?: string;
}

export class QrMintDto {
  @IsString() customerId: string;
  @IsOptional() @Min(10) ttlSec?: number;
  @IsOptional() @IsString() merchantId?: string; // <— добавили
}

export class RefundDto {
  @IsString() merchantId: string;
  @IsString() orderId: string;
  // сумма возврата по чеку; для частичного возврата укажи часть
  @IsNumber() @Min(0) refundTotal: number;
  // база возврата (если в исходном чеке были исключения); можно не указывать — возьмём пропорцию по total
  @IsOptional() @IsNumber() @Min(0) refundEligibleTotal?: number;
}
