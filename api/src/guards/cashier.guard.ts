import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest() as any;
    const body = req.body || {};
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string = req?.route?.path || req?.path || req?.originalUrl || '';
    const key = (req.headers['x-staff-key'] as string | undefined) || '';
    const bridgeSig = (req.headers['x-bridge-signature'] as string | undefined) || '';
    // whitelist публичных GET маршрутов (всегда разрешены): balance, settings, transactions, публичные списки
    const isPublicGet = method === 'GET' && (
      path.startsWith('/loyalty/balance/') ||
      path.startsWith('/loyalty/settings/') ||
      path === '/loyalty/transactions' ||
      path.startsWith('/loyalty/outlets/') ||
      path.startsWith('/loyalty/staff/') ||
      path.startsWith('/loyalty/reviews/settings')
    );
    const isAlwaysPublic = (
      path === '/loyalty/teleauth' ||
      path === '/loyalty/consent' ||
      path === '/loyalty/cashier/login' ||
      path === '/loyalty/cashier/staff-token' ||
      path === '/loyalty/cashier/staff-access' ||
      path === '/loyalty/reviews'
    );
    if (isPublicGet || isAlwaysPublic) return true;

    const holdId = typeof body?.holdId === 'string' ? body.holdId : undefined;
    let holdCtx: { merchantId?: string | null; outletId?: string | null } | null = null;
    if (holdId && this.prisma?.hold?.findUnique) {
      try {
        holdCtx = await this.prisma.hold.findUnique({
          where: { id: holdId },
          select: { merchantId: true, outletId: true },
        });
      } catch {}
    }

    // Проверяем требование ключа на уровне мерчанта
    let requireStaffKey = false;
    let merchantIdForCtx: string | undefined =
      body?.merchantId || req?.params?.merchantId || req?.query?.merchantId || holdCtx?.merchantId || undefined;
    try {
      if (merchantIdForCtx) {
        const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId: merchantIdForCtx } });
        requireStaffKey = Boolean(s?.requireStaffKey);
      }
    } catch {}
    if (!key) return !requireStaffKey || !!bridgeSig; // bridge подпись допустима как альтернатива
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    const merchantIdForStaff = merchantIdForCtx;
    if (!merchantIdForStaff) return true;

    const staff = await this.prisma.staff.findFirst({
      where: { merchantId: merchantIdForStaff, apiKeyHash: hash, status: 'ACTIVE' },
      include: { accesses: { where: { status: 'ACTIVE' }, select: { outletId: true } } },
    });
    if (!staff) return false;
    const requestedOutletId =
      body?.outletId || req?.params?.outletId || req?.query?.outletId || holdCtx?.outletId || undefined;
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
