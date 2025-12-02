import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  Prisma,
  TxnType,
  WalletType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  IntegrationDevicesQueryDto,
  IntegrationDevicesRespDto,
  IntegrationDeviceDto,
  IntegrationBonusDto,
  IntegrationCalculateDto,
  IntegrationCodeRequestDto,
  IntegrationOperationDto,
  IntegrationOperationMode,
  IntegrationOperationsQueryDto,
  IntegrationOperationsRespDto,
  IntegrationOutletDto,
  IntegrationOutletsRespDto,
  IntegrationRefundDto,
} from './dto';
import { looksLikeJwt, verifyQrToken } from '../loyalty/token.util';
import { Mode } from '../loyalty/dto';
import { normalizeDeviceCode } from '../devices/device.util';
import { verifyBridgeSignature } from '../loyalty/bridge.util';

type IntegrationRequest = Request & {
  integrationMerchantId?: string;
  integrationId?: string;
  integrationRequireBridgeSignature?: boolean;
  requestId?: string;
};

type NormalizedItem = {
  productId?: string;
  externalProvider?: string;
  externalId?: string;
  categoryId?: string;
  categoryExternalId?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  qty: number;
  price: number;
};

type IntegrationOperationInternal = {
  opKey: string;
  kind: 'purchase' | 'refund';
  orderId: string;
  receiptId: string | null;
  receiptNumber: string | null;
  total: number | null;
  redeemApplied: number | null;
  earnApplied: number | null;
  pointsRestored: number | null;
  pointsRevoked: number | null;
  refundShare: number | null;
  refundTotal: number | null;
  refundEligibleTotal: number | null;
  outletId: string | null;
  deviceId: string | null;
  deviceCode: string | null;
  canceledAt: Date | null;
  operationDate: Date;
  customerId: string;
  netDelta: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
};

type RefundMetaNormalized = {
  share: number | null;
  refundTotal: number | null;
  refundEligibleTotal: number | null;
  receiptId: string | null;
};

const MAX_OPERATIONS_LIMIT = 500;

