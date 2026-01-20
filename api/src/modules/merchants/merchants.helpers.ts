import { createHash, randomBytes, randomInt } from 'crypto';
import { StaffOutletAccessStatus } from '@prisma/client';
import type { PrismaService } from '../../core/prisma/prisma.service';

export const slugify = (value: string): string => {
  const map: Record<string, string> = {
    ё: 'e',
    й: 'i',
    ц: 'c',
    у: 'u',
    к: 'k',
    е: 'e',
    н: 'n',
    г: 'g',
    ш: 'sh',
    щ: 'sch',
    з: 'z',
    х: 'h',
    ъ: '',
    ф: 'f',
    ы: 'y',
    в: 'v',
    а: 'a',
    п: 'p',
    р: 'r',
    о: 'o',
    л: 'l',
    д: 'd',
    ж: 'zh',
    э: 'e',
    я: 'ya',
    ч: 'ch',
    с: 's',
    м: 'm',
    и: 'i',
    т: 't',
    ь: '',
    б: 'b',
    ю: 'yu',
  };
  const normalized = String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
  const onlyLetters = normalized.replace(/[^a-z]+/g, '');
  return onlyLetters || 'merchant';
};

export const normalizePhone = (value?: string | null) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
};

const letterSuffix = (index: number): string => {
  let n = index;
  let suffix = '';
  while (n >= 0) {
    suffix = String.fromCharCode(97 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  }
  return suffix;
};

export const ensureUniqueCashierLogin = async (
  prisma: PrismaService,
  slug: string,
): Promise<string> => {
  const candidate = slug || 'merchant';
  for (let i = 0; i < 200; i += 1) {
    const attempt = i === 0 ? candidate : `${slug}${letterSuffix(i - 1)}`;
    const found = await prisma.merchant.findFirst({
      where: { cashierLogin: attempt },
    });
    if (!found) return attempt;
  }
  return `${slug}${letterSuffix(Math.floor(Math.random() * 1000) + 260)}`;
};

export const randomDigitsSecure = (length: number): string => {
  const len = Math.max(1, Math.min(64, Math.floor(Number(length) || 0)));
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += String(randomInt(0, 10));
  }
  return out;
};

export const normalizeDigits = (value: string, maxLen: number): string =>
  String(value || '')
    .replace(/[^0-9]/g, '')
    .slice(0, Math.max(0, Math.floor(Number(maxLen) || 0)));

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const hashPin = (pin: string): string => sha256(`pin:${pin}`);

export const randomPin4 = (): string => {
  const n = Math.floor(Math.random() * 10000);
  return n.toString().padStart(4, '0');
};

export const secureToken = (len = 48): string => {
  const bytes = Math.ceil(len / 2);
  return randomBytes(bytes).toString('hex').slice(0, len);
};

export const randomSessionToken = (): string => randomBytes(48).toString('hex');

export const generateUniqueOutletPin = async (
  prisma: PrismaService,
  merchantId: string,
  excludeAccessId?: string,
): Promise<string> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = randomPin4();
    const clash = await prisma.staffOutletAccess.findFirst({
      where: {
        merchantId,
        pinCode: candidate,
        status: StaffOutletAccessStatus.ACTIVE,
        ...(excludeAccessId ? { id: { not: excludeAccessId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Unable to generate unique PIN');
};
