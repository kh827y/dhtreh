import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { LoyaltyService } from '../services/loyalty.service';
import { MerchantsService } from '../../merchants/merchants.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import type {
  CashierActivateDto,
  CashierSessionStartDto,
  CashierStaffAccessDto,
  CashierCustomerResolveDto,
  CashierCustomerResolveRespDto,
} from '../dto/dto';
import type { CashierRequest } from '../controllers/loyalty-controller.types';
import {
  optionalTrimmed,
  parseBoundedInt,
  parseOptionalDate,
  parseOptionalPositiveInt,
  readTrimmed,
  requireLowerTrimmed,
  requireTrimmed,
} from './loyalty-input.util';

@Injectable()
export class LoyaltyCashierUseCase {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly cache: LookupCacheService,
    private readonly support: LoyaltyControllerSupportService,
  ) {}

  async cashierActivate(body: CashierActivateDto, req: Request, res: Response) {
    const merchantLogin = readTrimmed(body?.merchantLogin);
    const activationCode = readTrimmed(body?.activationCode);
    const result = await this.merchants.activateCashierDeviceByCode(
      merchantLogin,
      activationCode,
      {
        ip: this.support.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
    );
    const ttlMs = 1000 * 60 * 60 * 24 * 180; // ~180 дней
    this.support.writeCashierDeviceCookie(res, result.token, ttlMs);
    return {
      ok: true,
      merchantId: result.merchantId,
      login: result.login,
      expiresAt: result.expiresAt,
    };
  }

  async cashierDevice(req: Request, res: Response) {
    const token = this.support.readCookie(req, 'cashier_device');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierDeviceSessionByToken(token);
    if (!session) {
      this.support.clearCashierDeviceCookie(res);
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

  async logoutCashierDevice(req: Request, res: Response) {
    this.support.assertCashierOrigin(req);
    const token = this.support.readCookie(req, 'cashier_device');
    if (token) {
      await this.merchants.revokeCashierDeviceSessionByToken(token);
    }
    this.support.clearCashierDeviceCookie(res);
    return { ok: true };
  }

  async cashierStaffAccess(
    body: CashierStaffAccessDto,
    req: Request,
    res: Response,
  ) {
    this.support.assertCashierOrigin(req);
    const merchantLogin = requireLowerTrimmed(
      body?.merchantLogin,
      'merchantLogin required',
    );
    const pinCode = readTrimmed(body?.pinCode);
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.support.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.support.clearCashierDeviceCookie(res);
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

  async startCashierSession(
    body: CashierSessionStartDto,
    req: Request,
    res: Response,
  ) {
    this.support.assertCashierOrigin(req);
    const merchantLogin = requireLowerTrimmed(
      body?.merchantLogin,
      'merchantLogin required',
    );
    const pinCode = readTrimmed(body?.pinCode);
    const rememberPin = Boolean(body?.rememberPin);
    if (!pinCode || pinCode.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const deviceToken = this.support.readCookie(req, 'cashier_device');
    if (!deviceToken) {
      throw new UnauthorizedException('Device not activated');
    }
    const deviceSession =
      await this.merchants.getCashierDeviceSessionByToken(deviceToken);
    if (!deviceSession) {
      this.support.clearCashierDeviceCookie(res);
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
        ip: this.support.resolveClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      },
      deviceSession.id,
    );
    const ttlMs = rememberPin
      ? 1000 * 60 * 60 * 24 * 180 // ~180 дней
      : 1000 * 60 * 60 * 12; // 12 часов
    this.support.writeCashierSessionCookie(res, result.token, ttlMs);
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

  async currentCashierSession(req: Request, res: Response) {
    const token = this.support.readCookie(req, 'cashier_session');
    if (!token) return { active: false };
    const session = await this.merchants.getCashierSessionByToken(token);
    if (!session) {
      this.support.clearCashierSessionCookie(res);
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

  async resolveCashierCustomer(
    req: CashierRequest,
    dto: CashierCustomerResolveDto,
  ) {
    this.support.assertCashierOrigin(req);
    const merchantId = requireTrimmed(dto?.merchantId, 'merchantId required');
    const userToken = requireTrimmed(dto?.userToken, 'userToken required');
    const settings = await this.cache.getMerchantSettings(merchantId);
    const requireJwtForQuote = Boolean(settings?.requireJwtForQuote);
    const resolved = await this.support.resolveFromToken(userToken);
    const modeError = this.support.getQrModeError(
      resolved.kind,
      requireJwtForQuote,
    );
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
    const customer = await this.support.ensureCustomer(
      merchantId,
      resolved.customerId,
    );
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
    } catch (err) {
      logIgnoredError(err, 'LoyaltyCashierUseCase balance', undefined, 'debug');
    }
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
    } catch (err) {
      logIgnoredError(err, 'LoyaltyCashierUseCase rates', undefined, 'debug');
    }
    return {
      customerId: customer.id,
      name: customerName,
      balance,
      redeemLimitBps,
      minPaymentAmount,
    } satisfies CashierCustomerResolveRespDto;
  }

  async logoutCashierSession(req: Request, res: Response) {
    this.support.assertCashierOrigin(req);
    const token = this.support.readCookie(req, 'cashier_session');
    if (token) {
      await this.merchants.endCashierSessionByToken(token, 'logout');
    }
    this.support.clearCashierSessionCookie(res);
    return { ok: true };
  }

  async cashierLeaderboard(
    req: CashierRequest,
    merchantIdQuery?: string,
    outletId?: string,
    limit?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId = session?.merchantId ?? optionalTrimmed(merchantIdQuery);
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    const normalizedOutlet = optionalTrimmed(outletId) ?? undefined;
    const parsedLimit = parseOptionalPositiveInt(limit);
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

  async cashierOutletTransactions(
    req: CashierRequest,
    merchantIdQuery?: string,
    outletIdQuery?: string,
    limitStr?: string,
    beforeStr?: string,
  ) {
    const session = req?.cashierSession ?? null;
    const merchantId = session?.merchantId ?? optionalTrimmed(merchantIdQuery);
    const outletId = session?.outletId ?? optionalTrimmed(outletIdQuery);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!outletId) throw new BadRequestException('outletId required');
    const limit = parseBoundedInt(limitStr, 20, 1, 100);
    const before = parseOptionalDate(beforeStr, 'before is invalid');
    return this.service.outletTransactions(merchantId, outletId, limit, before);
  }
}
