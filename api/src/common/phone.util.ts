export function normalizePhoneDigits(value?: string | null): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith('7')) {
    digits = `7${digits}`;
  }
  if (digits.length !== 11) return null;
  return digits;
}

export function normalizePhoneE164(value?: string | null): string | null {
  const digits = normalizePhoneDigits(value);
  return digits ? `+${digits}` : null;
}
