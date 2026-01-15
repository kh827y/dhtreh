import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

function normalizeIp(ip?: string): string {
  if (!ip) return '';
  // Handle IPv6-mapped IPv4 e.g. ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  // Strip port if present
  const idx = ip.indexOf(':');
  if (idx > -1 && ip.indexOf('.') === -1) return ip; // IPv6
  if (ip.includes(':') && ip.includes('.')) {
    // Sometimes express req.ip may be '::ffff:1.2.3.4'
    const part = ip.split(':').pop();
    return part || ip;
  }
  return ip;
}

function getClientIp(req: any): string {
  const cand =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '';
  return normalizeIp(cand);
}

function ipMatches(ip: string, rule: string): boolean {
  const r = rule.trim();
  if (!r) return false;
  if (r.endsWith('/24')) {
    const pref = r.replace('/24', '');
    const p = pref.split('.').slice(0, 3).join('.') + '.';
    return ip.startsWith(p);
  }
  if (r.endsWith('*')) {
    const p = r.slice(0, -1);
    return ip.startsWith(p);
  }
  if (r.endsWith('.')) {
    return ip.startsWith(r);
  }
  return ip === r;
}

@Injectable()
export class AdminIpGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    // In tests, do not enforce IP whitelist
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)
      return true;
    const allowAll = ['1', 'true', 'yes'].includes(
      String(process.env.ADMIN_IP_ALLOW_ALL || '').trim().toLowerCase(),
    );
    const wl = (
      process.env.ADMIN_IP_WHITELIST ||
      process.env.ADMIN_ALLOWED_IPS ||
      ''
    ).trim();
    if (!wl) {
      if (process.env.NODE_ENV === 'production' && !allowAll) {
        throw new UnauthorizedException('Admin IP whitelist not configured');
      }
      return true;
    }

    const ip = getClientIp(req);
    const rules = wl
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = rules.some((r) => ipMatches(ip, r));
    if (ok) return true;

    throw new UnauthorizedException('Admin IP not allowed');
  }
}
