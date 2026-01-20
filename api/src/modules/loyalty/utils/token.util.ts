import { createHmac, randomUUID } from 'crypto';
const ENC = new TextEncoder();

type JwtPayload = {
  sub?: string;
  t?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  aud?: string | string[];
  [key: string]: unknown;
};

type JwtHeader = {
  alg: 'HS256';
  typ?: 'JWT';
  kid?: string;
  [key: string]: unknown;
};

type JoseSigner = {
  setProtectedHeader(header: JwtHeader): JoseSigner;
  setIssuedAt(iat: number): JoseSigner;
  setExpirationTime(exp: number): JoseSigner;
  setJti(jti: string): JoseSigner;
  setAudience(aud: string): JoseSigner;
  sign(secret: Uint8Array): Promise<string> | string;
};

type JoseModule = {
  SignJWT: new (payload: JwtPayload) => JoseSigner;
  jwtVerify: (
    token: string,
    secret: Uint8Array,
    options?: { algorithms: string[]; clockTolerance?: number },
  ) => Promise<{ payload: JwtPayload }>;
};

export async function getJose(): Promise<JoseModule> {
  // В среде тестов используем лёгкий stub, чтобы не требовать ESM из jest
  if (process.env.JEST_WORKER_ID) {
    const b64url = (buf: Buffer | string) => {
      const s = Buffer.isBuffer(buf)
        ? buf.toString('base64')
        : Buffer.from(buf, 'utf8').toString('base64');
      return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    };
    class SignJWTStub implements JoseSigner {
      private payload: JwtPayload;
      private header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
      constructor(payload: JwtPayload) {
        this.payload = { ...payload };
      }
      setProtectedHeader(h: JwtHeader) {
        this.header = { ...this.header, ...h };
        return this;
      }
      setIssuedAt(iat: number) {
        this.payload = { ...this.payload, iat };
        return this;
      }
      setExpirationTime(exp: number) {
        this.payload = { ...this.payload, exp };
        return this;
      }
      setJti(jti: string) {
        this.payload = { ...this.payload, jti };
        return this;
      }
      setAudience(aud: string) {
        this.payload = { ...this.payload, aud };
        return this;
      }
      sign(secretUint8: Uint8Array) {
        const headerB64 = b64url(JSON.stringify(this.header));
        const payloadB64 = b64url(JSON.stringify(this.payload));
        const data = `${headerB64}.${payloadB64}`;
        const sig = createHmac('sha256', Buffer.from(secretUint8))
          .update(data)
          .digest('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
        return `${data}.${sig}`;
      }
    }
    function jwtVerifyStub(
      token: string,
      secretUint8: Uint8Array,
      _opts?: { algorithms: string[]; clockTolerance?: number },
    ): Promise<{ payload: JwtPayload }> {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Bad token');
      const data = `${parts[0]}.${parts[1]}`;
      const sig = createHmac('sha256', Buffer.from(secretUint8))
        .update(data)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      if (sig !== parts[2]) throw new Error('Bad signature');
      const payload = JSON.parse(
        Buffer.from(
          parts[1].replace(/-/g, '+').replace(/_/g, '/'),
          'base64',
        ).toString('utf8'),
      ) as JwtPayload;
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && now > payload.exp) throw new Error('JWT expired');
      return Promise.resolve({ payload });
    }
    return { SignJWT: SignJWTStub, jwtVerify: jwtVerifyStub };
  }
  // динамический импорт для прода

  return (await import('jose')) as JoseModule;
}

export async function signQrToken(
  secret: string,
  customerId: string,
  merchantId?: string,
  ttlSec = 60,
) {
  const { SignJWT } = await getJose();
  const now = Math.floor(Date.now() / 1000);
  // Ensure JTI uniqueness to prevent accidental reuse within the same second
  const jti = `${customerId}:${now}:${randomUUID()}`;
  const kid = process.env.QR_JWT_KID || undefined;
  return await new SignJWT({ sub: customerId, t: 'qr' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', ...(kid ? { kid } : {}) })
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

export async function verifyQrToken(
  secret: string,
  token: string,
): Promise<VerifiedQr> {
  const { jwtVerify } = await getJose();
  const verifyWith = (sec: string) =>
    jwtVerify(token, ENC.encode(sec), {
      algorithms: ['HS256'],
      // небольшая терпимость к рассинхронизации времени и сетевым задержкам
      clockTolerance: 5,
    });
  let payload: JwtPayload;
  try {
    ({ payload } = await verifyWith(secret));
  } catch (e) {
    const next = process.env.QR_JWT_SECRET_NEXT;
    if (!next) throw e;
    ({ payload } = await verifyWith(next));
  }
  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  if (
    !payload.sub ||
    !payload.jti ||
    !Number.isFinite(exp) ||
    !Number.isFinite(iat)
  )
    throw new Error('Bad QR token');
  const aud = (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) as
    | string
    | undefined;
  return {
    customerId: String(payload.sub),
    merchantAud: aud,
    jti: String(payload.jti),
    iat,
    exp,
  };
}

// простая эвристика: похоже ли на JWT
export function looksLikeJwt(s: string) {
  return typeof s === 'string' && s.split('.').length === 3;
}
