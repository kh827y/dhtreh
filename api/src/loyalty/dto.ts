import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export enum Mode { REDEEM = 'redeem', EARN = 'earn' }

export class QuoteDto {
  @IsEnum(Mode) mode: Mode;
  @IsString() userToken: string; // может быть customerId или JWT
  @IsString() orderId: string;
  @IsNumber() @Min(0) total: number;
  @IsNumber() @Min(0) eligibleTotal: number;
}

export class CommitDto {
  @IsString() holdId: string;
  @IsString() orderId: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() provider?: string;
}

export class QrMintDto {
  @IsString() customerId: string;
  @IsOptional() @Min(10) ttlSec?: number;
}
