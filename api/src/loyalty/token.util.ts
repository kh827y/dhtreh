const ENC = new TextEncoder();

async function getJose() {
  // В среде тестов используем лёгкий stub, чтобы не требовать ESM из jest
  if (process.env.JEST_WORKER_ID) {
    const { createHmac } = require('crypto');
    const b64url = (buf: Buffer | string) => {
      const s = (Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf, 'utf8').toString('base64'));
      return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    };
    class SignJWTStub {
      private payload: any;
      private header: any = { alg: 'HS256', typ: 'JWT' };
      constructor(payload: any) { this.payload = payload; }
      setProtectedHeader(h: any) { this.header = { ...this.header, ...h }; return this; }
      setIssuedAt(iat: number) { this.payload = { ...this.payload, iat }; return this; }
      setExpirationTime(exp: number) { this.payload = { ...this.payload, exp }; return this; }
      setJti(jti: string) { this.payload = { ...this.payload, jti }; return this; }
      setAudience(aud: string) { this.payload = { ...this.payload, aud }; return this; }
      async sign(secretUint8: Uint8Array) {
        const headerB64 = b64url(JSON.stringify(this.header));
        const payloadB64 = b64url(JSON.stringify(this.payload));
        const data = `${headerB64}.${payloadB64}`;
        const sig = createHmac('sha256', Buffer.from(secretUint8)).update(data).digest('base64')
          .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        return `${data}.${sig}`;
      }
    }
    async function jwtVerifyStub(token: string, secretUint8: Uint8Array, _opts: any) {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Bad token');
      const data = `${parts[0]}.${parts[1]}`;
      const sig = createHmac('sha256', Buffer.from(secretUint8)).update(data).digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      if (sig !== parts[2]) throw new Error('Bad signature');
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const now = Math.floor(Date.now()/1000);
      if (payload.exp && now > payload.exp) throw new Error('JWT expired');
      return { payload } as any;
    }
    return { SignJWT: SignJWTStub, jwtVerify: jwtVerifyStub } as any;
  }
  // динамический импорт для прода
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return await import('jose');
}

export async function signQrToken(secret: string, customerId: string, merchantId?: string, ttlSec = 60) {
  const { SignJWT } = await getJose();
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
  const { jwtVerify } = await getJose();
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
