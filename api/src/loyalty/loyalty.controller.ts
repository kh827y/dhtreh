import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CommitDto, QrMintDto, QuoteDto } from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private service: LoyaltyService) {}

  // helper: получим customerId из plain или JWT
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
    // пробросим "нативный" dto в сервис: поменяем там ensureCustomer на ensureCustomerId(customerId)
    // поэтому раскинем поля руками
    const res = await this.service.quote({
      ...dto,
      userToken: customerId, // теперь это точно customerId
    } as any);
    return res;
  }

  @Post('commit')
  commit(@Body() dto: CommitDto) {
    return this.service.commit(dto.holdId, dto.orderId, dto.receiptNumber);
  }

  @Post('cancel')
  cancel(@Body('holdId') holdId: string) {
    return this.service.cancel(holdId);
  }

  @Get('balance/:customerId')
  balance(@Param('customerId') customerId: string) {
    return this.service.balance(customerId);
  }

  @Post('qr')
  async mintQr(@Body() dto: QrMintDto) {
    const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
    const ttl = dto.ttlSec ?? 60; // по умолчанию 60 сек
    const token = await signQrToken(secret, dto.customerId, ttl);
    return { token, ttl };
  }
}
