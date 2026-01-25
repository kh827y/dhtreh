import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoyaltyService } from '../services/loyalty.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { CommitDto, QrMintDto, QuoteDto, RefundDto } from '../dto/dto';
import { signQrToken } from '../utils/token.util';
import { validateTelegramInitData } from '../utils/telegram.util';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import {
  asRecord,
  readErrorMessage,
  readString,
} from '../controllers/loyalty-controller.utils';
import type {
  CashierRequest,
  CommitOptions,
  RequestWithRequestId,
  TeleauthRequest,
} from '../controllers/loyalty-controller.types';
import { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import { LoyaltyIdempotencyService } from '../services/loyalty-idempotency.service';
import { LoyaltyWebhookService } from '../services/loyalty-webhook.service';

@Injectable()
export class LoyaltyTransactionsUseCase {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly cache: LookupCacheService,
    private readonly config: AppConfigService,
    private readonly support: LoyaltyControllerSupportService,
    private readonly idempotency: LoyaltyIdempotencyService,
    private readonly webhook: LoyaltyWebhookService,
  ) {}

  async mintQr(dto: QrMintDto, req: TeleauthRequest) {
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
      const ensured = await this.support.ensureCustomerByTelegram(
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
    await this.support.ensureCustomer(merchantId, customerId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const token = requireJwtForQuote
      ? await signQrToken(secret, customerId, merchantId, ttl)
      : await this.support.mintShortCode(merchantId, customerId, ttl);
    return { token, ttl };
  }

  async quote(dto: QuoteDto, _req: Request & { requestId?: string }) {
    const t0 = Date.now();
    try {
      const v = await this.support.resolveFromToken(dto.userToken);
      const s = await this.cache.getMerchantSettings(dto.merchantId);
      const modeError = this.support.getQrModeError(
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
      const customer = await this.support.ensureCustomer(
        dto.merchantId,
        customerId,
      );
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
      const outlet = await this.support.resolveOutlet(
        dto.merchantId,
        dto.outletId ?? null,
      );
      const qrMeta =
        v.kind === 'jwt' || v.kind === 'short'
          ? { jti: v.jti, iat: v.iat, exp: v.exp, kind: v.kind }
          : undefined;
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

  async commit(dto: CommitDto, res: Response, req: RequestWithRequestId) {
    const t0 = Date.now();
    let data: unknown;
    let holdCached: Awaited<
      ReturnType<PrismaService['hold']['findUnique']>
    > | null = null;
    try {
      holdCached = await this.prisma.hold.findUnique({
        where: { id: dto.holdId },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyTransactionsUseCase hold lookup',
        undefined,
        'debug',
      );
    }
    const merchantIdEff = holdCached?.merchantId || dto.merchantId;

    let customerId: string | null = null;
    if (holdCached?.customerId && merchantIdEff) {
      const customer = await this.support.ensureCustomer(
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
          ? this.support.hashIdempotencyPayload({
              merchantId: merchantForIdem,
              holdId: dto.holdId,
              orderId: dto.orderId ?? null,
              receiptNumber: dto.receiptNumber ?? null,
              positions: commitOpts?.positions ?? null,
            })
          : null;
      data = await this.idempotency.run({
        merchantId: merchantForIdem,
        scope,
        key: idemKey,
        requestHash,
        execute: () =>
          this.service.commit(
            dto.holdId,
            dto.orderId,
            dto.receiptNumber,
            req.requestId,
            commitOpts,
          ),
        normalize: (value) => {
          const dataRecord = asRecord(value);
          if (dataRecord?.alreadyCommitted === true) {
            const rest = { ...dataRecord };
            delete (rest as Record<string, unknown>).alreadyCommitted;
            return rest as typeof value;
          }
          return value;
        },
      });
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
    const webhookSettings = merchantIdEff
      ? await this.cache.getMerchantSettings(merchantIdEff)
      : null;
    await this.webhook.applySignatureHeaders({
      merchantId: merchantIdEff,
      res,
      payload: data,
      requestId: req.requestId,
      settings: webhookSettings,
    });
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }

  async cancel(holdId: string, req: CashierRequest) {
    if (!holdId) throw new BadRequestException('holdId required');
    return this.service.cancel(holdId, req.cashierSession?.merchantId);
  }

  balance(merchantId: string, customerId: string) {
    return this.service.balance(merchantId, customerId);
  }

  async publicSettings(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const { share } = await this.support.buildReviewsShareSettings(
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
    };
  }

  async getMiniappLogo(merchantId: string, assetId: string, res: Response) {
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

  async refund(dto: RefundDto, res: Response, req: RequestWithRequestId) {
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
        ? this.support.hashIdempotencyPayload({
            merchantId,
            invoiceNum: invoiceNum || null,
            orderId: orderId || null,
            receiptNumber,
            deviceId: dto.deviceId ?? null,
            operationDate: operationDate ? operationDate.toISOString() : null,
          })
        : null;
      if (idemKey) {
        data = await this.idempotency.run({
          merchantId,
          scope,
          key: idemKey,
          requestHash,
          execute: () =>
            this.service.refund({
              merchantId,
              invoiceNum,
              orderId,
              requestId: req.requestId,
              deviceId: dto.deviceId,
              operationDate,
            }),
        });
      } else {
        data = await this.service.refund({
          merchantId,
          invoiceNum,
          orderId,
          requestId: req.requestId,
          deviceId: dto.deviceId,
          operationDate,
        });
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
            const mc = await this.support.ensureCustomer(
              merchantId,
              receipt.customerId,
            );
            customerId = mc.id;
          }
        } catch (err) {
          logIgnoredError(
            err,
            'LoyaltyTransactionsUseCase refund receipt',
            undefined,
            'debug',
          );
        }
      }
      this.metrics.inc('loyalty_refund_requests_total', { result: 'ok' });
    } catch (e) {
      this.metrics.inc('loyalty_refund_requests_total', { result: 'error' });
      throw e;
    }
    const webhookSettings = await this.cache.getMerchantSettings(merchantId);
    await this.webhook.applySignatureHeaders({
      merchantId,
      res,
      payload: data,
      requestId: req.requestId,
      settings: webhookSettings,
      useNextSecret: false,
    });
    const dataRecord = asRecord(data);
    if (customerId && dataRecord) {
      dataRecord.customerId = customerId;
    }
    return data;
  }
}
