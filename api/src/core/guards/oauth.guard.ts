import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

type JWTPayload = Record<string, unknown>;

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  oauth?: JWTPayload;
};

function getHeader(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

@Injectable()
export class OAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow if guard disabled (default: on)
    const sw = (this.config.getString('OAUTH_GUARD') || 'on')
      .trim()
      .toLowerCase();
    if (sw === 'off' || sw === '0' || sw === 'false' || sw === 'no')
      return true;

    const req = context.switchToHttp().getRequest<RequestLike>();
    const auth = getHeader(req, 'authorization') || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
      throw new UnauthorizedException('Bearer token required');
    const token = parts[1];

    const audience =
      (this.config.getString('OAUTH_AUDIENCE') || '').trim() || undefined;
    const issuer =
      (this.config.getString('OAUTH_ISSUER') || '').trim() || undefined;
    const requiredScope =
      (this.config.getString('OAUTH_REQUIRED_SCOPE') || '').trim() || undefined;

    const jwksUrl = (this.config.getString('OAUTH_JWKS_URL') || '').trim();
    const hsSecret = (this.config.getString('OAUTH_HS_SECRET') || '').trim();

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
    } catch {
      throw new UnauthorizedException('Invalid OAuth token');
    }

    if (requiredScope) {
      const scpStr = typeof payload?.scope === 'string' ? payload.scope : '';
      const scpArray = Array.isArray(payload?.scp)
        ? payload.scp.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const scopes = new Set<string>([
        ...scpStr.split(' ').filter(Boolean),
        ...scpArray,
      ]);
      if (!scopes.has(requiredScope))
        throw new UnauthorizedException('Missing required scope');
    }

    // Attach token payload to request for downstream usage
    req.oauth = payload || {};
    return true;
  }
}
