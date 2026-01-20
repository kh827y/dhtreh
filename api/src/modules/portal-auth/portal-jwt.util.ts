import { getJose } from '../loyalty/utils/token.util';
import { AppConfigService } from '../../core/config/app-config.service';

export type PortalActor = 'MERCHANT' | 'STAFF';

export interface PortalJwtClaims {
  sub: string;
  merchantId: string;
  actor: PortalActor;
  role: string;
  staffId?: string;
  adminImpersonation: boolean;
  version: number;
  issuedAt?: number;
  payload: Record<string, unknown>;
}

const PORTAL_JWT_VERSION = 1;
const config = new AppConfigService();

type SignPortalJwtOptions = {
  merchantId: string;
  subject: string;
  actor: PortalActor;
  role: string;
  staffId?: string;
  adminImpersonation?: boolean;
  ttlSeconds?: number;
};

export async function signPortalJwt(options: SignPortalJwtOptions) {
  const { merchantId, subject, actor, role } = options;
  if (!merchantId) throw new Error('merchantId is required');
  if (!subject) throw new Error('subject is required');
  const { SignJWT } = await getJose();
  const secret = config.getPortalJwtSecret();
  if (!secret) throw new Error('PORTAL_JWT_SECRET not configured');
  const payload: Record<string, unknown> = {
    merchantId,
    actor,
    role,
    version: PORTAL_JWT_VERSION,
  };
  payload.sub = subject;
  if (options.staffId) payload.staffId = options.staffId;
  if (options.adminImpersonation)
    payload.adminImpersonation = !!options.adminImpersonation;
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.floor(options.ttlSeconds ?? 60 * 60));
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(new TextEncoder().encode(secret));
  return token as string;
}

export async function verifyPortalJwt(token: string): Promise<PortalJwtClaims> {
  const { jwtVerify } = await getJose();
  const secret = config.getPortalJwtSecret();
  if (!secret) throw new Error('PORTAL_JWT_SECRET not configured');
  const result = await jwtVerify(token, new TextEncoder().encode(secret));
  const payload = result.payload as Record<string, unknown>;
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const actorRaw =
    typeof payload.actor === 'string' ? payload.actor.toUpperCase() : '';
  const actor: PortalActor =
    actorRaw === 'STAFF' ? 'STAFF' : ('MERCHANT' as const);
  const roleRaw = typeof payload.role === 'string' ? payload.role : undefined;
  const merchantIdCandidate =
    typeof payload.merchantId === 'string' ? payload.merchantId : undefined;
  const merchantId =
    merchantIdCandidate || (actor === 'MERCHANT' ? sub : undefined) || '';
  if (!merchantId) throw new Error('Invalid portal token: merchantId missing');
  const staffIdCandidate =
    actor === 'STAFF'
      ? typeof payload.staffId === 'string'
        ? payload.staffId
        : undefined
      : undefined;
  const staffId =
    actor === 'STAFF' ? staffIdCandidate || (sub ? sub : undefined) : undefined;
  const adminImpersonation = !!payload.adminImpersonation;
  const version =
    typeof payload.version === 'number' ? payload.version : PORTAL_JWT_VERSION;
  const issuedAt = typeof payload.iat === 'number' ? payload.iat : undefined;
  return {
    sub,
    merchantId,
    actor,
    role: roleRaw || (actor === 'STAFF' ? 'STAFF' : 'MERCHANT'),
    staffId,
    adminImpersonation,
    version,
    issuedAt,
    payload,
  };
}

// Refresh token helpers (separate secret and typically longer TTL)
type SignPortalRefreshJwtOptions = Omit<SignPortalJwtOptions, 'ttlSeconds'> & {
  ttlSeconds?: number;
};

export async function signPortalRefreshJwt(
  options: SignPortalRefreshJwtOptions,
) {
  const { merchantId, subject, actor, role } = options;
  if (!merchantId) throw new Error('merchantId is required');
  if (!subject) throw new Error('subject is required');
  const { SignJWT } = await getJose();
  const secret = config.getPortalRefreshSecret();
  if (!secret) throw new Error('PORTAL_REFRESH_SECRET not configured');
  const payload: Record<string, unknown> = {
    merchantId,
    actor,
    role,
    version: PORTAL_JWT_VERSION,
  };
  payload.sub = subject;
  if (options.staffId) payload.staffId = options.staffId;
  if (options.adminImpersonation)
    payload.adminImpersonation = !!options.adminImpersonation;
  const now = Math.floor(Date.now() / 1000);
  const ttlDefault = 30 * 24 * 60 * 60; // 30 days
  const ttl = Math.max(60, Math.floor(options.ttlSeconds ?? ttlDefault));
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(new TextEncoder().encode(secret));
  return token as string;
}

export async function verifyPortalRefreshJwt(
  token: string,
): Promise<PortalJwtClaims> {
  const { jwtVerify } = await getJose();
  const secret = config.getPortalRefreshSecret();
  if (!secret) throw new Error('PORTAL_REFRESH_SECRET not configured');
  const result = await jwtVerify(token, new TextEncoder().encode(secret));
  const payload = result.payload as Record<string, unknown>;
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const actorRaw =
    typeof payload.actor === 'string' ? payload.actor.toUpperCase() : '';
  const actor: PortalActor = actorRaw === 'STAFF' ? 'STAFF' : 'MERCHANT';
  const roleRaw = typeof payload.role === 'string' ? payload.role : undefined;
  const merchantIdCandidate =
    typeof payload.merchantId === 'string' ? payload.merchantId : undefined;
  const merchantId =
    merchantIdCandidate || (actor === 'MERCHANT' ? sub : '') || '';
  if (!merchantId)
    throw new Error('Invalid portal refresh token: merchantId missing');
  const staffIdCandidate =
    actor === 'STAFF'
      ? typeof payload.staffId === 'string'
        ? payload.staffId
        : undefined
      : undefined;
  const staffId =
    actor === 'STAFF' ? staffIdCandidate || (sub ? sub : undefined) : undefined;
  const adminImpersonation = !!payload.adminImpersonation;
  const version =
    typeof payload.version === 'number' ? payload.version : PORTAL_JWT_VERSION;
  const issuedAt = typeof payload.iat === 'number' ? payload.iat : undefined;
  return {
    sub,
    merchantId,
    actor,
    role: roleRaw || (actor === 'STAFF' ? 'STAFF' : 'MERCHANT'),
    staffId,
    adminImpersonation,
    version,
    issuedAt,
    payload,
  };
}
