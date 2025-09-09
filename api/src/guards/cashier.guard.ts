import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class CashierGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest() as any;
    const body = req.body || {};
    const key = (req.headers['x-staff-key'] as string | undefined) || '';
    if (!key) return true; // нет ключа — не ограничиваем (может быть Bridge/админ)
    const hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    const staff = await this.prisma.staff.findFirst({ where: { merchantId: body.merchantId, apiKeyHash: hash, status: 'ACTIVE' } });
    if (!staff) return false;
    if (staff.allowedOutletId && body.outletId && staff.allowedOutletId !== body.outletId) return false;
    if (staff.allowedDeviceId && body.deviceId && staff.allowedDeviceId !== body.deviceId) return false;
    return true;
  }
}

