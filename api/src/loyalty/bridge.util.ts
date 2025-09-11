import * as crypto from 'crypto';

export function verifyBridgeSignature(header: string, body: string, secret: string): boolean {
  try {
    if (!header || !secret) return false;
    if (!header.startsWith('v1,')) return false;
    const kv: Record<string, string> = {};
    for (const chunk of header.split(',').slice(1)) {
      const i = chunk.indexOf('=');
      if (i <= 0) continue;
      const k = chunk.slice(0, i);
      const v = chunk.slice(i + 1);
      kv[k] = v;
    }
    const ts = kv.ts; const sig = kv.sig;
    if (!ts || !sig) return false;
    const calcB = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest();
    const sigB = Buffer.from(sig, 'base64');
    const calcBuffer = Buffer.from(calcB.toString('base64'), 'base64');
    const skewOk = Math.abs(Math.floor(Date.now()/1000) - Number(ts)) <= 300;
    return skewOk && crypto.timingSafeEqual(sigB, calcBuffer);
  } catch {
    return false;
  }
}
