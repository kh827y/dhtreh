import { SignJWT, jwtVerify } from 'jose';

const ENC = new TextEncoder();

export async function signQrToken(secret: string, customerId: string, ttlSec = 60) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ sub: customerId, t: 'qr' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .setJti(`${customerId}:${now}`)
    .sign(ENC.encode(secret));
}

export async function verifyQrToken(secret: string, token: string): Promise<string> {
  const { payload } = await jwtVerify(token, ENC.encode(secret), { algorithms: ['HS256'] });
  // customerId храним в sub
  if (!payload.sub) throw new Error('No sub');
  return String(payload.sub);
}

// простая эвристика: похоже ли на JWT
export function looksLikeJwt(s: string) {
  return typeof s === 'string' && s.split('.').length === 3;
}
