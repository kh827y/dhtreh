import { SignJWT, jwtVerify } from 'jose';

const ENC = new TextEncoder();

export async function signQrToken(secret: string, customerId: string, merchantId?: string, ttlSec = 60) {
  const now = Math.floor(Date.now() / 1000);
  const jti = `${customerId}:${now}`;
  const kid = process.env.QR_JWT_KID || undefined;
  return await new SignJWT({ sub: customerId, t: 'qr' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', ...(kid?{ kid }: {}) })
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
  const verifyWith = async (sec: string) => jwtVerify(token, ENC.encode(sec), {
    algorithms: ['HS256'],
    // небольшая терпимость к рассинхронизации времени и сетевым задержкам
    clockTolerance: 5,
  });
  let payload: any;
  try {
    ({ payload } = await verifyWith(secret));
  } catch (e) {
    const next = process.env.QR_JWT_SECRET_NEXT;
    if (!next) throw e;
    ({ payload } = await verifyWith(next));
  }
  if (!payload.sub || !payload.jti || !payload.exp || !payload.iat) throw new Error('Bad QR token');
  const aud = (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) as string | undefined;
  return { customerId: String(payload.sub), merchantAud: aud, jti: String(payload.jti), iat: payload.iat!, exp: payload.exp! };
}

// простая эвристика: похоже ли на JWT
export function looksLikeJwt(s: string) {
  return typeof s === 'string' && s.split('.').length === 3;
}
