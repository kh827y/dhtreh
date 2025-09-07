import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CommitDto, QrMintDto, QuoteDto, RefundDto } from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  private async resolveCustomerId(userToken: string): Promise<string> {
    if (looksLikeJwt(userToken)) {
      const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
      return await verifyQrToken(secret, userToken);
    }
    return userToken;
  }

  @Post('quote')
  async quote(@Body() dto: QuoteDto) {
    const customerId = await this.resolveCustomerId(dto.userToken);
    return this.service.quote({ ...dto, userToken: customerId });
  }

  @Post('commit')
  commit(@Body() dto: CommitDto) {
    return this.service.commit(dto.holdId, dto.orderId, dto.receiptNumber);
  }

  @Post('cancel')
  cancel(@Body('holdId') holdId: string) {
    return this.service.cancel(holdId);
  }

  @Get('balance/:merchantId/:customerId')
  balance2(@Param('merchantId') merchantId: string, @Param('customerId') customerId: string) {
    return this.service.balance(merchantId, customerId);
  }

  @Get('balance/:customerId')
  balanceBackCompat(@Param('customerId') customerId: string) {
    return this.service.balance('M-1', customerId);
  }

  @Post('qr')
  async mintQr(@Body() dto: QrMintDto) {
    const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
    const ttl = dto.ttlSec ?? 60;
    const token = await signQrToken(secret, dto.customerId, ttl);
    return { token, ttl };
  }

  @Post('refund')
  refund(@Body() dto: RefundDto) {
    return this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal);
  }
}
