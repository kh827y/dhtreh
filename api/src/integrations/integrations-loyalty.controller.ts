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
  StaffStatus,
  StaffOutletAccessStatus,
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
  IntegrationCalculateActionDto,
  IntegrationCalculateBonusDto,
  IntegrationCodeRequestDto,
  IntegrationOperationDto,
  IntegrationOperationsQueryDto,
  IntegrationOperationsRespDto,
  IntegrationOutletDto,
  IntegrationOutletsRespDto,
  IntegrationRefundDto,
  IntegrationClientMigrationDto,
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
  externalId?: string;
  categoryId?: string;
  name?: string;
  qty: number;
  price: number;
  basePrice?: number;
  allowEarnAndPay?: boolean;
  actions?: string[];
  actionNames?: string[];
  earnMultiplier?: number;
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
    const parseBool = (value: any): boolean | undefined => {
      if (value === true || value === false) return Boolean(value);
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1') return true;
        if (v === 'false' || v === '0') return false;
      }
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }
      return undefined;
    };
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
      const externalIdCandidate =
        (typeof item.id_product === 'string' && item.id_product.trim()) ||
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
          : typeof (item as any).category_id === 'string' &&
              (item as any).category_id.trim().length
            ? (item as any).category_id.trim()
            : undefined;
      const name =
        typeof item.name === 'string' && item.name.trim().length
          ? item.name.trim()
          : undefined;
      const basePrice = this.sanitizeAmount(
        (item as any).base_price ?? (item as any).basePrice ?? price,
        price,
      );
      const allowEarnAndPay = parseBool(
        (item as any).allow_earn_and_pay ?? (item as any).allowEarnAndPay,
      );
      const actions = Array.isArray((item as any).actions)
        ? (item as any).actions
            .map((v: any) =>
              typeof v === 'string' && v.trim().length ? v.trim() : null,
            )
            .filter((v: string | null): v is string => Boolean(v))
        : undefined;
      const actionNames = Array.isArray((item as any).action_names)
        ? (item as any).action_names
            .map((v: any) =>
              typeof v === 'string' && v.trim().length ? v.trim() : null,
            )
            .filter((v: string | null): v is string => Boolean(v))
        : undefined;
      const earnMultiplierRaw =
        (item as any).earn_multiplier ?? (item as any).multiplier;
      const earnMultiplier =
        Number.isFinite(Number(earnMultiplierRaw)) && Number(earnMultiplierRaw) > 0
          ? Number(earnMultiplierRaw)
          : undefined;
      list.push({
        productId,
        externalId: externalIdCandidate,
        categoryId,
        name,
        qty,
        price,
        basePrice,
        allowEarnAndPay,
        actions,
        actionNames,
        earnMultiplier,
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

  private async ensureOutletContext(
    merchantId: string,
    outletId?: string | null,
  ) {
    if (!outletId) return null;
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: outletId, merchantId },
      select: { id: true },
    });
    if (!outlet) {
      throw new BadRequestException('Торговая точка не найдена');
    }
    return outlet.id;
  }

  private async resolveCustomerContext(
    merchantId: string,
    payload: {
      userToken?: string | null;
      id_client?: string | null;
      merchantCustomerId?: string | null;
    },
  ) {
    const userToken =
      typeof payload.userToken === 'string' && payload.userToken.trim().length
        ? payload.userToken.trim()
        : '';
    const idClient =
      typeof payload.id_client === 'string' && payload.id_client.trim().length
        ? payload.id_client.trim()
        : '';
    const merchantCustomerId =
      typeof payload.merchantCustomerId === 'string' &&
      payload.merchantCustomerId.trim().length
        ? payload.merchantCustomerId.trim()
        : '';

    if (!userToken && !idClient && !merchantCustomerId) {
      throw new BadRequestException(
        'userToken или id_client или merchantCustomerId обязательны',
      );
    }

    let explicit: { customer: any; merchantCustomer: any } | null = null;
    if (merchantCustomerId) {
      const mc = await this.prisma.merchantCustomer.findUnique({
        where: { id: merchantCustomerId },
        include: { customer: true },
      });
      if (!mc || mc.merchantId !== merchantId) {
        throw new BadRequestException('merchant customer not found');
      }
      if (!mc.customer) {
        throw new BadRequestException('customer record not found');
      }
      explicit = { merchantCustomer: mc, customer: mc.customer };
    } else if (idClient) {
      const mc = await this.prisma.merchantCustomer.findUnique({
        where: {
          merchantId_customerId: { merchantId, customerId: idClient },
        },
        include: { customer: true },
      });
      if (!mc) {
        throw new BadRequestException('merchant customer not found');
      }
      if (!mc.customer) {
        throw new BadRequestException('customer record not found');
      }
      explicit = { merchantCustomer: mc, customer: mc.customer };
    }

    let tokenContext: { customer: any; merchantCustomer: any } | null = null;
    if (userToken) {
      const resolved = await this.resolveFromToken(userToken);
      if (
        resolved.merchantAud &&
        resolved.merchantAud !== 'any' &&
        resolved.merchantAud !== merchantId
      ) {
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      const ctx = await this.resolveMerchantContext(
        merchantId,
        resolved.merchantCustomerId,
      );
      tokenContext = ctx;
    }

    if (
      explicit &&
      tokenContext &&
      explicit.customer.id !== tokenContext.customer.id
    ) {
      throw new BadRequestException(
        'userToken не совпадает с id_client/merchantCustomerId',
      );
    }

    const finalCtx = explicit ?? tokenContext;
    if (!finalCtx) {
      throw new BadRequestException('merchant customer not found');
    }
    return {
      ...finalCtx,
      userToken: userToken || null,
    };
  }

  private buildStaffName(staff: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    login?: string | null;
    email?: string | null;
  }) {
    const first =
      typeof staff.firstName === 'string' ? staff.firstName.trim() : '';
    const last =
      typeof staff.lastName === 'string' ? staff.lastName.trim() : '';
    const full = [first, last].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (staff.login && staff.login.trim()) return staff.login.trim();
    if (staff.email && staff.email.trim()) return staff.email.trim();
    return staff.id;
  }

  private async resolveStaffContext(
    merchantId: string,
    staffId?: string | null,
    outletId?: string | null,
  ) {
    if (!staffId) return null;
    const staff = await this.prisma.staff.findFirst({
      where: {
        id: staffId,
        merchantId,
        status: StaffStatus.ACTIVE,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
        allowedOutletId: true,
        accesses: {
          where: { status: StaffOutletAccessStatus.ACTIVE },
          select: { outletId: true },
        },
      },
    });
    if (!staff) {
      throw new BadRequestException('Сотрудник не найден или отключён');
    }
    const outletFromStaff =
      staff.allowedOutletId ??
      ((Array.isArray(staff.accesses) ? staff.accesses : []).find(
        (a) => a?.outletId,
      )?.outletId ??
        null);
    if (outletId && outletFromStaff && outletFromStaff !== outletId) {
      throw new BadRequestException(
        'Сотрудник не привязан к указанной торговой точке',
      );
    }
    return {
      id: staff.id,
      outletId: outletId ?? outletFromStaff ?? null,
      name: this.buildStaffName(staff),
    };
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
    const receiptId =
      typeof raw?.receiptId === 'string' && raw.receiptId.trim().length
        ? raw.receiptId.trim()
        : null;
    return {
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
    const managersByOutlet = new Map<
      string,
      { id: string; name: string; code: string | null }[]
    >();
    if (outlets.length > 0) {
      const accesses = await this.prisma.staffOutletAccess.findMany({
        where: {
          merchantId,
          outletId: { in: outlets.map((o) => o.id) },
          status: StaffOutletAccessStatus.ACTIVE,
          staff: { status: StaffStatus.ACTIVE },
        },
        select: {
          outletId: true,
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              login: true,
              email: true,
            },
          },
        },
      });
      for (const row of accesses) {
        if (!row.outletId || !row.staff) continue;
        const current = managersByOutlet.get(row.outletId) ?? [];
        current.push({
          id: row.staff.id,
          name: this.buildStaffName(row.staff),
          code:
            (row.staff.login && row.staff.login.trim()) ||
            (row.staff.email && row.staff.email.trim()) ||
            null,
        });
        managersByOutlet.set(row.outletId, current);
      }
    }
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
          managers: managersByOutlet.get(outlet.id) ?? [],
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

    const invoiceNumRaw =
      typeof query.invoice_num === 'string' && query.invoice_num.trim()
        ? query.invoice_num.trim()
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

    let normalizedOrderId = invoiceNumRaw;
    if (invoiceNumRaw) {
      try {
        const byReceipt = await this.prisma.receipt.findFirst({
          where: { merchantId, receiptNumber: invoiceNumRaw },
          select: { orderId: true },
        });
        if (byReceipt?.orderId) {
          normalizedOrderId = byReceipt.orderId;
        }
      } catch {}
    }

    const orderFilterForReceipts = invoiceNumRaw
      ? {
          OR: [
            { orderId: normalizedOrderId ?? invoiceNumRaw },
            { receiptNumber: invoiceNumRaw },
          ],
        }
      : undefined;
    const orderFilterValue = normalizedOrderId ?? invoiceNumRaw ?? null;

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
      const key = [tx.orderId, meta.receiptId ?? 'na', tx.createdAt.toISOString()].join(
        '|',
      );
      let group = refundGroups.get(key);
      if (!group) {
        group = {
          opKey: `refund:${key}`,
          orderId: tx.orderId,
          receiptId: meta.receiptId,
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
      { receiptNumber: string | null; canceledAt: Date | null; receiptId: string | null }
    >();
    for (const receipt of receipts) {
      receiptMetaByOrder.set(receipt.orderId, {
        receiptNumber: receipt.receiptNumber ?? null,
        canceledAt: receipt.canceledAt ?? null,
        receiptId: receipt.id ?? null,
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
        total: null,
        redeemApplied: null,
        earnApplied: null,
        pointsRestored: group.pointsRestored ?? null,
        pointsRevoked: group.pointsRevoked ?? null,
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
        select: { orderId: true, receiptNumber: true, canceledAt: true, id: true },
      });
      for (const receipt of receiptsExtra) {
        if (!receipt.orderId) continue;
        receiptMetaByOrder.set(receipt.orderId, {
          receiptNumber: receipt.receiptNumber ?? null,
          canceledAt: receipt.canceledAt ?? null,
          receiptId: receipt.id ?? null,
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
      invoice_num: op.orderId,
      order_id: op.receiptId ?? op.orderId,
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
      canceledAt: op.canceledAt ? op.canceledAt.toISOString() : null,
      pointsDelta: op.netDelta,
    }));

    await this.logIntegrationSync(
      req,
      'GET /api/integrations/operations',
      'ok',
      {
        invoice_num: invoiceNumRaw,
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

    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      null,
      req.body,
    );
    const [balanceResp, baseRates, analytics] = await Promise.all([
      this.loyalty.balance(merchantId, merchantCustomer.id),
      this.loyalty.getBaseRatesForCustomer(merchantId, customer.id),
      this.loyalty.getCustomerAnalytics(merchantId, customer.id),
    ]);
    const earnPercent = baseRates?.earnPercent ?? 0;
    const redeemLimitPercent = baseRates?.redeemLimitPercent ?? 0;
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
        id_ext: merchantCustomer.externalId ?? null,
        name,
        phone,
        email,
        balance: balanceResp?.balance ?? 0,
        earnPercent,
        redeemLimitPercent,
        k_bonus: earnPercent,
        maxPayBonusK: redeemLimitPercent,
        b_date: analytics?.bDate ?? null,
        avgBill: analytics?.avgBill ?? 0,
        visitFrequency: analytics?.visitFrequency ?? 0,
        visitCount: analytics?.visitCount ?? 0,
        totalAmount: analytics?.totalAmount ?? 0,
      },
    };
  }

  @Post('client/migrate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async migrateClient(
    @Body() dto: IntegrationClientMigrationDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const raw = (req as any)?.body || {};
    const normalizeStr = (value: any) =>
      typeof value === 'string' && value.trim().length ? value.trim() : '';
    const externalId = normalizeStr(
      dto.externalClientId ||
        raw.client_id_ext ||
        raw.clientIdExt ||
        raw.clientExtId,
    );
    if (!externalId) {
      throw new BadRequestException('externalClientId required');
    }
    const merchantCustomerId =
      normalizeStr(
        dto.merchantCustomerId ||
          raw.merchantCustomerId ||
          raw.id_client ||
          raw.idClient,
      ) || null;
    const birthdayRaw =
      dto.birthday ??
      raw.birthday ??
      raw.b_date ??
      raw.birthDate ??
      null;
    const gender =
      dto.gender != null
        ? dto.gender
        : normalizeStr(raw.gender) || null;
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      null,
      req.body,
    );
    const result = await this.loyalty.migrateExternalClient({
      merchantId,
      externalId,
      merchantCustomerId,
      phone: dto.phone,
      email: dto.email,
      name: dto.name,
      birthday: birthdayRaw,
      gender,
    });
    const birthday =
      result.birthday instanceof Date
        ? result.birthday.toISOString()
        : result.birthday
          ? new Date(result.birthday).toISOString()
          : null;
    return {
      result: 'ok',
      client: {
        id_client: result.customerId,
        merchantCustomerId: result.merchantCustomerId,
        id_ext: result.externalId,
        name: result.name ?? null,
        phone: result.phone ?? null,
        email: result.email ?? null,
        b_date: birthday,
        balance: result.balance ?? 0,
      },
      created: result.created || undefined,
      updated: result.updated || undefined,
    };
  }

  @Post('calculate/action')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async calculateAction(
    @Body() dto: IntegrationCalculateActionDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const items = this.normalizeItems(dto.items);
    if (!items.length) {
      throw new BadRequestException('items required');
    }
    const outletId =
      typeof dto.outletId === 'string' && dto.outletId.trim()
        ? dto.outletId.trim()
        : null;
    if (outletId) {
      await this.ensureOutletContext(merchantId, outletId);
    }
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      outletId,
      req.body,
    );
    const result = await this.loyalty.calculateAction({
      merchantId,
      items,
    });
    await this.logIntegrationSync(
      req,
      'POST /api/integrations/calculate/action',
      'ok',
      { items: items.length, outletId },
    );
    return result;
  }

  @Post('calculate/bonus')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  async calculateBonusPreview(
    @Body() dto: IntegrationCalculateBonusDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId || (req as any).merchantId || '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const items = this.normalizeItems(dto.items);
    if (!items.length) {
      throw new BadRequestException('items required');
    }
    const { customer, merchantCustomer, userToken } =
      await this.resolveCustomerContext(merchantId, dto);
    const outletId =
      typeof dto.outletId === 'string' && dto.outletId.trim()
        ? dto.outletId.trim()
        : null;
    if (outletId) {
      await this.ensureOutletContext(merchantId, outletId);
    }
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      outletId,
      req.body,
    );
    const operationDate = this.parseOperationDate(dto.operationDate ?? null);
    const preview = await this.loyalty.calculateBonusPreview({
      merchantId,
      merchantCustomerId: merchantCustomer.id,
      customerId: customer.id,
      userToken: userToken ?? merchantCustomer.id,
      outletId: outletId ?? undefined,
      operationDate,
      items,
    });
    await this.logIntegrationSync(
      req,
      'POST /api/integrations/calculate/bonus',
      'ok',
      {
        items: items.length,
        balance: preview.balance ?? undefined,
        outletId,
      },
    );
    return preview;
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
    const invoiceNum = (dto.invoice_num || '').trim();
    if (!invoiceNum) throw new BadRequestException('invoice_num required');
    const { customer, merchantCustomer, userToken } =
      await this.resolveCustomerContext(merchantId, dto);
    const sanitizedTotal = this.sanitizeAmount(dto.total);
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

    const paidBonus =
      dto.paid_bonus != null ? this.sanitizeAmount(dto.paid_bonus) : null;
    const bonusValue =
      dto.bonus_value != null ? this.sanitizeAmount(dto.bonus_value) : null;
    const redeemQuote = await this.loyalty.quote(
      {
        mode: Mode.REDEEM,
        merchantId,
        userToken: userToken ?? merchantCustomer.id,
        orderId: invoiceNum,
        total: sanitizedTotal,
        outletId: effectiveOutletId ?? undefined,
        deviceId: deviceCode ?? undefined,
        staffId: undefined,
        customerId: customer.id,
        positions: items as any,
      },
      undefined,
      { dryRun: true },
    );
    const earnQuote = await this.loyalty.quote(
      {
        mode: Mode.EARN,
        merchantId,
        userToken: userToken ?? merchantCustomer.id,
        orderId: invoiceNum,
        total: sanitizedTotal,
        outletId: effectiveOutletId ?? undefined,
        deviceId: deviceCode ?? undefined,
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
      typeof (redeemQuote as any)?.discountToApply === 'number'
        ? (redeemQuote as any).discountToApply
        : 0;
    const earnFromRedeem =
      typeof (redeemQuote as any)?.postEarnPoints === 'number'
        ? (redeemQuote as any).postEarnPoints
        : (redeemQuote as any)?.pointsToEarn ?? 0;
    const earnFromEarnQuote =
      typeof (earnQuote as any)?.pointsToEarn === 'number'
        ? (earnQuote as any).pointsToEarn
        : 0;
    const maxBonusValue = Math.max(earnFromRedeem, earnFromEarnQuote);
    return {
      invoice_num: invoiceNum,
      canRedeem: maxPaidBonus > 0 && (paidBonus == null || paidBonus > 0),
      canEarn: maxBonusValue > 0,
      maxPaidBonus,
      maxBonusValue,
      finalPayable:
        (redeemQuote as any)?.finalPayable ?? Math.max(0, sanitizedTotal),
      requested_paid_bonus: paidBonus ?? undefined,
      requested_bonus_value: bonusValue ?? undefined,
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
    const invoiceNum = (dto.invoice_num || '').trim();
    if (!invoiceNum) throw new BadRequestException('invoice_num required');
    const { customer, merchantCustomer, userToken } =
      await this.resolveCustomerContext(merchantId, dto);
    const operationDate = this.parseOperationDate(dto.operationDate ?? null);
    const sanitizedTotal = this.sanitizeAmount(dto.total);
    const items = this.normalizeItems(dto.items);
    const outletIdRaw =
      typeof dto.outletId === 'string' && dto.outletId.trim()
        ? dto.outletId.trim()
        : null;
    const deviceIdRaw =
      typeof dto.deviceId === 'string' && dto.deviceId.trim()
        ? dto.deviceId.trim()
        : null;
    const managerIdRaw =
      typeof dto.managerId === 'string' && dto.managerId.trim()
        ? dto.managerId.trim()
        : null;
    if (!outletIdRaw && !deviceIdRaw && !managerIdRaw) {
      throw new BadRequestException(
        'Укажите outletId или deviceId или managerId',
      );
    }
    const outletId = outletIdRaw
      ? await this.ensureOutletContext(merchantId, outletIdRaw)
      : null;
    const device = await this.ensureDeviceContext(
      merchantId,
      deviceIdRaw,
      outletId,
    );
    let effectiveOutletId = outletId ?? device?.outletId ?? null;
    const staff = await this.resolveStaffContext(
      merchantId,
      managerIdRaw,
      effectiveOutletId,
    );
    if (
      staff?.outletId &&
      effectiveOutletId &&
      staff.outletId !== effectiveOutletId
    ) {
      throw new BadRequestException(
        'Сотрудник не привязан к указанной торговой точке',
      );
    }
    if (
      device?.outletId &&
      staff?.outletId &&
      device.outletId !== staff.outletId
    ) {
      throw new BadRequestException(
        'Сотрудник и устройство привязаны к разным точкам',
      );
    }
    if (!effectiveOutletId) {
      effectiveOutletId = staff?.outletId ?? null;
    }
    const deviceCode = device?.code ?? deviceIdRaw ?? null;
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
    const result = await this.loyalty.processIntegrationBonus({
      merchantId,
      merchantCustomerId: merchantCustomer.id,
      customerId: customer.id,
      userToken: userToken ?? merchantCustomer.id,
      invoiceNum,
      total: sanitizedTotal,
      items,
      paidBonus,
      bonusValue,
      outletId: effectiveOutletId,
      deviceId: deviceCode,
      resolvedDeviceId: device?.id ?? null,
      staffId: staff?.id ?? null,
      operationDate,
      requestId: req.requestId,
    });
    const receipt = result.orderId
      ? await this.prisma.receipt.findFirst({
          where: {
            merchantId,
            id: result.orderId,
          },
          select: { id: true, outletId: true },
        })
      : null;
    const outletIdForResponse = receipt?.outletId ?? effectiveOutletId;
    const outlet = outletIdForResponse
      ? await this.prisma.outlet
          .findFirst({
            where: { id: outletIdForResponse, merchantId },
            select: { id: true, name: true },
          })
          .catch(() => null)
      : null;
    return {
      result: 'ok',
      invoice_num: invoiceNum,
      order_id: result.orderId ?? null,
      alreadyProcessed: result.alreadyProcessed || undefined,
      redeemApplied: result.redeemApplied ?? 0,
      earnApplied: result.earnApplied ?? 0,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter ?? null,
      outletId: outlet?.id ?? outletIdForResponse ?? null,
      outlet_name: outlet?.name ?? null,
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
    const invoiceNum =
      typeof dto.invoice_num === 'string' && dto.invoice_num.trim()
        ? dto.invoice_num.trim()
        : '';
    const orderIdRaw =
      typeof dto.order_id === 'string' && dto.order_id.trim()
        ? dto.order_id.trim()
        : '';
    if (!invoiceNum && !orderIdRaw) {
      throw new BadRequestException('invoice_num или order_id обязательны');
    }
    let receipt =
      orderIdRaw && orderIdRaw.length
        ? await this.prisma.receipt.findFirst({
            where: { id: orderIdRaw, merchantId },
            select: {
              id: true,
              orderId: true,
              outletId: true,
              customerId: true,
              merchantId: true,
            },
          })
        : null;
    if (!receipt && invoiceNum) {
      receipt = await this.prisma.receipt.findFirst({
        where: {
          merchantId,
          OR: [{ orderId: invoiceNum }, { receiptNumber: invoiceNum }],
        },
        select: {
          id: true,
          orderId: true,
          outletId: true,
          customerId: true,
          merchantId: true,
        },
      });
    }
    if (!receipt) {
      throw new BadRequestException('Receipt not found');
    }
    const device = await this.ensureDeviceContext(
      merchantId,
      dto.deviceId ?? null,
      dto.outletId ?? receipt.outletId ?? null,
    );
    const effectiveOutletId =
      dto.outletId ?? device?.outletId ?? receipt.outletId ?? null;
    await this.verifyBridgeSignatureIfRequired(
      req,
      merchantId,
      effectiveOutletId,
      req.body,
    );

    const result = await this.loyalty.refund({
      merchantId,
      invoiceNum: receipt.orderId,
      orderId: receipt.id,
      requestId: req.requestId,
      deviceId: dto.deviceId ?? null,
      operationDate,
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
      invoice_num: receipt.orderId,
      order_id: receipt.id,
      pointsRestored: result.pointsRestored,
      pointsRevoked: result.pointsRevoked,
      balanceAfter,
    };
  }
}
