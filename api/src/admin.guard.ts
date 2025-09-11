import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const key = (req.headers['x-admin-key'] as string | undefined) ?? '';
    const want = process.env.ADMIN_KEY || '';
    
    // In production, admin key must be configured and not use dev defaults
    if (process.env.NODE_ENV === 'production') {
      if (!want || want === 'dev_change_me' || want === 'admin') {
        throw new UnauthorizedException('Admin key not properly configured for production');
      }
    }
    
    if (!want) throw new UnauthorizedException('Admin key not configured');
    if (key === want) return true;
    throw new UnauthorizedException('Missing or invalid admin key');
  }
}
