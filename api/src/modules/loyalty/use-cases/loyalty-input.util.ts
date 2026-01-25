import { BadRequestException } from '@nestjs/common';

export const readTrimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const optionalTrimmed = (value: unknown): string | null => {
  const trimmed = readTrimmed(value);
  return trimmed ? trimmed : null;
};

export const requireTrimmed = (value: unknown, message: string): string => {
  const trimmed = readTrimmed(value);
  if (!trimmed) throw new BadRequestException(message);
  return trimmed;
};

export const requireLowerTrimmed = (value: unknown, message: string): string =>
  requireTrimmed(value, message).toLowerCase();

export const parseBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  const floored = Math.floor(numeric);
  return Math.min(Math.max(floored, min), max);
};

export const parseOptionalPositiveInt = (
  value: unknown,
): number | undefined => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.floor(numeric);
};

export const parseOptionalDate = (
  value: unknown,
  message: string,
): Date | undefined => {
  if (value == null || value === '') return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(message);
  }
  return parsed;
};
