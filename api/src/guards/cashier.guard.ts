import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';
import { verifyBridgeSignature } from '../loyalty/bridge.util';

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

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

  private async hasValidBridgeSignature(
    path: string,
    req: any,
    merchantIdHint?: string,
    settingsHint?: any,
  ): Promise<boolean> {
    const sig = (req?.headers?.['x-bridge-signature'] as string | undefined) || '';
    if (!sig) return false;

    const body = req?.body || {};
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    let merchantId: string | undefined = merchantIdHint || undefined;
    let outletId: string | null = null;
    let payload: string | null = null;

    if (normalizedPath === '/loyalty/quote') {
      if (!merchantId) return false;
      outletId = body?.outletId ?? null;
      payload = JSON.stringify(body);
    } else if (normalizedPath === '/loyalty/commit') {
      const holdId: string | undefined = body?.holdId;
      if (!holdId) return false;
      let hold: { merchantId: string; outletId: string | null } | null = null;
      try {
        hold = await this.prisma.hold.findUnique({
          where: { id: holdId },
          select: { merchantId: true, outletId: true },
        });
      } catch {}
      merchantId = merchantId || hold?.merchantId || undefined;
      if (!merchantId) return false;
      outletId = hold?.outletId ?? null;
      payload = JSON.stringify({
        merchantId,
        holdId,
        orderId: body?.orderId,
        receiptNumber: body?.receiptNumber ?? undefined,
      });
    } else if (normalizedPath === '/loyalty/refund') {
      if (!merchantId) return false;
      try {
        const receipt = await this.prisma.receipt.findUnique({
          where: { merchantId_orderId: { merchantId, orderId: body?.orderId } },
          select: { outletId: true },
        });
        outletId = receipt?.outletId ?? null;
      } catch {}
      payload = JSON.stringify({
        merchantId,
        orderId: body?.orderId,
        refundTotal: body?.refundTotal,
        refundEligibleTotal: body?.refundEligibleTotal ?? undefined,
      });
    } else if (normalizedPath === '/loyalty/cancel') {
      const holdId: string | undefined = body?.holdId;
      if (!holdId) return false;
      let hold: { merchantId: string; outletId: string | null } | null = null;
      try {
        hold = await this.prisma.hold.findUnique({
          where: { id: holdId },
          select: { merchantId: true, outletId: true },
        });
      } catch {}
      merchantId = merchantId || hold?.merchantId || undefined;
      if (!merchantId) return false;
      outletId = hold?.outletId ?? null;
      payload = JSON.stringify({ merchantId, holdId });
    } else {
      return false;
    }

    if (!payload) return false;

    const { primary, secondary } = await this.getBridgeSecrets(
      merchantId,
      outletId,
      merchantIdHint && merchantIdHint === merchantId ? settingsHint : undefined,
    );

    if (!primary && !secondary) return false;

    return this.verifyWithSecrets(sig, payload, primary, secondary);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest() as any;
    const body = req.body || {};
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string = req?.route?.path || req?.path || req?.originalUrl || '';
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
      const pathForCheck = path || '';
      if (
        await this.hasValidBridgeSignature(
          pathForCheck,
          req,
          body?.merchantId || req?.params?.merchantId || req?.query?.merchantId,
          merchantSettings,
        )
      ) {
        return true;
      }
      return false;
    }
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    const merchantIdForStaff = body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId: merchantIdForStaff, apiKeyHash: hash, status: 'ACTIVE' },
      include: { accesses: { where: { status: 'ACTIVE' }, select: { outletId: true } } },
    });
    if (!staff) return false;
    const requestedOutletId = body?.outletId || req?.params?.outletId || req?.query?.outletId || undefined;
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
