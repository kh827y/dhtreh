import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LoyaltyService } from '../services/loyalty.service';
import { MerchantsService } from '../../merchants/merchants.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import {
  AllowInactiveSubscription,
  SubscriptionGuard,
} from '../../../core/guards/subscription.guard';
import {
  CashierCustomerResolveDto,
  CashierCustomerResolveRespDto,
  CashierOutletTransactionsRespDto,
  ErrorDto,
} from '../dto/dto';
import { LoyaltyControllerBase } from './loyalty.controller-base';
import type { CashierRequest } from './loyalty.controller-base';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyCashierController extends LoyaltyControllerBase {
  constructor(
    private readonly service: LoyaltyService,
    prisma: PrismaService,
    private readonly merchants: MerchantsService,
    cache: LookupCacheService,
  ) {
    super(prisma, cache);
  }

  // ===== Cashier Auth (public) =====

  @Post('cashier/activate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        login: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async cashierActivate(
    @Body() body: { merchantLogin?: string; activationCode?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const merchantLogin = String(body?.merchantLogin || '');
    const activationCode = String(body?.activationCode || '');
    const result = await this.merchants.activateCashierDeviceByCode(
      merchantLogin,
      activationCode,
      {
        ip: this.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
    );
    const ttlMs = 1000 * 60 * 60 * 24 * 180; // ~180 дней
    this.writeCashierDeviceCookie(res, result.token, ttlMs);
    return {
      ok: true,
      merchantId: result.merchantId,
      login: result.login,
      expiresAt: result.expiresAt,
    };
  }

  @Get('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        login: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async cashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.readCookie(req, 'cashier_device');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierDeviceSessionByToken(token);
    if (!session) {
      this.clearCashierDeviceCookie(res);
      return { active: false };
    }
    return {
      active: true,
      merchantId: session.merchantId,
      login: session.login,
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  @Delete('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const token = this.readCookie(req, 'cashier_device');
    if (token) {
      await this.merchants.revokeCashierDeviceSessionByToken(token);
    }
    this.clearCashierDeviceCookie(res);
    return { ok: true };
  }

  @Post('cashier/staff-access')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        staff: { type: 'object', additionalProperties: true },
        accesses: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierStaffAccess(
    @Body()
    body: {
      merchantLogin?: string;
      pinCode?: string;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const merchantLogin = String(body?.merchantLogin || '')
      .trim()
      .toLowerCase();
    const pinCode = String(body?.pinCode || '');
    if (!merchantLogin) throw new BadRequestException('merchantLogin required');
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.clearCashierDeviceCookie(res);
      throw new UnauthorizedException('Device not activated');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: merchantLogin },
      select: { id: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');
    if (merchant.id !== deviceSession.merchantId) {
      throw new UnauthorizedException('Device activated for another merchant');
    }

    return this.merchants.getStaffAccessByPin(
      deviceSession.merchantId,
      pinCode,
      deviceSession.id,
    );
  }

  @Post('cashier/session')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        sessionId: { type: 'string' },
        staff: { type: 'object', additionalProperties: true },
        outlet: { type: 'object', additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async startCashierSession(
    @Body()
    body: {
      merchantLogin?: string;
      pinCode?: string;
      rememberPin?: boolean;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const merchantLogin = String(body?.merchantLogin || '')
      .trim()
      .toLowerCase();
    const pinCode = String(body?.pinCode || '');
    const rememberPin = Boolean(body?.rememberPin);
    if (!merchantLogin) throw new BadRequestException('merchantLogin required');
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.clearCashierDeviceCookie(res);
      throw new UnauthorizedException('Device not activated');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: merchantLogin },
      select: { id: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');
    if (merchant.id !== deviceSession.merchantId) {
      throw new UnauthorizedException('Device activated for another merchant');
    }

    const result = await this.merchants.startCashierSessionByMerchantId(
      deviceSession.merchantId,
      pinCode,
      rememberPin,
      {
        ip: this.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
      deviceSession.id,
    );
    const ttlMs = rememberPin
      ? 1000 * 60 * 60 * 24 * 180 // ~180 дней
      : 1000 * 60 * 60 * 12; // 12 часов
    this.writeCashierSessionCookie(res, result.token, ttlMs);
    return {
      ok: true,
      merchantId: result.session.merchantId,
      sessionId: result.session.id,
      staff: result.session.staff,
      outlet: result.session.outlet,
      startedAt: result.session.startedAt,
      rememberPin: result.session.rememberPin,
    };
  }

  @Get('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        sessionId: { type: 'string', nullable: true },
        staff: { type: 'object', nullable: true, additionalProperties: true },
        outlet: { type: 'object', nullable: true, additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async currentCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.readCookie(req, 'cashier_session');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierSessionByToken(token);
    if (!session) {
      this.clearCashierSessionCookie(res);
      return { active: false };
    }
    return {
      active: true,
      merchantId: session.merchantId,
      sessionId: session.id,
      staff: session.staff,
      outlet: session.outlet,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      rememberPin: session.rememberPin,
    };
  }

  @Post('cashier/customer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: CashierCustomerResolveRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async resolveCashierCustomer(
    @Req() req: CashierRequest,
    @Body() dto: CashierCustomerResolveDto,
  ) {
    this.assertCashierOrigin(req);
    const merchantId =
      typeof dto?.merchantId === 'string' ? dto.merchantId.trim() : '';
    const userToken =
      typeof dto?.userToken === 'string' ? dto.userToken.trim() : '';
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!userToken) throw new BadRequestException('userToken required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const resolved = await this.resolveFromToken(userToken);
    const modeError = this.getQrModeError(resolved.kind, requireJwtForQuote);
    if (modeError) {
      throw new BadRequestException(modeError.message);
    }
    if (
      resolved.merchantAud &&
      resolved.merchantAud !== 'any' &&
      resolved.merchantAud !== merchantId
    ) {
      throw new BadRequestException('QR выписан для другого мерчанта');
    }
    const customer = await this.ensureCustomer(merchantId, resolved.customerId);
    const customerName =
      typeof customer.name === 'string' && customer.name.trim().length > 0
        ? customer.name.trim()
        : null;
    let balance: number | null = null;
    let redeemLimitBps: number | null = null;
    let minPaymentAmount: number | null = null;
    try {
      const balanceResp = await this.service.balance(merchantId, customer.id);
      balance =
        typeof balanceResp?.balance === 'number' ? balanceResp.balance : null;
    } catch {}
    try {
      const outletId =
        typeof req?.cashierSession?.outletId === 'string'
          ? req.cashierSession.outletId
          : null;
      const rates = await this.service.getBaseRatesForCustomer(
        merchantId,
        customer.id,
        { outletId },
      );
      redeemLimitBps =
        typeof rates?.redeemLimitBps === 'number'
          ? Math.max(0, Math.floor(Number(rates.redeemLimitBps)))
          : null;
      minPaymentAmount =
        typeof rates?.tierMinPayment === 'number'
          ? Math.max(0, Math.floor(Number(rates.tierMinPayment)))
          : null;
    } catch {}
    return {
      customerId: customer.id,
      name: customerName,
      balance,
      redeemLimitBps,
      minPaymentAmount,
    } satisfies CashierCustomerResolveRespDto;
  }

  @Delete('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCashierOrigin(req);
    const token = this.readCookie(req, 'cashier_session');
    if (token) {
      await this.merchants.endCashierSessionByToken(token, 'logout');
    }
    this.clearCashierSessionCookie(res);
    return { ok: true };
  }

  @Get('cashier/leaderboard')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        settings: { type: 'object', additionalProperties: true },
        period: { type: 'object', additionalProperties: true },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierLeaderboard(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletId?: string,
    @Query('limit') limit?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId =
      session?.merchantId ??
      (typeof merchantIdQuery === 'string' && merchantIdQuery.trim()
        ? merchantIdQuery.trim()
        : null);
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    const normalizedOutlet =
      typeof outletId === 'string' && outletId.trim()
        ? outletId.trim()
        : undefined;
    let parsedLimit: number | undefined;
    if (typeof limit === 'string' && limit.trim()) {
      const numeric = Number(limit);
      if (Number.isFinite(numeric) && numeric > 0) {
        parsedLimit = Math.floor(numeric);
      }
    }
    const result = await this.service.getStaffMotivationLeaderboard(
      merchantId,
      {
        outletId: normalizedOutlet ?? null,
        limit: parsedLimit,
      },
    );
    return {
      enabled: result.settings.enabled,
      settings: {
        enabled: result.settings.enabled,
        pointsForNewCustomer: result.settings.pointsForNewCustomer,
        pointsForExistingCustomer: result.settings.pointsForExistingCustomer,
        leaderboardPeriod: result.settings.leaderboardPeriod,
        customDays: result.settings.customDays,
        updatedAt: result.settings.updatedAt
          ? result.settings.updatedAt.toISOString()
          : null,
      },
      period: {
        kind: result.period.period,
        customDays: result.period.customDays,
        from: result.period.from.toISOString(),
        to: result.period.to.toISOString(),
        days: result.period.days,
        label: result.period.label,
      },
      items: result.items.map((item) => ({
        staffId: item.staffId,
        staffName: item.staffName,
        staffDisplayName: item.staffDisplayName,
        staffLogin: item.staffLogin,
        outletId: item.outletId,
        outletName: item.outletName,
        points: item.points,
      })),
    };
  }

  @Get('cashier/outlet-transactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { $ref: getSchemaPath(CashierOutletTransactionsRespDto) },
  })
  async cashierOutletTransactions(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletIdQuery?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId =
      session?.merchantId ??
      (typeof merchantIdQuery === 'string' && merchantIdQuery.trim()
        ? merchantIdQuery.trim()
        : null);
    const outletId =
      session?.outletId ??
      (typeof outletIdQuery === 'string' && outletIdQuery.trim()
        ? outletIdQuery.trim()
        : null);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!outletId) throw new BadRequestException('outletId required');
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100)
      : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    if (beforeStr && Number.isNaN(before?.getTime() ?? NaN)) {
      throw new BadRequestException('before is invalid');
    }
    return this.service.outletTransactions(merchantId, outletId, limit, before);
  }
}
