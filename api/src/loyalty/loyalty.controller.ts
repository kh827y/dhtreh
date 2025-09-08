import { Body, Controller, Post, Get, Param, Query, BadRequestException, Res, Req } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CommitDto, QrMintDto, QuoteDto, RefundDto } from './dto';
import { looksLikeJwt, signQrToken, verifyQrToken } from './token.util';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService, private readonly prisma: PrismaService, private readonly metrics: MetricsService) {}

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
    const t0 = Date.now();
    try {
      const v = await this.resolveFromToken(dto.userToken);
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      if (s?.requireJwtForQuote && !looksLikeJwt(dto.userToken)) {
        this.metrics.inc('loyalty_quote_requests_total', { result: 'error', reason: 'jwt_required' });
        throw new BadRequestException('JWT required for quote');
      }
      if (v.merchantAud && v.merchantAud !== 'any' && v.merchantAud !== dto.merchantId) {
        this.metrics.inc('loyalty_quote_requests_total', { result: 'error', reason: 'merchant_mismatch' });
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      const qrMeta = looksLikeJwt(dto.userToken) ? { jti: v.jti, iat: v.iat, exp: v.exp } : undefined;
      const data = await this.service.quote({ ...dto, userToken: v.customerId }, qrMeta);
      this.metrics.inc('loyalty_quote_requests_total', { result: 'ok' });
      return data;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/JWTExpired|"exp"/.test(msg)) this.metrics.inc('loyalty_jwt_expired_total');
      this.metrics.inc('loyalty_quote_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_quote_latency_ms', Date.now() - t0);
    }
  }

  @Post('commit')
  async commit(@Body() dto: CommitDto, @Res({ passthrough: true }) res: Response, @Req() req: Request & { requestId?: string }) {
    const t0 = Date.now();
    let data: any;
    try {
      const idemKey = (req.headers['idempotency-key'] as string | undefined) || undefined;
      if (idemKey) {
        // вернуть сохранённый ответ, если есть
        const saved = await this.prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: dto.merchantId, key: idemKey } } });
        if (saved) {
          data = saved.response as any;
        } else {
          data = await this.service.commit(dto.holdId, dto.orderId, dto.receiptNumber, req.requestId ?? dto.requestId);
          // попытка сохранить; при гонке второй повернёт существующий
          try { await this.prisma.idempotencyKey.create({ data: { merchantId: dto.merchantId, key: idemKey, response: data } }); } catch {}
        }
      } else {
        data = await this.service.commit(dto.holdId, dto.orderId, dto.receiptNumber, req.requestId ?? dto.requestId);
      }
      this.metrics.inc('loyalty_commit_requests_total', { result: data?.alreadyCommitted ? 'already_committed' : 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_commit_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_commit_latency_ms', Date.now() - t0);
    }
    try {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      const secret = s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        res.setHeader('X-Merchant-Id', dto.merchantId);
        res.setHeader('X-Signature-Timestamp', ts);
        if (s?.webhookKeyId) res.setHeader('X-Signature-Key-Id', s.webhookKeyId);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    return data;
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
  async refund(@Body() dto: RefundDto, @Res({ passthrough: true }) res: Response, @Req() req: Request & { requestId?: string }) {
    let data: any;
    try {
      const idemKey = (req.headers['idempotency-key'] as string | undefined) || undefined;
      if (idemKey) {
        const saved = await this.prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: dto.merchantId, key: idemKey } } });
        if (saved) {
          data = saved.response as any;
        } else {
          data = await this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal, req.requestId);
          try { await this.prisma.idempotencyKey.create({ data: { merchantId: dto.merchantId, key: idemKey, response: data } }); } catch {}
        }
      } else {
        data = await this.service.refund(dto.merchantId, dto.orderId, dto.refundTotal, dto.refundEligibleTotal, req.requestId);
      }
      this.metrics.inc('loyalty_refund_requests_total', { result: 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_refund_requests_total', { result: 'error' });
      throw e;
    }
    try {
      const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } });
      const secret = s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        res.setHeader('X-Merchant-Id', dto.merchantId);
        res.setHeader('X-Signature-Timestamp', ts);
        if (s?.webhookKeyId) res.setHeader('X-Signature-Key-Id', s.webhookKeyId);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    return data;
  }

  @Get('transactions')
  transactions(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('outletId') outletId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100) : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    return this.service.transactions(merchantId, customerId, limit, before, { outletId, deviceId, staffId });
  }

  // Публичные списки для фронтов (без AdminGuard)
  @Get('outlets/:merchantId')
  async publicOutlets(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.outlet.findMany({ where: { merchantId }, orderBy: { name: 'asc' } });
    return items.map(o => ({ id: o.id, name: o.name, address: o.address ?? undefined }));
  }

  @Get('devices/:merchantId')
  async publicDevices(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.device.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
    return items.map(d => ({ id: d.id, type: d.type, label: d.label ?? undefined, outletId: d.outletId ?? undefined }));
  }

  @Get('staff/:merchantId')
  async publicStaff(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.staff.findMany({ where: { merchantId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    return items.map(s => ({ id: s.id, login: s.login ?? undefined, role: s.role }));
  }

  // Согласия на коммуникации
  @Get('consent')
  async getConsent(@Query('merchantId') merchantId: string, @Query('customerId') customerId: string) {
    const c = await this.prisma.consent.findUnique({ where: { merchantId_customerId: { merchantId, customerId } } });
    return { granted: !!c, consentAt: c?.consentAt?.toISOString() };
  }

  @Post('consent')
  async setConsent(@Body() body: { merchantId: string; customerId: string; granted: boolean }) {
    if (!body?.merchantId || !body?.customerId) throw new BadRequestException('merchantId and customerId required');
    if (body.granted) {
      await this.prisma.consent.upsert({ where: { merchantId_customerId: { merchantId: body.merchantId, customerId: body.customerId } }, update: { consentAt: new Date() }, create: { merchantId: body.merchantId, customerId: body.customerId, consentAt: new Date() } });
    } else {
      try { await this.prisma.consent.delete({ where: { merchantId_customerId: { merchantId: body.merchantId, customerId: body.customerId } } }); } catch {}
    }
    return { ok: true };
  }
}
