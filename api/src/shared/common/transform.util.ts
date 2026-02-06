import type { TransformFnParams } from 'class-transformer';

export const toOptionalNumber = ({ value }: TransformFnParams): unknown => {
  const raw = value as unknown;
  if (raw === null || raw === undefined || raw === '') return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : raw;
};

export const toOptionalInt = ({ value }: TransformFnParams): unknown => {
  const raw = value as unknown;
  if (raw === null || raw === undefined || raw === '') return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return raw;
  return Math.floor(num);
};

export const toOptionalBoolean = ({ value }: TransformFnParams): unknown => {
  const raw = value as unknown;
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const lowered = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lowered)) return true;
    if (['0', 'false', 'no', 'off'].includes(lowered)) return false;
  }
  return raw;
};

export const toTrimmedString = ({ value }: TransformFnParams): unknown => {
  const raw = value as unknown;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
};
