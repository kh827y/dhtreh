import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { LoyaltyService } from '../services/loyalty.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { AntiFraudGuard } from '../../../core/guards/antifraud.guard';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import {
  BalanceDto,
  CommitDto,
  CommitRespDto,
  ErrorDto,
  OkDto,
  PublicSettingsDto,
  QrMintDto,
  QrMintRespDto,
  QuoteDto,
  QuoteEarnRespDto,
  QuoteRedeemRespDto,
  RefundDto,
  RefundRespDto,
} from '../dto/dto';
import { signQrToken } from '../utils/token.util';
import { validateTelegramInitData } from '../utils/telegram.util';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import {
  LoyaltyControllerBase,
  asRecord,
  readErrorMessage,
  readString,
} from './loyalty.controller-base';
import type {
  CashierRequest,
  CommitOptions,
  RequestWithRequestId,
  TeleauthRequest,
} from './loyalty.controller-base';

@ApiTags('loyalty')
@ApiExtraModels(QuoteRedeemRespDto, QuoteEarnRespDto)
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyTransactionsController extends LoyaltyControllerBase {
  constructor(
    private readonly service: LoyaltyService,
    prisma: PrismaService,
    private readonly metrics: MetricsService,
    cache: LookupCacheService,
  ) {
    super(prisma, cache);
  }

  @Post('qr')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: QrMintRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async mintQr(@Body() dto: QrMintDto, @Req() req: TeleauthRequest) {
    const merchantId =
      typeof dto.merchantId === 'string' ? dto.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const teleauthCustomerId = req.teleauth?.customerId ?? null;
    let customerId =
      typeof dto.customerId === 'string' ? dto.customerId.trim() : '';
    if (!customerId && teleauthCustomerId) {
      customerId = String(teleauthCustomerId);
    }

    // Если передан initData — валидируем и берём customerId из Telegram
    if (dto.initData) {
      const botToken =
        typeof settings?.telegramBotToken === 'string'
          ? settings.telegramBotToken
          : '';
      if (!botToken) throw new BadRequestException('Bot token not configured');
      const r = validateTelegramInitData(botToken, dto.initData);
      if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
      if (settings?.telegramStartParamRequired) {
        const p = new URLSearchParams(dto.initData);
        const sp = p.get('start_param') || p.get('startapp') || '';
        if (!sp) {
          throw new BadRequestException('start_param required');
        }
        const trimmed = sp.trim();
        const isReferral = /^ref[_-]/i.test(trimmed);
        if (!isReferral && trimmed !== merchantId) {
          throw new BadRequestException('merchantId mismatch with start_param');
        }
      }
      const tgId = String(r.userId);
      const ensured = await this.ensureCustomerByTelegram(
        merchantId,
        tgId,
        dto.initData,
      );
      customerId = ensured.customerId;
    }

    if (!customerId) {
      throw new BadRequestException('customerId required');
    }

    const envSecret = this.config.getQrJwtSecret() || '';
    if (
      !envSecret ||
      (this.config.isProduction() && envSecret === 'dev_change_me')
    ) {
      throw new BadRequestException('QR_JWT_SECRET not configured');
    }
    const secret = envSecret;

    let ttl = dto.ttlSec ?? 300;
    if (!dto.ttlSec && settings?.qrTtlSec) ttl = settings.qrTtlSec;
    await this.ensureCustomer(merchantId, customerId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const token = requireJwtForQuote
      ? await signQrToken(secret, customerId, merchantId, ttl)
      : await this.mintShortCode(merchantId, customerId, ttl);
    return { token, ttl };
  }

  @Post('quote')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(QuoteRedeemRespDto) },
        { $ref: getSchemaPath(QuoteEarnRespDto) },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async quote(
    @Body() dto: QuoteDto,
    @Req() _req: Request & { requestId?: string },
  ) {
    const t0 = Date.now();
    try {
      const v = await this.resolveFromToken(dto.userToken);
      const s = await this.cache.getMerchantSettings(dto.merchantId);
      const modeError = this.getQrModeError(
        v.kind,
        Boolean(s?.requireJwtForQuote),
      );
      if (modeError) {
        this.metrics.inc('loyalty_quote_requests_total', {
          result: 'error',
          reason: modeError.reason,
        });
        throw new BadRequestException(modeError.message);
      }
      const customerId = v.customerId;
      const customer = await this.ensureCustomer(dto.merchantId, customerId);
      if (
        v.merchantAud &&
        v.merchantAud !== 'any' &&
        v.merchantAud !== dto.merchantId
      ) {
        this.metrics.inc('loyalty_quote_requests_total', {
          result: 'error',
          reason: 'merchant_mismatch',
        });
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      const staffId = dto.staffId;
      const outlet = await this.resolveOutlet(
        dto.merchantId,
        dto.outletId ?? null,
      );
      const qrMeta =
        v.kind === 'jwt' || v.kind === 'short'
          ? { jti: v.jti, iat: v.iat, exp: v.exp, kind: v.kind }
          : undefined;
      // Расчёт quote без внешних промо-скидок (используем исходные суммы)
      const adjTotal = Math.max(0, Math.floor(dto.total));
      const normalizedOutletId = dto.outletId ?? outlet?.id ?? undefined;
      const data = await this.service.quote(
        {
          ...dto,
          outletId: normalizedOutletId,
          total: adjTotal,
          staffId,
          customerId: customer.id,
        },
        qrMeta,
      );
      this.metrics.inc('loyalty_quote_requests_total', { result: 'ok' });
      return data;
    } catch (err: unknown) {
      const msg = readErrorMessage(err);
      if (/JWTExpired|"exp"/.test(msg))
        this.metrics.inc('loyalty_jwt_expired_total');
      this.metrics.inc('loyalty_quote_requests_total', { result: 'error' });
      throw err;
    } finally {
      this.metrics.observe('loyalty_quote_latency_ms', Date.now() - t0);
    }
  }

  @Post('commit')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность COMMIT',
  })
  @ApiOkResponse({ type: CommitRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async commit(
    @Body() dto: CommitDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    const t0 = Date.now();
    let data: unknown;
    // кешируем hold для извлечения контекста (merchantId, outletId, staffId)
    let holdCached: Awaited<
      ReturnType<PrismaService['hold']['findUnique']>
    > | null = null;
    try {
      holdCached = await this.prisma.hold.findUnique({
        where: { id: dto.holdId },
      });
    } catch {}
    const merchantIdEff = holdCached?.merchantId || dto.merchantId;

    let customerId: string | null = null;
    if (holdCached?.customerId && merchantIdEff) {
      const customer = await this.ensureCustomer(
        merchantIdEff,
        holdCached.customerId,
      );
      customerId = customer.id;
    }
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      const expectedMerchantId =
        typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
      const commitOptsPayload: CommitOptions = {};
      if (dto.positions && Array.isArray(dto.positions)) {
        commitOptsPayload.positions = dto.positions;
      }
      if (expectedMerchantId) {
        commitOptsPayload.expectedMerchantId = expectedMerchantId;
      }
      const commitOpts =
        Object.keys(commitOptsPayload).length > 0
          ? commitOptsPayload
          : undefined;
      const merchantForIdem = merchantIdEff || undefined;
      const scope = 'loyalty/commit';
      const requestHash =
        idemKey && merchantForIdem
          ? this.hashIdempotencyPayload({
              merchantId: merchantForIdem,
              holdId: dto.holdId,
              orderId: dto.orderId ?? null,
              receiptNumber: dto.receiptNumber ?? null,
              positions: commitOpts?.positions ?? null,
            })
          : null;
      if (idemKey && merchantForIdem) {
        const ttlH = this.config.getIdempotencyTtlHours();
        const exp = new Date(Date.now() + ttlH * 3600 * 1000);
        const keyWhere = {
          merchantId: merchantForIdem,
          scope,
          key: idemKey,
        };
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { merchantId_scope_key: keyWhere },
        });
        if (existing) {
          if (existing.requestHash && existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key уже использован с другим запросом',
            );
          }
          if (existing.response) {
            data = existing.response;
          } else {
            throw new ConflictException('Idempotency-Key уже обрабатывается');
          }
        } else {
          try {
            await this.prisma.idempotencyKey.create({
              data: {
                merchantId: merchantForIdem,
                scope,
                key: idemKey,
                requestHash,
                expiresAt: exp,
                response: Prisma.JsonNull,
              },
            });
          } catch {
            const saved = await this.prisma.idempotencyKey.findUnique({
              where: { merchantId_scope_key: keyWhere },
            });
            if (saved) {
              if (saved.requestHash && saved.requestHash !== requestHash) {
                throw new ConflictException(
                  'Idempotency-Key уже использован с другим запросом',
                );
              }
              if (saved.response) {
                data = saved.response;
              } else {
                throw new ConflictException(
                  'Idempotency-Key уже обрабатывается',
                );
              }
            }
          }
          if (data === undefined) {
            try {
              const commitResult: unknown = await this.service.commit(
                dto.holdId,
                dto.orderId,
                dto.receiptNumber,
                req.requestId,
                commitOpts,
              );
              data = commitResult;
              const dataRecord = asRecord(data);
              if (dataRecord?.alreadyCommitted === true) {
                const rest = { ...dataRecord };
                delete (rest as Record<string, unknown>).alreadyCommitted;
                data = rest;
              }
              await this.prisma.idempotencyKey.update({
                where: { merchantId_scope_key: keyWhere },
                data: {
                  response: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                  expiresAt: exp,
                },
              });
            } catch (e) {
              try {
                await this.prisma.idempotencyKey.delete({
                  where: { merchantId_scope_key: keyWhere },
                });
              } catch {}
              throw e;
            }
          }
        }
      } else {
        const commitResult: unknown = await this.service.commit(
          dto.holdId,
          dto.orderId,
          dto.receiptNumber,
          req.requestId,
          commitOpts,
        );
        data = commitResult;
      }
      const dataRecord = asRecord(data);
      this.metrics.inc('loyalty_commit_requests_total', {
        result: dataRecord?.alreadyCommitted ? 'already_committed' : 'ok',
      });
    } catch (e) {
      this.metrics.inc('loyalty_commit_requests_total', { result: 'error' });
      throw e;
    } finally {
      this.metrics.observe('loyalty_commit_latency_ms', Date.now() - t0);
    }
    try {
      const s = merchantIdEff
        ? await this.cache.getMerchantSettings(merchantIdEff)
        : null;
      const useNext =
        Boolean(s?.useWebhookNext) && Boolean(s?.webhookSecretNext);
      const secret = useNext ? s?.webhookSecretNext : s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        if (merchantIdEff) res.setHeader('X-Merchant-Id', merchantIdEff);
        res.setHeader('X-Signature-Timestamp', ts);
        const kid = useNext ? s?.webhookKeyIdNext : s?.webhookKeyId;
        if (kid) res.setHeader('X-Signature-Key-Id', kid);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }

  @Post('cancel')
  @ApiOkResponse({ type: OkDto })
  async cancel(@Body('holdId') holdId: string, @Req() req: CashierRequest) {
    if (!holdId) throw new BadRequestException('holdId required');
    return this.service.cancel(holdId, req.cashierSession?.merchantId);
  }

  @Get('balance/:merchantId/:customerId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: BalanceDto })
  balance2(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.balance(merchantId, customerId);
  }

  // Публичные настройки, доступные мини-аппе (без админ-ключа)
  @Get('settings/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicSettingsDto })
  async publicSettings(@Param('merchantId') merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const { share } = await this.buildReviewsShareSettings(
      merchantId,
      settings,
    );
    const referralActive = await this.prisma.referralProgram.findFirst({
      where: { merchantId, status: 'ACTIVE', isActive: true },
      select: { id: true },
    });
    const referralEnabled = Boolean(referralActive);
    const rulesRaw = getRulesRoot(settings?.rulesJson) ?? {};
    const miniappRules = getRulesSection(rulesRaw, 'miniapp');
    const supportTelegramRaw = miniappRules?.supportTelegram ?? null;
    const supportTelegram =
      typeof supportTelegramRaw === 'string' && supportTelegramRaw.trim()
        ? supportTelegramRaw.trim()
        : null;
    const reviewsRules = getRulesSection(rulesRaw, 'reviews');
    const reviewsEnabled =
      reviewsRules && reviewsRules.enabled !== undefined
        ? Boolean(reviewsRules.enabled)
        : true;
    return {
      merchantId,
      qrTtlSec: settings?.qrTtlSec ?? 300,
      miniappThemePrimary: settings?.miniappThemePrimary ?? null,
      miniappThemeBg: settings?.miniappThemeBg ?? null,
      miniappLogoUrl: settings?.miniappLogoUrl ?? null,
      supportTelegram,
      reviewsEnabled,
      referralEnabled,
      reviewsShare: share,
    } satisfies PublicSettingsDto;
  }

  @Get('miniapp-logo/:merchantId/:assetId')
  async getMiniappLogo(
    @Param('merchantId') merchantId: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const asset = await this.prisma.communicationAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset || asset.merchantId !== merchantId) {
      throw new NotFoundException('Logo not found');
    }
    if (asset.kind !== 'MINIAPP_LOGO') {
      throw new NotFoundException('Logo not found');
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Length',
      String(asset.byteSize ?? asset.data?.length ?? 0),
    );
    if (asset.fileName) {
      res.setHeader('X-Filename', encodeURIComponent(asset.fileName));
    }
    res.send(asset.data);
  }

  @Post('refund')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность REFUND',
  })
  @ApiOkResponse({ type: RefundRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async refund(
    @Body() dto: RefundDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    const dtoRecord = asRecord(dto) ?? {};
    const rawInvoice =
      readString(dtoRecord.invoice_num) ??
      readString(dtoRecord.invoiceNum) ??
      readString(dtoRecord.orderId) ??
      readString(dtoRecord.order_id);
    let invoiceNum =
      typeof rawInvoice === 'string' && rawInvoice.trim().length > 0
        ? rawInvoice.trim()
        : '';
    const rawOrderId = readString(dtoRecord.order_id);
    let orderId =
      typeof rawOrderId === 'string' && rawOrderId.trim().length > 0
        ? rawOrderId.trim()
        : '';
    const receiptNumber =
      typeof dto?.receiptNumber === 'string' &&
      dto.receiptNumber.trim().length > 0
        ? dto.receiptNumber.trim()
        : null;
    if (!invoiceNum && !orderId) {
      if (!receiptNumber) {
        throw new BadRequestException('invoice_num или order_id обязательны');
      }
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, receiptNumber },
        select: { orderId: true, id: true },
        take: 2,
      });
      if (receipts.length === 0 || !receipts[0]?.orderId) {
        throw new BadRequestException('Receipt not found');
      }
      if (receipts.length > 1) {
        throw new BadRequestException(
          'Multiple receipts found for receiptNumber',
        );
      }
      invoiceNum = receipts[0].orderId;
      orderId = receipts[0].id ?? '';
    }
    let operationDate: Date | null = null;
    if (dto.operationDate) {
      const parsed = new Date(dto.operationDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('operationDate must be a valid date');
      }
      operationDate = parsed;
    }
    dtoRecord.merchantId = merchantId;
    dtoRecord.invoice_num = invoiceNum;
    dtoRecord.order_id = orderId;
    let customerId: string | null = null;
    let data: unknown;
    try {
      const idemKey =
        (req.headers['idempotency-key'] as string | undefined) || undefined;
      const scope = 'loyalty/refund';
      const requestHash = idemKey
        ? this.hashIdempotencyPayload({
            merchantId,
            invoiceNum: invoiceNum || null,
            orderId: orderId || null,
            receiptNumber,
            deviceId: dto.deviceId ?? null,
            operationDate: operationDate ? operationDate.toISOString() : null,
          })
        : null;
      if (idemKey) {
        const ttlH = this.config.getIdempotencyTtlHours();
        const exp = new Date(Date.now() + ttlH * 3600 * 1000);
        const keyWhere = { merchantId, scope, key: idemKey };
        const saved = await this.prisma.idempotencyKey.findUnique({
          where: { merchantId_scope_key: keyWhere },
        });
        if (saved) {
          if (saved.requestHash && saved.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key уже использован с другим запросом',
            );
          }
          if (saved.response) {
            data = saved.response;
          } else {
            throw new ConflictException('Idempotency-Key уже обрабатывается');
          }
        } else {
          try {
            await this.prisma.idempotencyKey.create({
              data: {
                merchantId,
                scope,
                key: idemKey,
                requestHash,
                expiresAt: exp,
                response: Prisma.JsonNull,
              },
            });
          } catch {
            const savedLater = await this.prisma.idempotencyKey.findUnique({
              where: { merchantId_scope_key: keyWhere },
            });
            if (savedLater) {
              if (savedLater.requestHash && savedLater.requestHash !== requestHash) {
                throw new ConflictException(
                  'Idempotency-Key уже использован с другим запросом',
                );
              }
              if (savedLater.response) {
                data = savedLater.response;
              } else {
                throw new ConflictException(
                  'Idempotency-Key уже обрабатывается',
                );
              }
            }
          }
          if (data === undefined) {
            try {
              const refundResult: unknown = await this.service.refund({
                merchantId,
                invoiceNum,
                orderId,
                requestId: req.requestId,
                deviceId: dto.deviceId,
                operationDate,
              });
              data = refundResult;
              await this.prisma.idempotencyKey.update({
                where: { merchantId_scope_key: keyWhere },
                data: {
                  response: (data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                  expiresAt: exp,
                },
              });
            } catch (e) {
              try {
                await this.prisma.idempotencyKey.delete({
                  where: { merchantId_scope_key: keyWhere },
                });
              } catch {}
              throw e;
            }
          }
        }
      } else {
        const refundResult: unknown = await this.service.refund({
          merchantId,
          invoiceNum,
          orderId,
          requestId: req.requestId,
          deviceId: dto.deviceId,
          operationDate,
        });
        data = refundResult;
        try {
          let receipt = await this.prisma.receipt.findUnique({
            where: {
              merchantId_orderId: {
                merchantId,
                orderId: invoiceNum,
              },
            },
            select: { customerId: true },
          });
          if (!receipt && orderId) {
            receipt = await this.prisma.receipt.findFirst({
              where: { id: orderId, merchantId },
              select: { customerId: true },
            });
          }
          if (receipt?.customerId) {
            const mc = await this.ensureCustomer(
              merchantId,
              receipt.customerId,
            );
            customerId = mc.id;
          }
        } catch {}
      }
      this.metrics.inc('loyalty_refund_requests_total', { result: 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_refund_requests_total', { result: 'error' });
      throw e;
    }
    try {
      const s = await this.cache.getMerchantSettings(merchantId);
      const secret = s?.webhookSecret;
      if (secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const body = JSON.stringify(data);
        const sig = createHmac('sha256', secret)
          .update(`${ts}.${body}`)
          .digest('base64');
        res.setHeader('X-Loyalty-Signature', `v1,ts=${ts},sig=${sig}`);
        res.setHeader('X-Merchant-Id', merchantId);
        res.setHeader('X-Signature-Timestamp', ts);
        if (s?.webhookKeyId)
          res.setHeader('X-Signature-Key-Id', s.webhookKeyId);
        if (req.requestId) res.setHeader('X-Request-Id', req.requestId);
      }
    } catch {}
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }
}
