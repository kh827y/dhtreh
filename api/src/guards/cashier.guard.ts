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
    // whitelist публичных GET маршрутов (всегда разрешены): balance, settings, transactions, публичные списки
    const isPublicGet = method === 'GET' && (
      path.startsWith('/loyalty/balance/') ||
      path.startsWith('/loyalty/settings/') ||
      path === '/loyalty/transactions' ||
      path.startsWith('/loyalty/outlets/') ||
      path.startsWith('/loyalty/devices/') ||
      path.startsWith('/loyalty/staff/')
    );
    const isAlwaysPublic = (
      path === '/loyalty/teleauth' ||
      path === '/loyalty/consent' ||
      path === '/loyalty/cashier/login' ||
      path === '/loyalty/cashier/staff-token'
    );
    if (isPublicGet || isAlwaysPublic) return true;

    // Проверяем требование ключа на уровне мерчанта
    let requireStaffKey = false;
    try {
      const merchantId = body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
      if (merchantId) {
        const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
        requireStaffKey = Boolean(s?.requireStaffKey);
      }
    } catch {}
    if (!key) return !requireStaffKey; // если требуется — блокируем, иначе пропускаем
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    const merchantIdForStaff = body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
    const staff = await this.prisma.staff.findFirst({ where: { merchantId: merchantIdForStaff, apiKeyHash: hash, status: 'ACTIVE' } });
    if (!staff) return false;
    if (staff.allowedOutletId && body.outletId && staff.allowedOutletId !== body.outletId) return false;
    if (staff.allowedDeviceId && body.deviceId && staff.allowedDeviceId !== body.deviceId) return false;
    return true;
  }
}
