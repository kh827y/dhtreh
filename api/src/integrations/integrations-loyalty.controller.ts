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
  IntegrationCalculateActionDto,
  IntegrationCalculateBonusDto,
  IntegrationCodeRequestDto,
  IntegrationOperationDto,
  IntegrationOperationsQueryDto,
  IntegrationOperationsRespDto,
  IntegrationOutletDto,
  IntegrationOutletsRespDto,
  IntegrationRefundDto,
} from './dto';
import { looksLikeJwt, verifyQrToken } from '../loyalty/token.util';
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
  name?: string;
  qty: number;
  price: number;
  basePrice?: number;
  actionIds?: string[];
  actionNames?: string[];
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
      throw new BadRequestException('operation_date must be a valid date');
    }
    return parsed;
  }

  private sanitizeAmount(value: unknown, fallback = 0): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return num;
  }

  private normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const items = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return items.length ? items : undefined;
  }

  private formatDateOnly(value?: Date | null): string | null {
    if (!value) return null;
    const time = value.getTime();
    if (!Number.isFinite(time)) return null;
    return value.toISOString().slice(0, 10);
  }

  private sanitizeLimit(value?: number | null, fallback = 200) {
    const num = Number(value);
    const base = Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
    return Math.min(MAX_OPERATIONS_LIMIT, Math.max(1, base));
  }

  private parseDateTime(
    raw: string | undefined | null,
    field: string,
  ): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return parsed;
  }

  private normalizeItems(
    items?: unknown[],
    opts?: { includeBasePrice?: boolean },
  ): NormalizedItem[] {
    if (!Array.isArray(items)) return [];
    const includeBasePrice = opts?.includeBasePrice === true;
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
      const externalIdCandidate =
        (typeof item.id_product === 'string' && item.id_product.trim()) ||
        (typeof (item as any).idProduct === 'string' &&
          (item as any).idProduct.trim()) ||
        undefined;
      const productId =
        typeof item.productId === 'string' && item.productId.trim().length
          ? item.productId.trim()
          : undefined;
      const name =
        typeof item.name === 'string' && item.name.trim().length
          ? item.name.trim()
          : undefined;
      let basePrice: number | undefined;
      if (includeBasePrice) {
        const basePriceRaw = Number(item.base_price ?? item.basePrice ?? NaN);
        if (Number.isFinite(basePriceRaw) && basePriceRaw >= 0) {
          basePrice = basePriceRaw;
        }
      }
      const actionIds = this.normalizeStringArray(
        item.actions ??
          item.actions_id ??
          item.action_ids ??
          item.actionIds ??
          item.actionsIds,
      );
      const actionNames = this.normalizeStringArray(
        item.action_names ??
          item.actions_names ??
          item.actionNames ??
          item.actionsNames,
      );
      const normalized: NormalizedItem = {
        productId,
        externalId: externalIdCandidate,
        name,
        qty,
        price,
        actionIds,
        actionNames,
      };
      if (includeBasePrice && basePrice != null) {
        normalized.basePrice = basePrice;
      }
      list.push(normalized);
    }
    return list;
  }

  private normalizeActionItems(items?: unknown[]): NormalizedItem[] {
    if (!Array.isArray(items)) return [];
    const list: NormalizedItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, any>;
      const qty = this.sanitizeAmount(item.qty ?? item.quantity ?? 0);
      const price = this.sanitizeAmount(item.price ?? 0);
      if (qty <= 0) continue;
      if (price < 0) continue;
      const externalId =
        typeof item.id_product === 'string' && item.id_product.trim().length
          ? item.id_product.trim()
          : undefined;
      const name =
        typeof item.name === 'string' && item.name.trim().length
          ? item.name.trim()
          : undefined;
      list.push({
        externalId,
        name,
        qty,
        price,
      });
    }
    return list;
  }

  private normalizeShortCode(userToken: string): string | null {
    if (!userToken) return null;
    const compact = userToken.replace(/\s+/g, '');
    return /^\d{9}$/.test(compact) ? compact : null;
  }

  private async resolveFromToken(userToken: string) {
    if (looksLikeJwt(userToken)) {
      const secret = process.env.QR_JWT_SECRET || 'dev_change_me';
      try {
        const v = await verifyQrToken(secret, userToken);
        return { ...v, kind: 'jwt' as const };
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
    const shortCode = this.normalizeShortCode(userToken);
    if (shortCode) {
      const nonce = await this.prisma.qrNonce.findUnique({
        where: { jti: shortCode },
      });
      if (!nonce) {
        throw new BadRequestException('Bad QR token');
      }
      const expMs = nonce.expiresAt?.getTime?.() ?? NaN;
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        try {
          await this.prisma.qrNonce.delete({ where: { jti: shortCode } });
        } catch {}
        throw new BadRequestException(
          'JWTExpired: "exp" claim timestamp check failed',
        );
      }
      return {
        customerId: nonce.customerId,
        merchantAud: nonce.merchantId ?? undefined,
        jti: nonce.jti,
        iat: Math.floor(nonce.issuedAt.getTime() / 1000),
        exp: Math.floor(nonce.expiresAt.getTime() / 1000),
        kind: 'short' as const,
      };
    }
    const now = Math.floor(Date.now() / 1000);
    return {
      customerId: userToken,
      merchantAud: undefined,
      jti: `plain:${userToken}:${now}`,
      iat: now,
      exp: now + 3600,
      kind: 'plain' as const,
    } as const;
  }

  private normalizePhoneStrict(phone?: string | null): string {
    if (!phone) throw new BadRequestException('phone required');
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('8')) cleaned = '7' + cleaned.substring(1);
    if (cleaned.length === 10 && !cleaned.startsWith('7')) {
      cleaned = '7' + cleaned;
    }
    if (cleaned.length !== 11) throw new BadRequestException('invalid phone');
    return '+' + cleaned;
  }

  private async ensureCustomer(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.merchantId !== merchantId) {
      throw new BadRequestException('customer not found');
    }
    return customer;
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
      user_token?: string | null;
      id_client?: string | null;
      phone?: string | null;
    },
    options?: { allowPhone?: boolean },
  ): Promise<{ customer: any; userToken: string | null }> {
    const allowPhone = options?.allowPhone ?? false;
    const userToken =
      typeof payload.user_token === 'string' &&
      payload.user_token.trim().length
        ? payload.user_token.trim()
        : '';
    const idClient =
      typeof payload.id_client === 'string' && payload.id_client.trim().length
        ? payload.id_client.trim()
        : '';
    const phoneRaw =
      allowPhone &&
      typeof payload.phone === 'string' &&
      payload.phone.trim().length
        ? payload.phone.trim()
        : '';
    const phone = phoneRaw ? this.normalizePhoneStrict(phoneRaw) : '';

    if (!userToken && !idClient && !phone) {
      throw new BadRequestException(
        'user_token или id_client или phone обязательны',
      );
    }

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { requireJwtForQuote: true },
    });
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);

    if (!userToken && requireJwtForQuote) {
      throw new BadRequestException('JWT required for quote');
    }

    let tokenResolved: any = null;
    if (userToken) {
      tokenResolved = await this.resolveFromToken(userToken);
      if (requireJwtForQuote && tokenResolved.kind !== 'jwt') {
        throw new BadRequestException('JWT required for quote');
      }
      if (!requireJwtForQuote && tokenResolved.kind !== 'short') {
        throw new BadRequestException('Short QR code required');
      }
    }

    let explicitCustomer: any = null;
    if (idClient) {
      explicitCustomer = await this.ensureCustomer(merchantId, idClient);
    }

    let tokenCustomer: any = null;
    if (userToken && tokenResolved) {
      const resolved = tokenResolved;
      if (
        resolved.merchantAud &&
        resolved.merchantAud !== 'any' &&
        resolved.merchantAud !== merchantId
      ) {
        throw new BadRequestException('QR выписан для другого мерчанта');
      }
      tokenCustomer = await this.ensureCustomer(
        merchantId,
        resolved.customerId,
      );
    }

    let phoneCustomer: any = null;
    if (phone) {
      phoneCustomer = await this.prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone } },
      });
      if (!phoneCustomer) {
        throw new BadRequestException('customer not found');
      }
    }

    if (
      explicitCustomer &&
      tokenCustomer &&
      explicitCustomer.id !== tokenCustomer.id
    ) {
      throw new BadRequestException('user_token не совпадает с id_client');
    }
    if (
      explicitCustomer &&
      phoneCustomer &&
      explicitCustomer.id !== phoneCustomer.id
    ) {
      throw new BadRequestException('phone не совпадает с id_client');
    }
    if (tokenCustomer && phoneCustomer && tokenCustomer.id !== phoneCustomer.id) {
      throw new BadRequestException('phone не совпадает с user_token');
    }

    const customer = explicitCustomer ?? phoneCustomer ?? tokenCustomer;
    if (!customer) {
      throw new BadRequestException('customer not found');
    }
    return { customer, userToken: userToken || null };
  }

  private async buildClientPayload(merchantId: string, customer: any) {
    const [balanceResp, baseRates, analytics] = await Promise.all([
      this.loyalty.balance(merchantId, customer.id),
      this.loyalty.getBaseRatesForCustomer(merchantId, customer.id),
      this.loyalty.getCustomerAnalytics(merchantId, customer.id),
    ]);
    const earnPercent = baseRates?.earnPercent ?? 0;
    const redeemLimitPercent = baseRates?.redeemLimitPercent ?? 0;
    const name = customer.name?.trim() || null;
    const phone = customer.phone?.trim() || null;
    const email = customer.email?.trim() || null;
    const birthDate = this.formatDateOnly(
      customer.birthday ?? customer.profileBirthDate ?? null,
    );
    return {
      id_client: customer.id,
      id_ext: customer.externalId ?? null,
      name,
      phone,
      email,
      balance: balanceResp?.balance ?? 0,
      earn_percent: earnPercent,
      redeem_limit_percent: redeemLimitPercent,
      birth_date: birthDate,
      avg_bill: analytics?.avgBill ?? 0,
      visit_frequency: analytics?.visitFrequencyDays ?? null,
      visit_count: analytics?.visitCount ?? 0,
      total_amount: analytics?.totalAmount ?? 0,
      accruals_blocked: Boolean(customer.accrualsBlocked),
      redemptions_blocked: Boolean(customer.redemptionsBlocked),
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
      (Array.isArray(staff.accesses) ? staff.accesses : []).find(
        (a) => a?.outletId,
      )?.outletId ??
      null;
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
      typeof query.outlet_id === 'string' && query.outlet_id.trim()
        ? query.outlet_id.trim()
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
      outlet_id: outletId,
    });
    return {
      items: devices.map(
        (device): IntegrationDeviceDto => ({
          id: device.id,
          code: device.code,
          outlet_id: device.outletId,
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
      typeof query.outlet_id === 'string' && query.outlet_id.trim()
        ? query.outlet_id.trim()
        : null;
    const deviceRaw =
      typeof query.device_id === 'string' && query.device_id.trim()
        ? query.device_id.trim()
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
      const key = [
        tx.orderId,
        meta.receiptId ?? 'na',
        tx.createdAt.toISOString(),
      ].join('|');
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
      {
        receiptNumber: string | null;
        canceledAt: Date | null;
        receiptId: string | null;
      }
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
    );
    if (missingOrderIds.length) {
      const receiptsExtra = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: missingOrderIds } },
        select: {
          orderId: true,
          receiptNumber: true,
          canceledAt: true,
          id: true,
        },
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
    );
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
        where: { merchantId, customerId: { in: customerIds }, canceledAt: null },
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
      id_client: op.customerId,
      invoice_num: op.orderId,
      order_id: op.receiptId ?? op.orderId,
      receipt_num: op.receiptNumber,
      operation_date: op.operationDate.toISOString(),
      total: op.total,
      redeem_applied: op.redeemApplied,
      earn_applied: op.earnApplied,
      points_restored: op.pointsRestored,
      points_revoked: op.pointsRevoked,
      balance_before: op.balanceBefore ?? null,
      balance_after: op.balanceAfter ?? null,
      outlet_id: op.outletId,
      device_id: op.deviceId,
      device_code: op.deviceCode,
      canceled_at: op.canceledAt ? op.canceledAt.toISOString() : null,
      points_delta: op.netDelta,
    }));

    await this.logIntegrationSync(
      req,
      'GET /api/integrations/operations',
      'ok',
      {
        invoice_num: invoiceNumRaw,
        outlet_id: outletId,
        device_id: deviceRaw,
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
    const userToken = (dto.user_token || '').trim();
    if (!userToken) throw new BadRequestException('user_token required');

    const resolved = await this.resolveFromToken(userToken);
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { requireJwtForQuote: true },
    });
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    if (requireJwtForQuote && resolved.kind !== 'jwt') {
      throw new BadRequestException('JWT required for quote');
    }
    if (!requireJwtForQuote && resolved.kind !== 'short') {
      throw new BadRequestException('Short QR code required');
    }
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const customer = await this.ensureCustomer(merchantId, resolved.customerId);

    await this.verifyBridgeSignatureIfRequired(req, merchantId, null, req.body);
    return {
      type: 'bonus',
      client: await this.buildClientPayload(merchantId, customer),
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
    const customerId =
      typeof dto.id_client === 'string' && dto.id_client.trim()
        ? dto.id_client.trim()
        : '';
    const phoneRaw =
      typeof dto.phone === 'string' && dto.phone.trim().length
        ? dto.phone.trim()
        : '';
    const phone = phoneRaw ? this.normalizePhoneStrict(phoneRaw) : '';
    if (!customerId && !phone) {
      throw new BadRequestException('id_client или phone required');
    }
    let explicitCustomer: any = null;
    if (customerId) {
      explicitCustomer = await this.ensureCustomer(merchantId, customerId);
    }
    let phoneCustomer: any = null;
    if (phone) {
      phoneCustomer = await this.prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone } },
      });
      if (!phoneCustomer) {
        throw new BadRequestException('customer not found');
      }
    }
    if (
      explicitCustomer &&
      phoneCustomer &&
      explicitCustomer.id !== phoneCustomer.id
    ) {
      throw new BadRequestException('phone не совпадает с id_client');
    }
    const resolvedCustomer = explicitCustomer ?? phoneCustomer;
    if (!resolvedCustomer) {
      throw new BadRequestException('customer not found');
    }
    const items = this.normalizeActionItems(dto.items);
    if (!items.length) {
      throw new BadRequestException('items required');
    }
    const outletId =
      typeof dto.outlet_id === 'string' && dto.outlet_id.trim()
        ? dto.outlet_id.trim()
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
      customerId: resolvedCustomer.id,
    });
    await this.logIntegrationSync(
      req,
      'POST /api/integrations/calculate/action',
      'ok',
      { items: items.length, outlet_id: outletId },
    );
    return { status: 'ok', ...result };
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
    const total = this.sanitizeAmount(dto.total);
    if (!items.length && (total == null || total <= 0)) {
      throw new BadRequestException('items или total обязательны');
    }
    const paidBonus =
      dto.paid_bonus != null ? this.sanitizeAmount(dto.paid_bonus) : null;
    const { customer, userToken } = await this.resolveCustomerContext(
      merchantId,
      dto,
      { allowPhone: true },
    );
    const outletId =
      typeof dto.outlet_id === 'string' && dto.outlet_id.trim()
        ? dto.outlet_id.trim()
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
    const preview = await this.loyalty.calculateBonusPreview({
      merchantId,
      customerId: customer.id,
      userToken: userToken ?? customer.id,
      outletId: outletId ?? undefined,
      items,
      total,
      paidBonus,
    });
    await this.logIntegrationSync(
      req,
      'POST /api/integrations/calculate/bonus',
      'ok',
      {
        items: items.length,
        outlet_id: outletId,
      },
    );
    return { status: 'ok', ...preview };
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
    const invoiceNum = (dto.invoice_num || '').trim() || null;
    const idempotencyKey = (dto.idempotency_key || '').trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency_key required');
    }
    const { customer, userToken } = await this.resolveCustomerContext(
      merchantId,
      dto,
    );
    const operationDate = this.parseOperationDate(dto.operation_date ?? null);
    const sanitizedTotal = this.sanitizeAmount(dto.total);
    const items = this.normalizeItems(dto.items, { includeBasePrice: true });
    const outletIdRaw =
      typeof dto.outlet_id === 'string' && dto.outlet_id.trim()
        ? dto.outlet_id.trim()
        : null;
    const deviceIdRaw =
      typeof dto.device_id === 'string' && dto.device_id.trim()
        ? dto.device_id.trim()
        : null;
    const managerIdRaw =
      typeof dto.manager_id === 'string' && dto.manager_id.trim()
        ? dto.manager_id.trim()
        : null;
    if (!outletIdRaw && !deviceIdRaw && !managerIdRaw) {
      throw new BadRequestException(
        'Укажите outlet_id или device_id или manager_id',
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
      customerId: customer.id,
      userToken: userToken ?? customer.id,
      invoiceNum,
      idempotencyKey,
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
    await this.logIntegrationSync(req, 'POST /api/integrations/bonus', 'ok', {
      invoice_num: result.invoiceNum ?? invoiceNum ?? null,
      order_id: result.orderId ?? null,
      idempotency_key: idempotencyKey,
      outlet_id: effectiveOutletId,
      device_id: deviceCode,
    });
    return {
      result: 'ok',
      invoice_num: result.invoiceNum ?? invoiceNum ?? null,
      order_id: result.orderId ?? null,
      redeem_applied: result.redeemApplied ?? 0,
      earn_applied: result.earnApplied ?? 0,
      client: await this.buildClientPayload(merchantId, customer),
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
    const operationDate = this.parseOperationDate(dto.operation_date ?? null);
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
      dto.device_id ?? null,
      dto.outlet_id ?? receipt.outletId ?? null,
    );
    const effectiveOutletId =
      dto.outlet_id ?? device?.outletId ?? receipt.outletId ?? null;
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
      deviceId: dto.device_id ?? null,
      operationDate,
    });
    const balanceAfter =
      result.customerId && result.customerId.length
        ? (await this.loyalty.balance(merchantId, result.customerId)).balance
        : null;
    await this.logIntegrationSync(req, 'POST /api/integrations/refund', 'ok', {
      invoice_num: receipt.orderId,
      order_id: receipt.id,
      outlet_id: effectiveOutletId,
      device_id: dto.device_id ?? null,
    });
    return {
      result: 'ok',
      invoice_num: receipt.orderId,
      order_id: receipt.id,
      points_restored: result.pointsRestored,
      points_revoked: result.pointsRevoked,
      balance_after: balanceAfter,
    };
  }
}
