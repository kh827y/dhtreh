import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

type JWTPayload = Record<string, any>;

@Injectable()
export class OAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow if guard disabled (default: on)
    const sw = (process.env.OAUTH_GUARD || 'on').trim().toLowerCase();
    if (sw === 'off' || sw === '0' || sw === 'false' || sw === 'no') return true;

    const req = context.switchToHttp().getRequest();
    const auth = (req.headers['authorization'] as string | undefined) || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') throw new UnauthorizedException('Bearer token required');
    const token = parts[1];

    const audience = (process.env.OAUTH_AUDIENCE || '').trim() || undefined;
    const issuer = (process.env.OAUTH_ISSUER || '').trim() || undefined;
    const requiredScope = (process.env.OAUTH_REQUIRED_SCOPE || '').trim() || undefined;

    const jwksUrl = (process.env.OAUTH_JWKS_URL || '').trim();
    const hsSecret = (process.env.OAUTH_HS_SECRET || '').trim();

    // If no verification is configured — allow without importing ESM-only 'jose'
    if (!jwksUrl && !hsSecret) return true;

    let payload: JWTPayload | undefined;
    try {
      // Dynamic ESM import to play nice with Jest CJS runtime
      const jose = await import('jose');
      if (jwksUrl) {
        const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
        const res = await jose.jwtVerify(token, JWKS, { audience, issuer });
        payload = res.payload as JWTPayload;
      } else if (hsSecret) {
        const key = new TextEncoder().encode(hsSecret);
        const res = await jose.jwtVerify(token, key, { audience, issuer });
        payload = res.payload as JWTPayload;
      } else {
        return true;
      }
    } catch (e) {
      throw new UnauthorizedException('Invalid OAuth token');
    }

    if (requiredScope) {
      const scpStr = (payload?.scope as string | undefined) || '';
      const scopes = new Set<string>([
        ...scpStr.split(' ').filter(Boolean),
        ...(((payload as any)?.scp as string[] | undefined) || []),
      ]);
      if (!scopes.has(requiredScope)) throw new UnauthorizedException('Missing required scope');
    }

    // Attach token payload to request for downstream usage
    (req as any).oauth = payload || {};
    return true;
  }
}
