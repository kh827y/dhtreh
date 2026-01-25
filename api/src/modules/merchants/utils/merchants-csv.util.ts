import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

export const sanitizeCsvValue = (value: string) => {
  const trimmed = value.replace(/^[\t\r\n ]+/, '');
  if (trimmed && /^[=+\-@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
};

export const toCsvString = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch (err) {
    logIgnoredError(err, 'Merchants CSV stringify', undefined, 'debug');
    return '';
  }
};

export const csvCell = (value: unknown) => {
  const safe = sanitizeCsvValue(toCsvString(value));
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
};
