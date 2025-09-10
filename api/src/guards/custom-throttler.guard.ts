import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    try {
      const ip = (req.ip || req.ips?.[0] || req.socket?.remoteAddress || 'unknown');
      const path = (req.route?.path || req.path || req.originalUrl || '').split('?')[0];
      const body = req.body || {};
      const q = req.query || {};
      const merchantId = body.merchantId || q.merchantId || '';
      const deviceId = body.deviceId || q.deviceId || '';
      const staffId = body.staffId || q.staffId || '';
      return [ip, path, merchantId, deviceId, staffId].filter(Boolean).join('|');
    } catch {
      return await super.getTracker(req as any);
    }
  }
}
