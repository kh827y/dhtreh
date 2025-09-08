import { SignJWT, jwtVerify } from 'jose';

const ENC = new TextEncoder();

export async function signQrToken(secret: string, customerId: string, merchantId?: string, ttlSec = 60) {
  const now = Math.floor(Date.now() / 1000);
  const jti = `${customerId}:${now}`;
  return await new SignJWT({ sub: customerId, t: 'qr' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .setJti(jti)
    .setAudience(merchantId || 'any')
    .sign(ENC.encode(secret));
}

export type VerifiedQr = {
  customerId: string;
  merchantAud?: string;
  jti: string;
  iat: number;
  exp: number;
};

export async function verifyQrToken(secret: string, token: string): Promise<VerifiedQr> {
  const { payload } = await jwtVerify(token, ENC.encode(secret), {
    algorithms: ['HS256'],
    // небольшая терпимость к рассинхронизации времени и сетевым задержкам
    clockTolerance: 5,
  });
  if (!payload.sub || !payload.jti || !payload.exp || !payload.iat) throw new Error('Bad QR token');
  const aud = (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) as string | undefined;
  return { customerId: String(payload.sub), merchantAud: aud, jti: String(payload.jti), iat: payload.iat!, exp: payload.exp! };
}

// простая эвристика: похоже ли на JWT
export function looksLikeJwt(s: string) {
  return typeof s === 'string' && s.split('.').length === 3;
}