@Controller('api/integrations')
@UseGuards(IntegrationApiKeyGuard)
@ApiTags('integrations')
export class IntegrationsLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly prisma: PrismaService,
  ) {}

  private mapMode(mode: IntegrationOperationMode): Mode {
    if (mode === IntegrationOperationMode.EARN) return Mode.EARN;
    return Mode.REDEEM;
  }

  private parseOperationDate(raw?: string | null): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('operationDate must be a valid date');
    }
    return parsed;
  }

  private sanitizeAmount(value: unknown, fallback = 0): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return num;
  }

  private sanitizeLimit(value?: number | null, fallback = 200) {
    const num = Number(value);
    const base = Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
    return Math.min(MAX_OPERATIONS_LIMIT, Math.max(1, base));
  }

  private parseDateTime(raw: string | undefined | null, field: string): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return parsed;
  }

  private normalizeItems(items?: unknown[]): NormalizedItem[] {
    if (!Array.isArray(items)) return [];
    const list: NormalizedItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, any>;
      const qty = this.sanitizeAmount(
        item.qty ?? item.quantity ?? item.count ?? 0,
      );
      const price = this.sanitizeAmount(
        item.price ?? item.cost ?? item.amount ?? 0,
      );
      if (qty <= 0) continue;
      if (price < 0) continue;
      const externalProvider =
        typeof item.externalProvider === 'string' &&
        item.externalProvider.trim().length
          ? item.externalProvider.trim()
          : undefined;
      const externalIdCandidate =
        (typeof item.id_product === 'string' && item.id_product.trim()) ||
        (typeof item.productCode === 'string' && item.productCode.trim()) ||
        (typeof (item as any).externalId === 'string' &&
          (item as any).externalId.trim()) ||
        (typeof (item as any).idProduct === 'string' &&
          (item as any).idProduct.trim()) ||
        undefined;
      const productId =
        typeof item.productId === 'string' && item.productId.trim().length
          ? item.productId.trim()
          : undefined;
      const categoryId =
        typeof item.categoryId === 'string' && item.categoryId.trim().length
          ? item.categoryId.trim()
          : undefined;
      const categoryExternalId =
        typeof item.categoryExternalId === 'string' &&
        item.categoryExternalId.trim().length
          ? item.categoryExternalId.trim()
          : undefined;
      const name =
        typeof item.name === 'string' && item.name.trim().length
          ? item.name.trim()
          : undefined;
      const sku =
        typeof item.sku === 'string' && item.sku.trim().length
          ? item.sku.trim()
          : undefined;
      const barcode =
        typeof item.barcode === 'string' && item.barcode.trim().length
          ? item.barcode.trim()
          : undefined;
      list.push({
        productId,
        externalProvider,
        externalId: externalIdCandidate,
        categoryId,
        categoryExternalId,
        name,
        sku,
        barcode,
        qty,
        price,
      });
    }
    return list;
  }

  private async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
      try {
        const v = await verifyQrToken(secret, userToken);
        return v;
      } catch (e: any) {
        const code = e?.code || e?.name || '';
        const msg = String(e?.message || e || '');
        if (
          code === 'ERR_JWT_EXPIRED' ||
          /JWTExpired/i.test(code) ||
          /"exp"/i.test(msg)
        ) {
          throw new BadRequestException(
            'JWTExpired: "exp" claim timestamp check failed',
          );
        }
        throw new BadRequestException('Bad QR token');
      }
    }
    const now = Math.floor(Date.now() / 1000);
    return {
      merchantCustomerId: userToken,
      merchantAud: undefined,
      jti: `plain:${userToken}:${now}`,
      iat: now,
      exp: now + 3600,
    } as const;
  }

  private async resolveMerchantContext(merchantId: string, merchantCustomerId: string) {
    const prismaAny = this.prisma as any;
    const merchantCustomer = await prismaAny?.merchantCustomer?.findUnique?.({
      where: { id: merchantCustomerId },
      include: { customer: true },
    });
    if (!merchantCustomer || merchantCustomer.merchantId !== merchantId) {
      throw new BadRequestException('merchant customer not found');
    }
    if (!merchantCustomer.customer) {
      throw new BadRequestException('customer record not found');
    }
    return { merchantCustomer, customer: merchantCustomer.customer };
  }

  private async ensureDeviceContext(
    merchantId: string,
    rawDeviceId?: string | null,
    outletId?: string | null,
  ) {
    if (!rawDeviceId) return null;
    const { code, normalized } = normalizeDeviceCode(String(rawDeviceId || ''));
    let device = await this.prisma.device.findFirst({
      where: {
        merchantId,
        codeNormalized: normalized,
        archivedAt: null,
      },
    });
    if (!device) {
      device = await this.prisma.device.findFirst({
        where: { id: rawDeviceId, merchantId, archivedAt: null },
      });
    }
    if (!device) {
      throw new BadRequestException('Устройство не найдено или удалено');
    }
    if (outletId && device.outletId && device.outletId !== outletId) {
      throw new BadRequestException(
        'Устройство привязано к другой торговой точке',
      );
    }
    return { id: device.id, code, outletId: device.outletId ?? null };
  }

  private async verifyBridgeSignatureIfRequired(
    req: IntegrationRequest,
    merchantId: string,
    outletId: string | null,
    payload: unknown,
  ) {
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
      });
      const requireSig =
        Boolean(req.integrationRequireBridgeSignature) ||
        Boolean(settings?.requireBridgeSig);
      if (!requireSig) return;
      const sig =
        (req.headers['x-bridge-signature'] as string | undefined) || '';
      if (!sig) return;
      let secret: string | null = null;
      let alt: string | null = null;
      if (outletId) {
        try {
          const outlet = await this.prisma.outlet.findFirst({
            where: { id: outletId, merchantId },
          });
          secret = outlet?.bridgeSecret ?? null;
          alt = (outlet as any)?.bridgeSecretNext ?? null;
        } catch {}
      }
      if (!secret && !alt) {
        secret = settings?.bridgeSecret || null;
        alt = (settings as any)?.bridgeSecretNext || null;
      }
      if (!secret && !alt) return;
      const body = JSON.stringify(payload ?? {});
      const ok =
        (secret && verifyBridgeSignature(sig, body, secret)) ||
        (alt && verifyBridgeSignature(sig, body, alt));
      if (!ok) {
        throw new UnauthorizedException('Invalid bridge signature');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
    }
  }

  private normalizeRefundMeta(meta?: unknown): RefundMetaNormalized {
    const raw =
      meta && typeof meta === 'object' ? (meta as Record<string, any>) : null;
    const parseNum = (value: any): number | null => {
      if (value == null) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const share = parseNum(
      raw?.share ?? raw?.refundShare ?? raw?.refund_share ?? null,
    );
    const refundTotal = parseNum(
      raw?.refundTotal ?? raw?.refund_total ?? null,
    );
    const refundEligibleTotal = parseNum(
      raw?.refundEligibleTotal ??
        raw?.refund_eligible_total ??
        raw?.refundEligible ??
        raw?.refund_eligible ??
        null,
    );
    const receiptId =
      typeof raw?.receiptId === 'string' && raw.receiptId.trim().length
        ? raw.receiptId.trim()
        : null;
    return {
      share: share != null ? share : null,
      refundTotal: refundTotal != null ? refundTotal : null,
      refundEligibleTotal:
        refundEligibleTotal != null ? refundEligibleTotal : null,
      receiptId,
    };
  }

  private async logIntegrationSync(
    req: IntegrationRequest,
    endpoint: string,
    status: 'ok' | 'error',
    payload?: Record<string, any> | null,
    error?: any,
  ) {
    try {
      await this.prisma.syncLog.create({
        data: {
          merchantId: req.integrationMerchantId ?? null,
          integrationId: req.integrationId ?? null,
          provider: 'REST_API',
          direction: 'IN',
          endpoint,
          status,
          request: payload ?? Prisma.JsonNull,
          response: Prisma.JsonNull,
          error: error ? String(error) : null,
        },
      });
    } catch {}
  }

  private async collectTransactionIds(merchantId: string, orderId: string) {
    const txns = await this.prisma.transaction.findMany({
      where: { merchantId, orderId },
      select: { id: true, type: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      transactionIds: txns.map((tx) => tx.id),
      redeemTransactionIds: txns
        .filter((tx) => tx.type === TxnType.REDEEM)
        .map((tx) => tx.id),
      earnTransactionIds: txns
        .filter((tx) => tx.type === TxnType.EARN)
        .map((tx) => tx.id),
      refundTransactionIds: txns
        .filter((tx) => tx.type === TxnType.REFUND)
        .map((tx) => tx.id),
    };
  }

  @Get('outlets')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationOutletsRespDto })
  async outlets(
    @Req() req: IntegrationRequest,
  ): Promise<IntegrationOutletsRespDto> {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');

    const outlets = await this.prisma.outlet.findMany({
      where: { merchantId },
      select: { id: true, name: true, address: true, description: true },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
    await this.logIntegrationSync(req, 'GET /api/integrations/outlets', 'ok', {
      count: outlets.length,
    });
    return {
      items: outlets.map(
        (outlet): IntegrationOutletDto => ({
          id: outlet.id,
          name: outlet.name,
          address: outlet.address ?? null,
          description: outlet.description ?? null,
        }),
      ),
    };
  }

  @Get('devices')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationDevicesRespDto })
  async devices(
    @Query() query: IntegrationDevicesQueryDto,
    @Req() req: IntegrationRequest,
  ): Promise<IntegrationDevicesRespDto> {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const outletId =
      typeof query.outletId === 'string' && query.outletId.trim()
        ? query.outletId.trim()
        : null;
    if (outletId) {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: outletId, merchantId },
        select: { id: true },
      });
      if (!outlet) {
        throw new BadRequestException('Торговая точка не найдена');
      }
    }
    const devices = await this.prisma.device.findMany({
      where: {
        merchantId,
        archivedAt: null,
        ...(outletId ? { outletId } : {}),
      },
      select: { id: true, code: true, outletId: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    await this.logIntegrationSync(req, 'GET /api/integrations/devices', 'ok', {
      count: devices.length,
      outletId,
    });
    return {
      items: devices.map(
        (device): IntegrationDeviceDto => ({
          id: device.id,
          code: device.code,
          outletId: device.outletId,
        }),
      ),
    };
  }

  @Get('operations')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationOperationsRespDto })
  async operations(
    @Query() query: IntegrationOperationsQueryDto,
    @Req() req: IntegrationRequest,
  ): Promise<IntegrationOperationsRespDto> {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');

    const orderIdRaw =
      typeof query.orderId === 'string' && query.orderId.trim()
        ? query.orderId.trim()
        : null;
    const outletId =
      typeof query.outletId === 'string' && query.outletId.trim()
        ? query.outletId.trim()
        : null;
    const deviceRaw =
      typeof query.deviceId === 'string' && query.deviceId.trim()
        ? query.deviceId.trim()
        : null;
    const limit = this.sanitizeLimit(query.limit, 200);
    const fromDate = this.parseDateTime(query.from, 'from');
    const toDate = this.parseDateTime(query.to, 'to');
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be earlier than to');
    }
    const createdAtFilter =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    if (outletId) {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: outletId, merchantId },
        select: { id: true },
      });
      if (!outlet) {
        throw new BadRequestException('Торговая точка не найдена');
      }
    }

    let resolvedDeviceId: string | null = null;
    if (deviceRaw) {
      const { normalized } = normalizeDeviceCode(deviceRaw);
      const device = await this.prisma.device.findFirst({
        where: {
          merchantId,
          archivedAt: null,
          OR: [{ codeNormalized: normalized }, { id: deviceRaw }],
        },
        select: { id: true, outletId: true },
      });
      if (!device) {
        throw new BadRequestException('Устройство не найдено или удалено');
      }
      if (outletId && device.outletId && device.outletId !== outletId) {
        throw new BadRequestException(
          'Устройство привязано к другой торговой точке',
        );
      }
      resolvedDeviceId = device.id;
    }

    let normalizedOrderId = orderIdRaw;
    if (orderIdRaw) {
      try {
        const byReceipt = await this.prisma.receipt.findFirst({
          where: { merchantId, receiptNumber: orderIdRaw },
          select: { orderId: true },
        });
        if (byReceipt?.orderId) {
          normalizedOrderId = byReceipt.orderId;
        }
      } catch {}
    }

    const orderFilterForReceipts = orderIdRaw
      ? {
          OR: [
            { orderId: normalizedOrderId ?? orderIdRaw },
            { receiptNumber: orderIdRaw },
          ],
        }
      : undefined;
    const orderFilterValue = normalizedOrderId ?? orderIdRaw ?? null;

    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        ...(orderFilterForReceipts ?? {}),
        ...(outletId ? { outletId } : {}),
        ...(resolvedDeviceId ? { deviceId: resolvedDeviceId } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderId: true,
        receiptNumber: true,
        total: true,
        redeemApplied: true,
        earnApplied: true,
        createdAt: true,
        outletId: true,
        deviceId: true,
        customerId: true,
        canceledAt: true,
        device: { select: { code: true } },
      },
    });

    const operations: IntegrationOperationInternal[] = receipts.map(
      (receipt) => ({
        opKey: `purchase:${receipt.id}`,
        kind: 'purchase',
        orderId: receipt.orderId,
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber ?? null,
        total: receipt.total ?? null,
        redeemApplied: receipt.redeemApplied ?? 0,
        earnApplied: receipt.earnApplied ?? 0,
        pointsRestored: null,
        pointsRevoked: null,
        refundShare: null,
        refundTotal: null,
        refundEligibleTotal: null,
        outletId: receipt.outletId ?? null,
        deviceId: receipt.deviceId ?? null,
        deviceCode: receipt.device?.code ?? null,
        canceledAt: receipt.canceledAt ?? null,
        operationDate: receipt.createdAt,
        customerId: receipt.customerId,
        netDelta:
          Math.max(0, receipt.earnApplied ?? 0) -
          Math.max(0, receipt.redeemApplied ?? 0),
      }),
    );

    const refundTxToOpKey = new Map<string, string>();
    const refundGroups = new Map<
      string,
      {
        opKey: string;
        orderId: string;
        receiptId: string | null;
        refundTotal: number | null;
        refundEligibleTotal: number | null;
        refundShare: number | null;
        createdAt: Date;
        outletId: string | null;
        deviceId: string | null;
        deviceCode: string | null;
        customerId: string;
        pointsRestored: number;
        pointsRevoked: number;
      }
    >();
    const refundTake = Math.min(limit * 4, 2000);
    const refundTxns = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        type: TxnType.REFUND,
        canceledAt: null,
        ...(orderFilterValue ? { orderId: orderFilterValue } : {}),
        ...(outletId ? { outletId } : {}),
        ...(resolvedDeviceId ? { deviceId: resolvedDeviceId } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: refundTake,
      select: {
        id: true,
        orderId: true,
        amount: true,
        createdAt: true,
        outletId: true,
        deviceId: true,
        customerId: true,
        metadata: true,
        device: { select: { code: true } },
      },
    });
    for (const tx of refundTxns) {
      if (!tx.orderId) continue;
      const meta = this.normalizeRefundMeta(tx.metadata);
      const keyParts = [
        tx.orderId,
        meta.refundTotal != null ? Math.round(meta.refundTotal) : 'na',
        meta.refundEligibleTotal != null
          ? Math.round(meta.refundEligibleTotal)
          : 'na',
        meta.share != null ? Math.round(meta.share * 1_000_000) : 'na',
        tx.createdAt.toISOString(),
      ];
      const key = keyParts.join('|');
      let group = refundGroups.get(key);
      if (!group) {
        group = {
          opKey: `refund:${key}`,
          orderId: tx.orderId,
          receiptId: meta.receiptId,
          refundTotal: meta.refundTotal,
          refundEligibleTotal: meta.refundEligibleTotal,
          refundShare: meta.share,
          createdAt: tx.createdAt,
          outletId: tx.outletId ?? null,
          deviceId: tx.deviceId ?? null,
          deviceCode: tx.device?.code ?? null,
          customerId: tx.customerId,
          pointsRestored: 0,
          pointsRevoked: 0,
        };
        refundGroups.set(key, group);
      }
      if (tx.amount > 0) group.pointsRestored += tx.amount;
      if (tx.amount < 0) group.pointsRevoked += Math.abs(tx.amount);
      refundTxToOpKey.set(tx.id, group.opKey);
    }

    const receiptMetaByOrder = new Map<
      string,
      { receiptNumber: string | null; canceledAt: Date | null }
    >();
    for (const receipt of receipts) {
      receiptMetaByOrder.set(receipt.orderId, {
        receiptNumber: receipt.receiptNumber ?? null,
        canceledAt: receipt.canceledAt ?? null,
      });
    }
    const refundOperations: IntegrationOperationInternal[] = [];
    for (const group of refundGroups.values()) {
      refundOperations.push({
        opKey: group.opKey,
        kind: 'refund',
        orderId: group.orderId,
        receiptId: group.receiptId ?? null,
        receiptNumber: null,
        total: group.refundTotal ?? null,
        redeemApplied: null,
        earnApplied: null,
        pointsRestored: group.pointsRestored ?? null,
        pointsRevoked: group.pointsRevoked ?? null,
        refundShare: group.refundShare,
        refundTotal: group.refundTotal ?? null,
        refundEligibleTotal: group.refundEligibleTotal ?? null,
        outletId: group.outletId,
        deviceId: group.deviceId,
        deviceCode: group.deviceCode ?? null,
        canceledAt: null,
        operationDate: group.createdAt,
        customerId: group.customerId,
        netDelta:
          Math.max(0, group.pointsRestored ?? 0) -
          Math.max(0, group.pointsRevoked ?? 0),
      });
    }

    const missingOrderIds = Array.from(
      new Set(
        refundOperations
          .map((op) => op.orderId)
          .filter((id) => id && !receiptMetaByOrder.has(id)),
      ),
    ) as string[];
    if (missingOrderIds.length) {
      const receiptsExtra = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: missingOrderIds } },
        select: { orderId: true, receiptNumber: true, canceledAt: true },
      });
      for (const receipt of receiptsExtra) {
        if (!receipt.orderId) continue;
        receiptMetaByOrder.set(receipt.orderId, {
          receiptNumber: receipt.receiptNumber ?? null,
          canceledAt: receipt.canceledAt ?? null,
        });
      }
    }
    for (const op of refundOperations) {
      const meta = receiptMetaByOrder.get(op.orderId);
      if (meta) {
        op.receiptNumber = meta.receiptNumber ?? op.receiptNumber ?? null;
        if (!op.canceledAt) op.canceledAt = meta.canceledAt ?? null;
      }
    }

    const merged = [...operations, ...refundOperations].sort((a, b) => {
      const diff = b.operationDate.getTime() - a.operationDate.getTime();
      if (diff !== 0) return diff;
      return a.opKey > b.opKey ? 1 : -1;
    });
    const sliced = merged.slice(0, limit);
    const activeKeys = new Set(sliced.map((op) => op.opKey));

    const purchaseOrderToOpKey = new Map<string, string>();
    for (const op of sliced) {
      if (op.kind === 'purchase' && op.orderId) {
        purchaseOrderToOpKey.set(op.orderId, op.opKey);
      }
    }
    const refundTxToOpKeyActive = new Map<string, string>();
    for (const [txId, opKey] of refundTxToOpKey.entries()) {
      if (activeKeys.has(opKey)) {
        refundTxToOpKeyActive.set(txId, opKey);
      }
    }

    const customerIds = Array.from(
      new Set(sliced.map((op) => op.customerId).filter(Boolean)),
    ) as string[];
    if (customerIds.length > 0) {
      const wallets = await this.prisma.wallet.findMany({
        where: {
          merchantId,
          customerId: { in: customerIds },
          type: WalletType.POINTS,
        },
        select: { customerId: true, balance: true },
      });
      const balanceMap = new Map<string, number>();
      for (const wallet of wallets) {
        balanceMap.set(wallet.customerId, wallet.balance ?? 0);
      }
      for (const cid of customerIds) {
        if (!balanceMap.has(cid)) balanceMap.set(cid, 0);
      }

      const txns = await this.prisma.transaction.findMany({
        where: { merchantId, customerId: { in: customerIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          customerId: true,
          amount: true,
          type: true,
          orderId: true,
          createdAt: true,
        },
      });

      const progress = new Map<
        string,
        { netDelta: number; seenDelta: number; balanceBefore?: number | null }
      >();
      for (const op of sliced) {
        progress.set(op.opKey, {
          netDelta: op.netDelta ?? 0,
          seenDelta: 0,
          balanceBefore: undefined,
        });
      }

      for (const tx of txns) {
        const current = balanceMap.get(tx.customerId) ?? 0;
        const before = current - tx.amount;
        let opKey: string | null = null;
        if (refundTxToOpKeyActive.has(tx.id)) {
          opKey = refundTxToOpKeyActive.get(tx.id)!;
        } else if (
          tx.orderId &&
          (tx.type === TxnType.EARN || tx.type === TxnType.REDEEM) &&
          purchaseOrderToOpKey.has(tx.orderId)
        ) {
          opKey = purchaseOrderToOpKey.get(tx.orderId)!;
        }
        if (opKey && activeKeys.has(opKey)) {
          const state = progress.get(opKey);
          if (state) {
            state.seenDelta += tx.amount;
            if (
              state.balanceBefore === undefined &&
              Math.abs(state.seenDelta - state.netDelta) < 0.0001
            ) {
              state.balanceBefore = before;
            }
          }
        }
        balanceMap.set(tx.customerId, before);
      }

      for (const op of sliced) {
        const state = progress.get(op.opKey);
        if (state && state.balanceBefore != null) {
          op.balanceBefore = state.balanceBefore;
          op.balanceAfter = state.balanceBefore + (op.netDelta ?? 0);
        }
      }
    }

    const items: IntegrationOperationDto[] = sliced.map((op) => ({
      kind: op.kind,
      orderId: op.orderId,
      receiptId: op.receiptId,
      receiptNumber: op.receiptNumber,
      operationDate: op.operationDate.toISOString(),
      total: op.total,
      redeemApplied: op.redeemApplied,
      earnApplied: op.earnApplied,
      pointsRestored: op.pointsRestored,
      pointsRevoked: op.pointsRevoked,
      balanceBefore: op.balanceBefore ?? null,
      balanceAfter: op.balanceAfter ?? null,
      outletId: op.outletId,
      deviceId: op.deviceId,
      deviceCode: op.deviceCode,
      refundShare: op.refundShare,
      refundTotal: op.refundTotal,
      refundEligibleTotal: op.refundEligibleTotal,
      canceledAt: op.canceledAt ? op.canceledAt.toISOString() : null,
      pointsDelta: op.netDelta,
    }));

    await this.logIntegrationSync(
      req,
      'GET /api/integrations/operations',
      'ok',
      {
        orderId: orderIdRaw,
        outletId,
        deviceId: deviceRaw,
        from: query.from ?? null,
        to: query.to ?? null,
        count: items.length,
        limit,
      },
    );
    return { items };
  }

  @Post('code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async code(
    @Body() dto: IntegrationCodeRequestDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const userToken = (dto.userToken || '').trim();
    if (!userToken) throw new BadRequestException('userToken required');

    const resolved = await this.resolveFromToken(userToken);
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const { customer, merchantCustomer } = await this.resolveMerchantContext(
      merchantId,
      resolved.merchantCustomerId,
    );

    if (dto.deviceId) {
      await this.ensureDeviceContext(merchantId, dto.deviceId, null);
    }
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      null,
      req.body,
    );
    const balanceResp = await this.loyalty.balance(
      merchantId,
      merchantCustomer.id,
    );
    const name =
      (customer.name && customer.name.trim()) ||
      (merchantCustomer.name && merchantCustomer.name.trim()) ||
      null;
    const phone =
      (customer.phone && customer.phone.trim()) ||
      (merchantCustomer.phone && merchantCustomer.phone.trim()) ||
      null;
    const email =
      (customer.email && customer.email.trim()) ||
      (merchantCustomer.email && merchantCustomer.email.trim()) ||
      null;
    return {
      type: 'bonus',
      client: {
        id_client: customer.id,
        id_ext: merchantCustomer.id,
        name,
        phone,
        email,
        balance: balanceResp?.balance ?? 0,
      },
    };
  }

  @Post('bonus/calculate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async calculate(
    @Body() dto: IntegrationCalculateDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const userToken = (dto.userToken || '').trim();
    const orderId = (dto.orderId || '').trim();
    if (!userToken) throw new BadRequestException('userToken required');
    if (!orderId) throw new BadRequestException('orderId required');
    const resolved = await this.resolveFromToken(userToken);
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const { customer, merchantCustomer } = await this.resolveMerchantContext(
      merchantId,
      resolved.merchantCustomerId,
    );
    const sanitizedTotal = this.sanitizeAmount(dto.total);
    const sanitizedEligible = this.sanitizeAmount(
      dto.eligibleTotal ?? dto.total,
      sanitizedTotal,
    );
    const items = this.normalizeItems(dto.items);
    const outletId =
      typeof dto.outletId === 'string' && dto.outletId.trim()
        ? dto.outletId.trim()
        : null;
    const rawDeviceId =
      typeof dto.deviceId === 'string' && dto.deviceId.trim()
        ? dto.deviceId.trim()
        : null;
    const device = await this.ensureDeviceContext(
      merchantId,
      rawDeviceId,
      outletId,
    );
    const effectiveOutletId = outletId ?? device?.outletId ?? null;
    const deviceCode = device?.code ?? rawDeviceId ?? null;
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      effectiveOutletId,
      req.body,
    );

    const mode = this.mapMode(dto.mode);
    const quote = await this.loyalty.quote(
      {
        mode,
        merchantId,
        userToken,
        orderId,
        total: sanitizedTotal,
        eligibleTotal: sanitizedEligible,
        outletId: effectiveOutletId ?? undefined,
        deviceId: dto.deviceId ?? undefined,
        staffId: undefined,
        customerId: customer.id,
        positions: items as any,
      },
      undefined,
      { dryRun: true },
    );
    const balanceResp = await this.loyalty.balance(
      merchantId,
      merchantCustomer.id,
    );
    const maxPaidBonus =
      typeof (quote as any)?.discountToApply === 'number'
        ? (quote as any).discountToApply
        : 0;
    const maxBonusValue =
      mode === Mode.EARN
        ? (quote as any)?.pointsToEarn ?? 0
        : (quote as any)?.postEarnPoints ??
          (quote as any)?.pointsToEarn ??
          0;
    return {
      orderId,
      mode: dto.mode,
      canRedeem: mode !== Mode.EARN && maxPaidBonus > 0,
      canEarn: maxBonusValue > 0,
      maxPaidBonus,
      maxBonusValue,
      finalPayable:
        (quote as any)?.finalPayable ?? Math.max(0, sanitizedTotal),
      balance: balanceResp.balance ?? 0,
    };
  }

  @Post('bonus')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async bonus(
    @Body() dto: IntegrationBonusDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const userToken = (dto.userToken || '').trim();
    const orderId = (dto.orderId || '').trim();
    if (!userToken) throw new BadRequestException('userToken required');
    if (!orderId) throw new BadRequestException('orderId required');
    const resolved = await this.resolveFromToken(userToken);
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const operationDate = this.parseOperationDate(dto.operationDate ?? null);
    const { customer, merchantCustomer } = await this.resolveMerchantContext(
      merchantId,
      resolved.merchantCustomerId,
    );
    const sanitizedTotal = this.sanitizeAmount(dto.total);
    const sanitizedEligible = this.sanitizeAmount(
      dto.eligibleTotal ?? dto.total,
      sanitizedTotal,
    );
    const items = this.normalizeItems(dto.items);
    const outletId =
      typeof dto.outletId === 'string' && dto.outletId.trim()
        ? dto.outletId.trim()
        : null;
    const device = await this.ensureDeviceContext(
      merchantId,
      dto.deviceId ?? null,
      outletId,
    );
    const deviceCode = device?.code ?? (dto.deviceId ?? null);
    const effectiveOutletId = outletId ?? device?.outletId ?? null;
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      effectiveOutletId,
      req.body,
    );

    const paidBonus =
      dto.paid_bonus != null ? this.sanitizeAmount(dto.paid_bonus) : null;
    const bonusValue =
      dto.bonus_value != null ? this.sanitizeAmount(dto.bonus_value) : null;
    const mode = this.mapMode(dto.mode);
    const result = await this.loyalty.processIntegrationBonus({
      merchantId,
      merchantCustomerId: merchantCustomer.id,
      customerId: customer.id,
      userToken,
      mode,
      orderId,
      total: sanitizedTotal,
      eligibleTotal: sanitizedEligible,
      items,
      paidBonus,
      bonusValue,
      outletId: effectiveOutletId,
      deviceId: deviceCode,
      resolvedDeviceId: device?.id ?? null,
      operationDate,
      requestId: req.requestId,
    });
    const txIds = await this.collectTransactionIds(merchantId, orderId);
    return {
      result: 'ok',
      orderId,
      mode: dto.mode,
      alreadyProcessed: result.alreadyProcessed || undefined,
      receiptId: result.receiptId,
      integrationOperationId: result.receiptId,
      redeemApplied: result.redeemApplied ?? 0,
      earnApplied: result.earnApplied ?? 0,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter ?? null,
      ...txIds,
    };
  }

  @Post('refund')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refund(
    @Body() dto: IntegrationRefundDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const operationDate = this.parseOperationDate(dto.operationDate ?? null);
    let orderId =
      typeof dto.orderId === 'string' && dto.orderId.trim()
        ? dto.orderId.trim()
        : '';
    const receiptNumber =
      typeof dto.receiptNumber === 'string' && dto.receiptNumber.trim()
        ? dto.receiptNumber.trim()
        : '';
    if (!orderId) {
      if (!receiptNumber) {
        throw new BadRequestException(
          'orderId or receiptNumber must be provided',
        );
      }
      const receipt = await this.prisma.receipt.findFirst({
        where: { merchantId, receiptNumber },
        select: { orderId: true },
      });
      if (!receipt?.orderId) {
        throw new BadRequestException('Receipt not found');
      }
      orderId = receipt.orderId;
    }
    const device = await this.ensureDeviceContext(
      merchantId,
      dto.deviceId ?? null,
      dto.outletId ?? null,
    );
    const effectiveOutletId = dto.outletId ?? device?.outletId ?? null;
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      effectiveOutletId,
      req.body,
    );

    const result = await this.loyalty.refund(
      merchantId,
      orderId,
      this.sanitizeAmount(dto.refundTotal),
      dto.refundEligibleTotal != null
        ? this.sanitizeAmount(dto.refundEligibleTotal)
        : undefined,
      req.requestId,
      dto.deviceId,
      operationDate,
    );
    const txIds = await this.collectTransactionIds(merchantId, orderId);
    const receipt = await this.prisma.receipt.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
      select: { id: true, customerId: true },
    });
    const balanceAfter =
      result.merchantCustomerId && result.merchantCustomerId.length
        ? (
            await this.loyalty.balance(
              merchantId,
              result.merchantCustomerId,
            )
          ).balance
        : null;
    return {
      result: 'ok',
      orderId,
      receiptId: receipt?.id ?? null,
      share: result.share,
      pointsRestored: result.pointsRestored,
      pointsRevoked: result.pointsRevoked,
      balanceAfter,
      ...txIds,
    };
  }
}
