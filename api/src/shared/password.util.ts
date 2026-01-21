import crypto from 'node:crypto';
import { logIgnoredError } from './logging/ignore-error.util';

// Simple scrypt-based password hashing
// Format: scrypt$N$r$p$saltBase64$hashBase64
const DEFAULTS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = DEFAULTS;
  const hash = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${Buffer.from(hash).toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = parseInt(parts[1], 10) || DEFAULTS.N;
    const r = parseInt(parts[2], 10) || DEFAULTS.r;
    const p = parseInt(parts[3], 10) || DEFAULTS.p;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const hash = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
    });
    return crypto.timingSafeEqual(expected, Buffer.from(hash));
  } catch (err) {
    logIgnoredError(err, 'verifyPassword failed', undefined, 'debug');
    return false;
  }
}
