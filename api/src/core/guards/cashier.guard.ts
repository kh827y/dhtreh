import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import {
  readTelegramInitDataFromHeader,
  resolveTelegramAuthContext,
  type TelegramAuthContext,
} from '../../modules/loyalty/telegram-auth.helper';

type RequestLike = {
  method?: string;
  originalUrl?: string;
  baseUrl?: string;
  path?: string;
  route?: { path?: string };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  teleauth?: TelegramAuthContext;
  cashierSession?: {
    id: string;
    merchantId: string;
    staffId: string;
    outletId: string | null;
  } | null;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function getHeader(req: RequestLike, name: string): string | null {
  const value = req.headers?.[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length) return value[0] || null;
  return null;
}

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  private readonly telegramProtectedPaths: Array<string | { prefix: string }> =
    [
      '/loyalty/profile',
      '/loyalty/profile/phone-status',
      '/loyalty/bootstrap',
      '/loyalty/consent',
      '/loyalty/promotions',
      '/loyalty/promotions/claim',
      '/loyalty/promocodes/apply',
      '/loyalty/reviews',
      '/loyalty/reviews/dismiss',
      '/loyalty/qr',
      '/loyalty/transactions',
      { prefix: '/loyalty/balance/' },
      { prefix: '/loyalty/outlets/' },
      { prefix: '/loyalty/staff/' },
    ];

  private requiresTelegramCustomer(path: string): boolean {
    return this.telegramProtectedPaths.some((entry) => {
      if (typeof entry === 'string') {
        return path === entry;
      }
      return path.startsWith(entry.prefix);
    });
  }

  private extractCustomerId(req: RequestLike): string | null {
    const body = toRecord(req.body);
    const params = toRecord(req.params);
    const query = toRecord(req.query);
    const sources = [body?.customerId, params?.customerId, query?.customerId];
    for (const source of sources) {
      const value = asString(source);
      if (value) return value;
    }
    return null;
  }

  private async ensureTelegramContextForRequest(
    req: RequestLike,
    merchantIdHint?: string,
    tokenHint?: string | null,
  ): Promise<TelegramAuthContext | null> {
    try {
      const initData = readTelegramInitDataFromHeader(req);
      if (!initData) return null;
      const body = toRecord(req.body);
      const params = toRecord(req.params);
      const query = toRecord(req.query);
      const merchantId =
        merchantIdHint ||
        asString(body?.merchantId) ||
        asString(query?.merchantId) ||
        asString(params?.merchantId) ||
        null;
      if (!merchantId) return null;
      const ctx = await resolveTelegramAuthContext(
        this.prisma,
        merchantId,
        initData,
        tokenHint,
      );
      if (ctx) {
        req.teleauth = ctx;
      }
      return ctx;
    } catch {
      return null;
    }
  }

  private normalizePath(path: string): string {
    if (!path) return '';
    return path.startsWith('/') ? path : `/${path}`;
  }

  private readCookie(req: RequestLike, name: string): string | null {
    const header = getHeader(req, 'cookie');
    if (!header || typeof header !== 'string') return null;
    const parts = header.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.split('=');
      if (!rawKey) continue;
      const key = rawKey.trim();
      if (key === name) {
        const value = rest.join('=').trim();
        return decodeURIComponent(value || '');
      }
    }
    return null;
  }

  private async resolveCashierSession(
    req: RequestLike,
    merchantIdHint?: string,
  ): Promise<{
    id: string;
    merchantId: string;
    staffId: string;
    outletId: string | null;
  } | null> {
    const token = this.readCookie(req, 'cashier_session');
    if (!token) return null;
    const hash = crypto
      .createHash('sha256')
      .update(token, 'utf8')
      .digest('hex');
    const session = await this.prisma.cashierSession.findFirst({
      where: { tokenHash: hash },
      select: {
        id: true,
        merchantId: true,
        staffId: true,
        outletId: true,
        endedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        deviceSessionId: true,
        staff: { select: { status: true } },
      },
    });
    if (!session || session.endedAt) return null;
    if (merchantIdHint && merchantIdHint !== session.merchantId) return null;
    const now = new Date();
    if (session.expiresAt && session.expiresAt <= now) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: { endedAt: now, result: 'expired' },
      });
      return null;
    }
    if (
      session.staff &&
      session.staff.status &&
      session.staff.status !== 'ACTIVE'
    ) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: { endedAt: now, result: 'staff_inactive' },
      });
      return null;
    }
    if (session.deviceSessionId) {
      const deviceToken = this.readCookie(req, 'cashier_device');
      if (!deviceToken) return null;
      const deviceHash = crypto
        .createHash('sha256')
        .update(deviceToken, 'utf8')
        .digest('hex');
      const device = await this.prisma.cashierDeviceSession.findFirst({
        where: { tokenHash: deviceHash, revokedAt: null },
        select: { id: true, expiresAt: true },
      });
      if (!device || device.id !== session.deviceSessionId) return null;
      if (device.expiresAt && device.expiresAt <= now) {
        try {
          await this.prisma.cashierDeviceSession.update({
            where: { id: device.id },
            data: { revokedAt: now },
          });
        } catch {}
        return null;
      }
    }
    if (
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000
    ) {
      try {
        await this.prisma.cashierSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
      } catch {}
    }
    return {
      id: session.id,
      merchantId: session.merchantId,
      staffId: session.staffId,
      outletId: session.outletId ?? null,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const bodyRecord = toRecord(req.body);
    const body = bodyRecord ?? {};
    const method =
      typeof req.method === 'string' && req.method
        ? req.method.toUpperCase()
        : 'GET';
    const rawPath: string =
      req?.originalUrl ||
      (req?.baseUrl ? `${req.baseUrl}${req.path || ''}` : '') ||
      req?.path ||
      req?.route?.path ||
      '';
    const normalizedPath = this.normalizePath(
      String(rawPath || '').split('?')[0],
    );
    // whitelist публичных GET маршрутов (всегда разрешены): balance, settings, transactions, публичные списки
    const isPublicGet =
      method === 'GET' &&
      (normalizedPath.startsWith('/loyalty/settings/') ||
        normalizedPath.startsWith('/loyalty/miniapp-logo/'));
    const isAlwaysPublic =
      normalizedPath === '/loyalty/teleauth' ||
      normalizedPath === '/loyalty/cashier/activate' ||
      normalizedPath === '/loyalty/cashier/device' ||
      normalizedPath === '/loyalty/cashier/staff-access' ||
      normalizedPath === '/loyalty/cashier/session';
    if (isPublicGet || isAlwaysPublic) return true;

    const params = toRecord(req.params);
    const query = toRecord(req.query);
    let merchantIdFromRequest =
      asString(body?.merchantId) ||
      asString(params?.merchantId) ||
      asString(query?.merchantId) ||
      undefined;

    let sessionContext: {
      id: string;
      merchantId: string;
      staffId: string;
      outletId: string | null;
    } | null = null;
    try {
      sessionContext = await this.resolveCashierSession(
        req,
        merchantIdFromRequest,
      );
    } catch {
      sessionContext = null;
    }
    if (!merchantIdFromRequest && sessionContext) {
      merchantIdFromRequest = sessionContext.merchantId;
    }

    let merchantSettings: { telegramBotToken?: string | null } | null = null;
    if (merchantIdFromRequest) {
      try {
        merchantSettings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId: merchantIdFromRequest },
        });
      } catch {}
    }

    const teleauthContext = await this.ensureTelegramContextForRequest(
      req,
      merchantIdFromRequest,
      merchantSettings?.telegramBotToken ?? null,
    );
    if (!merchantIdFromRequest && teleauthContext) {
      merchantIdFromRequest = teleauthContext.merchantId;
    }
    const requiresTelegramCustomer =
      this.requiresTelegramCustomer(normalizedPath);

    const qrWithInitData =
      normalizedPath === '/loyalty/qr' &&
      Boolean(asString(body?.merchantId)) &&
      Boolean(asString(body?.initData));
    if (qrWithInitData) return true;

    if (requiresTelegramCustomer) {
      if (!teleauthContext) return false;
      const requestedCustomerId = this.extractCustomerId(req);
      if (
        requestedCustomerId &&
        requestedCustomerId !== teleauthContext.customerId
      ) {
        return false;
      }
      return true;
    }

    if (sessionContext) {
      const requestedOutletIdRaw =
        asString(body?.outletId) ||
        asString(params?.outletId) ||
        asString(query?.outletId) ||
        undefined;
      const requestedOutletId =
        requestedOutletIdRaw != null ? String(requestedOutletIdRaw) : undefined;
      if (
        sessionContext.outletId &&
        requestedOutletId &&
        requestedOutletId !== sessionContext.outletId
      ) {
        return false;
      }
      if (bodyRecord && bodyRecord.staffId != null) {
        const staffIdValue = asString(bodyRecord.staffId);
        if (!staffIdValue || staffIdValue !== sessionContext.staffId) {
          return false;
        }
      }
      if (bodyRecord) {
        bodyRecord.merchantId = sessionContext.merchantId;
        bodyRecord.staffId = sessionContext.staffId;
        if (sessionContext.outletId) {
          bodyRecord.outletId = sessionContext.outletId;
        }
      }
      req.cashierSession = sessionContext;
      return true;
    }

    return false;
  }
}
