import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { getJose } from '../loyalty/token.util';

@Injectable()
export class PortalGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any =
      context.getType<'http' | 'graphql'>() === 'http'
        ? context.switchToHttp().getRequest()
        : GqlExecutionContext.create(context).getContext()?.req;
    if (!req) return false;
    const auth = String(req.headers?.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return false;
    try {
      const { jwtVerify } = await getJose();
      const secret = process.env.PORTAL_JWT_SECRET || '';
      if (!secret) return false;
      const { payload } = await jwtVerify(m[1], new TextEncoder().encode(secret));
      const sub = String(payload?.sub || '');
      if (!sub) return false;
      req.portalMerchantId = sub;
      req.portalRole = payload?.role || 'MERCHANT';
      req.portalAdminImpersonation = !!payload?.adminImpersonation;
      return true;
    } catch {
      return false;
    }
  }
}
