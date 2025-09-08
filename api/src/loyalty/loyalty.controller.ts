import { Body, Controller, Post, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CommitDto, QrMintDto, QuoteDto, RefundDto } from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';
import { PrismaService } from '../prisma.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService, private readonly prisma: PrismaService) {}

  // Plain ID или JWT
  private async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
      try {
        const v = await verifyQrToken(secret, userToken);
        return v; // { customerId, merchantAud, jti, iat, exp }
      } catch (e: any) {
        const code = e?.code || e?.name || '';
        const msg  = String(e?.message || e || '');
        if (code === 'ERR_JWT_EXPIRED' || /JWTExpired/i.test(code) || /"exp"/i.test(msg)) {
          // отдадим 400 с предсказуемым текстом, чтобы фронт показал «QR истёк»
          throw new BadRequestException('JWTExpired: "exp" claim timestamp check failed');
        }
        throw new BadRequestException('Bad QR token');
      }
    }
    const now = Math.floor(Date.now() / 1000);
    return { customerId: userToken, merchantAud: undefined, jti: `plain:${userToken}:${now}`, iat: now, exp: now + 3600 };
  }

  @Post('quote')
  async quote(@Body() dto: QuoteDto) {
    const v = await this.resolveFromToken(dto.userToken);
    if (v.merchantAud && v.merchantAud !== 'any' && v.merchantAud !== dto.merchantId) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const qrMeta = looksLikeJwt(dto.userToken) ? { jti: v.jti, iat: v.iat, exp: v.exp } : undefined;
    return this.service.quote({ ...dto, userToken: v.customerId }, qrMeta);
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
    let ttl = dto.ttlSec ?? 60;
    if (!dto.ttlSec && dto.merchantId) {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (s?.qrTtlSec) ttl = s.qrTtlSec;
    }
    const token = await signQrToken(secret, dto.customerId, dto.merchantId, ttl);
    return { token, ttl };
  }

  // Публичные настройки, доступные мини-аппе (без админ-ключа)
  @Get('settings/:merchantId')
  async publicSettings(@Param('merchantId') merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    return { merchantId, qrTtlSec: s?.qrTtlSec ?? 120 };
  }

  @Post('refund')
  refund(@Body() dto: RefundDto) {
    return this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal);
  }

  @Get('transactions')
  transactions(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100) : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.transactions(merchantId, customerId, limit, before);
  }
}
