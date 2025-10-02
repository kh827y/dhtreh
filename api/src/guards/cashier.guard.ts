import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';
import { verifyBridgeSignature } from '../loyalty/bridge.util';

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  private normalizePath(path: string): string {
    if (!path) return '';
    return path.startsWith('/') ? path : `/${path}`;
  }

  private async resolveOperationContext(
    normalizedPath: string,
    req: any,
    merchantIdHint?: string,
  ): Promise<{ merchantId?: string; outletId?: string | null; payload?: string | null }> {
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
          requestId: body?.requestId ?? undefined,
          category: body?.category ?? undefined,
          promoCode: body?.promoCode ?? undefined,
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
      if (merchantId && body?.orderId) {
        if (body?.refundTotal !== undefined && body?.refundTotal !== null) {
          try {
            const receipt = await this.prisma.receipt.findUnique({
              where: { merchantId_orderId: { merchantId, orderId: body?.orderId } },
              select: { outletId: true },
            });
            outletId = receipt?.outletId ?? null;
          } catch {}
          payload = JSON.stringify({
            merchantId,
            orderId: body.orderId,
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
        settings = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
      } catch {}
    }

    if (!primary && settings?.bridgeSecret) primary = settings.bridgeSecret;
    if (!secondary && (settings as any)?.bridgeSecretNext)
      secondary = (settings as any).bridgeSecretNext;

    return { primary, secondary };
  }

  private verifyWithSecrets(sig: string, payload: string, primary: string | null, secondary: string | null): boolean {
    if (!sig || !payload) return false;
    if (primary && verifyBridgeSignature(sig, payload, primary)) return true;
    if (secondary && verifyBridgeSignature(sig, payload, secondary)) return true;
    return false;
  }

  private async validateBridgeSignature(
    normalizedPath: string,
    req: any,
    merchantIdHint?: string,
    settingsHint?: any,
  ): Promise<{ ok: boolean; context?: { merchantId?: string; outletId?: string | null } }> {
    const sig = (req?.headers?.['x-bridge-signature'] as string | undefined) || '';
    if (!sig) return { ok: false };

    const context = await this.resolveOperationContext(normalizedPath, req, merchantIdHint);
    const merchantId = context.merchantId;
    const outletId = context.outletId ?? null;
    const payload = context.payload;

    if (!merchantId || !payload) return { ok: false, context };

    const { primary, secondary } = await this.getBridgeSecrets(
      merchantId,
      outletId,
      merchantIdHint && merchantIdHint === merchantId ? settingsHint : undefined,
    );

    if (!primary && !secondary) return { ok: false, context };

    return { ok: this.verifyWithSecrets(sig, payload, primary, secondary), context };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest() as any;
    const body = req.body || {};
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string = req?.route?.path || req?.path || req?.originalUrl || '';
    const normalizedPath = this.normalizePath(path || '');
    const key = (req.headers['x-staff-key'] as string | undefined) || '';
    // whitelist публичных GET маршрутов (всегда разрешены): balance, settings, transactions, публичные списки
    const isPublicGet = method === 'GET' && (
      path.startsWith('/loyalty/balance/') ||
      path.startsWith('/loyalty/settings/') ||
      path === '/loyalty/transactions' ||
      path.startsWith('/loyalty/outlets/') ||
      path.startsWith('/loyalty/staff/')
    );
    const isAlwaysPublic = (
      path === '/loyalty/teleauth' ||
      path === '/loyalty/consent' ||
      path === '/loyalty/cashier/login' ||
      path === '/loyalty/cashier/staff-token' ||
      path === '/loyalty/cashier/staff-access'
    );
    if (isPublicGet || isAlwaysPublic) return true;

    // Проверяем требование ключа на уровне мерчанта
    let requireStaffKey = false;
    let merchantSettings: any = null;
    try {
      const merchantId = body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
      if (merchantId) {
        merchantSettings = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
        requireStaffKey = Boolean(merchantSettings?.requireStaffKey);
      }
    } catch {}
    if (!key) {
      if (!requireStaffKey) return true;
      if (req?.teleauth?.customerId) return true;
      const { ok } = await this.validateBridgeSignature(
        normalizedPath,
        req,
        body?.merchantId || req?.params?.merchantId || req?.query?.merchantId,
        merchantSettings,
      );
      if (ok) {
        return true;
      }
      return false;
    }
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    let merchantIdForStaff = body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
    let contextForStaff: { merchantId?: string; outletId?: string | null } | undefined;
    if (!merchantIdForStaff) {
      const resolved = await this.resolveOperationContext(normalizedPath, req, undefined);
      contextForStaff = resolved;
      if (resolved.merchantId) merchantIdForStaff = resolved.merchantId;
    }
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId: merchantIdForStaff, apiKeyHash: hash, status: 'ACTIVE' },
      include: { accesses: { where: { status: 'ACTIVE' }, select: { outletId: true } } },
    });
    if (!staff) return false;
    let requestedOutletId =
      body?.outletId || req?.params?.outletId || req?.query?.outletId || undefined;
    if (!requestedOutletId) {
      if (!contextForStaff) {
        contextForStaff = await this.resolveOperationContext(normalizedPath, req, merchantIdForStaff);
      }
      if (contextForStaff?.outletId) {
        requestedOutletId = contextForStaff.outletId || undefined;
      }
    }
    if (String(staff.role || '').toUpperCase() === 'CASHIER') {
      const allowedOutletId: string | undefined = staff.allowedOutletId || undefined;
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
