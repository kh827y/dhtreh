import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';
import { verifyBridgeSignature } from '../loyalty/bridge.util';
import {
  readTelegramInitDataFromHeader,
  resolveTelegramAuthContext,
  type TelegramAuthContext,
} from '../loyalty/telegram-auth.helper';

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  private readonly telegramProtectedPaths: Array<string | { prefix: string }> =
    [
      '/loyalty/profile',
      '/loyalty/profile/phone-status',
      '/loyalty/consent',
      '/loyalty/promotions',
      '/loyalty/promotions/claim',
      '/loyalty/promocodes/apply',
      '/loyalty/reviews',
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

  private extractMerchantCustomerId(req: any): string | null {
    const sources = [
      req?.body?.merchantCustomerId,
      req?.params?.merchantCustomerId,
      req?.query?.merchantCustomerId,
      req?.body?.customerId,
      req?.params?.customerId,
    ];
    for (const source of sources) {
      if (typeof source === 'string' && source.trim()) {
        return source.trim();
      }
    }
    return null;
  }

  private async ensureTelegramContextForRequest(
    req: any,
    merchantIdHint?: string,
    tokenHint?: string | null,
  ): Promise<TelegramAuthContext | null> {
    try {
      const initData = readTelegramInitDataFromHeader(req);
      if (!initData) return null;
      const merchantId =
        merchantIdHint ||
        req?.body?.merchantId ||
        req?.query?.merchantId ||
        req?.params?.merchantId ||
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

  private readCookie(req: any, name: string): string | null {
    const header = req?.headers?.cookie;
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
    req: any,
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

  private async resolveOperationContext(
    normalizedPath: string,
    req: any,
    merchantIdHint?: string,
  ): Promise<{
    merchantId?: string;
    outletId?: string | null;
    payload?: string | null;
  }> {
    const body = req?.body || {};
    let merchantId: string | undefined = merchantIdHint || undefined;
    let outletId: string | null = null;
    let payload: string | null = null;
    let outletLocked = false;

    if (normalizedPath === '/loyalty/quote') {
      merchantId = merchantId || body?.merchantId;
      outletId = body?.outletId ?? null;
      if (merchantId) {
        payload = JSON.stringify({
          merchantId,
          mode: body?.mode,
          userToken: body?.userToken,
          orderId: body?.orderId,
          total: body?.total,
          eligibleTotal: body?.eligibleTotal,
          outletId: body?.outletId ?? undefined,
          staffId: body?.staffId ?? undefined,
        });
      }
    } else if (normalizedPath === '/loyalty/commit') {
      const holdId: string | undefined = body?.holdId;
      if (!holdId) {
        merchantId = merchantId || body?.merchantId;
        outletId = body?.outletId ?? null;
      } else {
        let hold: { merchantId: string; outletId: string | null } | null = null;
        try {
          hold = await this.prisma.hold.findUnique({
            where: { id: holdId },
            select: { merchantId: true, outletId: true },
          });
        } catch {}
        outletLocked = true;
        merchantId = merchantId || hold?.merchantId || body?.merchantId;
        outletId = hold?.outletId ?? null;
        if (merchantId && body?.orderId) {
          payload = JSON.stringify({
            merchantId,
            holdId,
            orderId: body.orderId,
            receiptNumber: body?.receiptNumber ?? undefined,
          });
        }
      }
    } else if (normalizedPath === '/loyalty/refund') {
      merchantId = merchantId || body?.merchantId;
      const hasTotals =
        body?.refundTotal !== undefined && body?.refundTotal !== null;
      if (merchantId && hasTotals) {
        let resolvedOrderId: string | null = null;
        if (typeof body?.orderId === 'string') {
          const trimmed = body.orderId.trim();
          if (trimmed) resolvedOrderId = trimmed;
        }
        const receiptNumber =
          typeof body?.receiptNumber === 'string' && body.receiptNumber
            ? String(body.receiptNumber).trim()
            : '';
        if (!resolvedOrderId && receiptNumber) {
          try {
            const receipt = await this.prisma.receipt.findFirst({
              where: { merchantId, receiptNumber },
              select: { orderId: true, outletId: true },
            });
            if (receipt?.orderId) {
              resolvedOrderId = receipt.orderId;
              outletId = receipt.outletId ?? null;
            }
          } catch {}
        }
        if (merchantId && !outletId && resolvedOrderId) {
          try {
            const receipt = await this.prisma.receipt.findUnique({
              where: {
                merchantId_orderId: { merchantId, orderId: resolvedOrderId },
              },
              select: { outletId: true },
            });
            outletId = receipt?.outletId ?? outletId ?? null;
          } catch {}
        }
        if (resolvedOrderId) {
          payload = JSON.stringify({
            merchantId,
            orderId: resolvedOrderId,
            refundTotal: body.refundTotal,
            refundEligibleTotal: body?.refundEligibleTotal ?? undefined,
          });
        }
      }
    } else if (normalizedPath === '/loyalty/cancel') {
      const holdId: string | undefined = body?.holdId;
      if (holdId) {
        let hold: { merchantId: string; outletId: string | null } | null = null;
        try {
          hold = await this.prisma.hold.findUnique({
            where: { id: holdId },
            select: { merchantId: true, outletId: true },
          });
        } catch {}
        outletLocked = true;
        merchantId = merchantId || hold?.merchantId || body?.merchantId;
        outletId = hold?.outletId ?? null;
        if (merchantId) {
          payload = JSON.stringify({ merchantId, holdId });
        }
      } else {
        merchantId = merchantId || body?.merchantId;
      }
    } else if (normalizedPath === '/loyalty/qr') {
      merchantId = merchantId || body?.merchantId;
      if (merchantId && body?.customerId) {
        payload = JSON.stringify({
          merchantId,
          customerId: body.customerId,
        });
      }
    }

    if (!outletLocked && outletId === null && body?.outletId !== undefined)
      outletId = body.outletId ?? null;

    return { merchantId, outletId, payload };
  }

  private async getBridgeSecrets(
    merchantId: string,
    outletId: string | null,
    settingsHint?: any,
  ): Promise<{ primary: string | null; secondary: string | null }> {
    let primary: string | null = null;
    let secondary: string | null = null;

    if (outletId) {
      try {
        const outlet = await this.prisma.outlet.findFirst({
          where: { id: outletId, merchantId },
          select: { bridgeSecret: true, bridgeSecretNext: true },
        });
        if (outlet) {
          primary = outlet.bridgeSecret ?? null;
          secondary = outlet.bridgeSecretNext ?? null;
        }
      } catch {}
    }

    let settings = settingsHint;
    if (!settings) {
      try {
        settings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId },
        });
      } catch {}
    }

    if (!primary && settings?.bridgeSecret) primary = settings.bridgeSecret;
    if (!secondary && settings?.bridgeSecretNext)
      secondary = settings.bridgeSecretNext;

    return { primary, secondary };
  }

  private verifyWithSecrets(
    sig: string,
    payload: string,
    primary: string | null,
    secondary: string | null,
  ): boolean {
    if (!sig || !payload) return false;
    if (primary && verifyBridgeSignature(sig, payload, primary)) return true;
    if (secondary && verifyBridgeSignature(sig, payload, secondary))
      return true;
    return false;
  }

  private async validateBridgeSignature(
    normalizedPath: string,
    req: any,
    merchantIdHint?: string,
    settingsHint?: any,
  ): Promise<{
    ok: boolean;
    context?: { merchantId?: string; outletId?: string | null };
  }> {
    const sig =
      (req?.headers?.['x-bridge-signature'] as string | undefined) || '';
    if (!sig) return { ok: false };

    const context = await this.resolveOperationContext(
      normalizedPath,
      req,
      merchantIdHint,
    );
    const merchantId = context.merchantId;
    const outletId = context.outletId ?? null;
    const payload = context.payload;

    if (!merchantId || !payload) return { ok: false, context };

    const { primary, secondary } = await this.getBridgeSecrets(
      merchantId,
      outletId,
      merchantIdHint && merchantIdHint === merchantId
        ? settingsHint
        : undefined,
    );

    if (!primary && !secondary) return { ok: false, context };

    return {
      ok: this.verifyWithSecrets(sig, payload, primary, secondary),
      context,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const body = req.body || {};
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string =
      req?.route?.path || req?.path || req?.originalUrl || '';
    const normalizedPath = this.normalizePath(path || '');
    const key = (req.headers['x-staff-key'] as string | undefined) || '';
    // whitelist публичных GET маршрутов (всегда разрешены): balance, settings, transactions, публичные списки
    const isPublicGet =
      method === 'GET' && path.startsWith('/loyalty/settings/');
    const isAlwaysPublic =
      path === '/loyalty/teleauth' ||
      path === '/loyalty/cashier/login' ||
      path === '/loyalty/cashier/staff-token' ||
      path === '/loyalty/cashier/staff-access' ||
      path === '/loyalty/cashier/session';
    if (isPublicGet || isAlwaysPublic) return true;

    let merchantIdFromRequest: string | undefined =
      body?.merchantId ||
      req?.params?.merchantId ||
      req?.query?.merchantId ||
      undefined;

    let sessionContext: {
      id: string;
      merchantId: string;
      staffId: string;
      outletId: string | null;
    } | null = null;
    if (!key) {
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
    }

    let requireStaffKey = false;
    let merchantSettings: any = null;
    if (merchantIdFromRequest) {
      try {
        merchantSettings = await this.prisma.merchantSettings.findUnique({
          where: { merchantId: merchantIdFromRequest },
        });
        requireStaffKey = Boolean(merchantSettings?.requireStaffKey);
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

    if (!key) {
      if (sessionContext) {
        const bodyIsObject = body && typeof body === 'object';
        const requestedOutletIdRaw =
          (bodyIsObject ? body?.outletId : undefined) ||
          req?.params?.outletId ||
          req?.query?.outletId ||
          undefined;
        const requestedOutletId =
          requestedOutletIdRaw != null
            ? String(requestedOutletIdRaw)
            : undefined;
        if (
          sessionContext.outletId &&
          requestedOutletId &&
          requestedOutletId !== sessionContext.outletId
        ) {
          return false;
        }
        if (
          bodyIsObject &&
          body?.staffId != null &&
          String(body.staffId) !== sessionContext.staffId
        ) {
          return false;
        }
        if (bodyIsObject) {
          body.merchantId = sessionContext.merchantId;
          body.staffId = sessionContext.staffId;
          if (sessionContext.outletId) {
            body.outletId = sessionContext.outletId;
          }
        }
        req.cashierSession = sessionContext;
        return true;
      }
      if (!requireStaffKey) {
        if (requiresTelegramCustomer && !teleauthContext) return false;
        if (requiresTelegramCustomer && teleauthContext) {
          const requestedMerchantCustomerId =
            this.extractMerchantCustomerId(req);
          if (
            requestedMerchantCustomerId &&
            requestedMerchantCustomerId !== teleauthContext.merchantCustomerId
          ) {
            return false;
          }
        }
        return true;
      }
      if (teleauthContext) return true;
      if (
        normalizedPath === '/loyalty/qr' &&
        typeof body?.merchantId === 'string' &&
        typeof body?.initData === 'string' &&
        body.initData.trim()
      ) {
        return true;
      }
      const { ok } = await this.validateBridgeSignature(
        normalizedPath,
        req,
        merchantIdFromRequest,
        merchantSettings,
      );
      if (ok) {
        return true;
      }
      return false;
    }
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    let merchantIdForStaff = merchantIdFromRequest;
    let contextForStaff:
      | { merchantId?: string; outletId?: string | null }
      | undefined;
    if (!merchantIdForStaff) {
      const resolved = await this.resolveOperationContext(
        normalizedPath,
        req,
        undefined,
      );
      contextForStaff = resolved;
      if (resolved.merchantId) merchantIdForStaff = resolved.merchantId;
    }
    const staff = await this.prisma.staff.findFirst({
      where: {
        merchantId: merchantIdForStaff,
        apiKeyHash: hash,
        status: 'ACTIVE',
      },
      include: {
        accesses: { where: { status: 'ACTIVE' }, select: { outletId: true } },
      },
    });
    if (!staff) return false;
    const requestedOutletIdRaw =
      body?.outletId ||
      req?.params?.outletId ||
      req?.query?.outletId ||
      undefined;
    let requestedOutletId =
      requestedOutletIdRaw != null ? String(requestedOutletIdRaw) : undefined;
    if (!contextForStaff) {
      contextForStaff = await this.resolveOperationContext(
        normalizedPath,
        req,
        merchantIdForStaff,
      );
    }
    if (contextForStaff?.outletId) {
      requestedOutletId = String(contextForStaff.outletId);
    }
    if (String(staff.role || '').toUpperCase() === 'CASHIER') {
      const allowedOutletId: string | undefined =
        staff.allowedOutletId || undefined;
      const outletAccesses: string[] = Array.isArray(staff.accesses)
        ? staff.accesses.map((acc: any) => acc?.outletId).filter(Boolean)
        : [];
      if (allowedOutletId) {
        if (!requestedOutletId) return false;
        if (allowedOutletId !== requestedOutletId) return false;
      } else if (outletAccesses.length > 0) {
        if (!requestedOutletId) return false;
        if (!outletAccesses.includes(requestedOutletId)) return false;
      }
    }
    return true;
  }
}
