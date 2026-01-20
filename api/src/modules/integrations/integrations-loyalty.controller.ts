import {
  BadRequestException,
  ConflictException,
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  Prisma,
  type Customer,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { LookupCacheService } from '../../core/cache/lookup-cache.service';
import { LoyaltyService } from '../loyalty/services/loyalty.service';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { ApiTags } from '@nestjs/swagger';
import {
  IntegrationBonusDto,
  IntegrationCalculateActionDto,
  IntegrationCalculateBonusDto,
  IntegrationCodeRequestDto,
  IntegrationRefundDto,
} from './dto';
import {
  looksLikeJwt,
  verifyQrToken,
  type VerifiedQr,
} from '../loyalty/utils/token.util';
import { normalizeDeviceCode } from '../../shared/devices/device.util';

type IntegrationRequest = Request & {
  integrationMerchantId?: string;
  integrationId?: string;
  requestId?: string;
  merchantId?: string;
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

type ResolvedToken = VerifiedQr & { kind: 'jwt' | 'short' | 'plain' };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error);
  }
  return Object.prototype.toString.call(error) as string;
};

@Controller('api/integrations')
@UseGuards(IntegrationApiKeyGuard)
@ApiTags('integrations')
export class IntegrationsLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
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

  private normalizeItems(
    items?: unknown[],
    opts?: { includeBasePrice?: boolean },
  ): NormalizedItem[] {
    if (!Array.isArray(items)) return [];
    const includeBasePrice = opts?.includeBasePrice === true;
    const list: NormalizedItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const qty = this.sanitizeAmount(
        item.qty ?? item.quantity ?? item.count ?? 0,
      );
      const price = this.sanitizeAmount(
        item.price ?? item.cost ?? item.amount ?? 0,
      );
      if (qty <= 0) continue;
      if (price < 0) continue;
      const externalIdCandidate =
        readString(item.id_product) ?? readString(item.idProduct) ?? undefined;
      const productId = readString(item.productId) ?? undefined;
      const name = readString(item.name) ?? undefined;
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
      const item = raw as Record<string, unknown>;
      const qty = this.sanitizeAmount(item.qty ?? item.quantity ?? 0);
      const price = this.sanitizeAmount(item.price ?? 0);
      if (qty <= 0) continue;
      if (price < 0) continue;
      const externalId = readString(item.id_product) ?? undefined;
      const name = readString(item.name) ?? undefined;
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
      const envSecret = process.env.QR_JWT_SECRET || '';
      if (
        !envSecret ||
        (process.env.NODE_ENV === 'production' && envSecret === 'dev_change_me')
      ) {
        throw new BadRequestException('QR_JWT_SECRET not configured');
      }
      const secret = envSecret;
      try {
        const v = await verifyQrToken(secret, userToken);
        return { ...v, kind: 'jwt' as const };
      } catch (error: unknown) {
        const code = isRecord(error)
          ? (readString(error.code) ?? readString(error.name))
          : null;
        const msg = readErrorMessage(error);
        if (
          code === 'ERR_JWT_EXPIRED' ||
          /JWTExpired/i.test(code ?? '') ||
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
    const outlet = await this.cache.getOutlet(merchantId, outletId);
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
  ): Promise<{ customer: Customer; userToken: string | null }> {
    const allowPhone = options?.allowPhone ?? false;
    const userToken =
      typeof payload.user_token === 'string' && payload.user_token.trim().length
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

    const settings = await this.cache.getMerchantSettings(merchantId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);

    if (!userToken && requireJwtForQuote) {
      throw new BadRequestException('JWT required for quote');
    }

    let tokenResolved: ResolvedToken | null = null;
    if (userToken) {
      tokenResolved = await this.resolveFromToken(userToken);
      if (requireJwtForQuote && tokenResolved.kind !== 'jwt') {
        throw new BadRequestException('JWT required for quote');
      }
      if (!requireJwtForQuote && tokenResolved.kind !== 'short') {
        throw new BadRequestException('Short QR code required');
      }
    }

    let explicitCustomer: Customer | null = null;
    if (idClient) {
      explicitCustomer = await this.ensureCustomer(merchantId, idClient);
    }

    let tokenCustomer: Customer | null = null;
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

    let phoneCustomer: Customer | null = null;
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
    if (
      tokenCustomer &&
      phoneCustomer &&
      tokenCustomer.id !== phoneCustomer.id
    ) {
      throw new BadRequestException('phone не совпадает с user_token');
    }

    const customer = explicitCustomer ?? phoneCustomer ?? tokenCustomer;
    if (!customer) {
      throw new BadRequestException('customer not found');
    }
    return { customer, userToken: userToken || null };
  }

  private async buildClientPayload(merchantId: string, customer: Customer) {
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
    const staff = await this.cache.getStaff(merchantId, staffId);
    if (!staff) {
      throw new BadRequestException('Сотрудник не найден или отключён');
    }
    const outletFromStaff =
      staff.allowedOutletId ??
      (Array.isArray(staff.accessOutletIds) ? staff.accessOutletIds : []).find(
        (id) => id,
      ) ??
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

  private async logIntegrationSync(
    req: IntegrationRequest,
    endpoint: string,
    status: 'ok' | 'error',
    payload?: Prisma.InputJsonValue | null,
    error?: unknown,
  ) {
    try {
      const errorMessage = error ? readErrorMessage(error) : null;
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
          error: errorMessage,
        },
      });
    } catch {}
  }

  @Post('code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async code(
    @Body() dto: IntegrationCodeRequestDto,
    @Req() req: IntegrationRequest,
  ) {
    const merchantId = String(
      req.integrationMerchantId ?? req.merchantId ?? '',
    ).trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const userToken = (dto.user_token || '').trim();
    if (!userToken) throw new BadRequestException('user_token required');

    const resolved = await this.resolveFromToken(userToken);
    const settings = await this.cache.getMerchantSettings(merchantId);
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
      req.integrationMerchantId ?? req.merchantId ?? '',
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
    let explicitCustomer: Customer | null = null;
    if (customerId) {
      explicitCustomer = await this.ensureCustomer(merchantId, customerId);
    }
    let phoneCustomer: Customer | null = null;
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
      req.integrationMerchantId ?? req.merchantId ?? '',
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
      req.integrationMerchantId ?? req.merchantId ?? '',
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
      req.integrationMerchantId ?? req.merchantId ?? '',
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
      const matches = await this.prisma.receipt.findMany({
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
        take: 2,
      });
      if (matches.length > 1) {
        throw new ConflictException(
          'Ambiguous invoice_num/receiptNumber, provide order_id',
        );
      }
      receipt = matches[0] ?? null;
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
