import type { TransformFnParams } from 'class-transformer';

export const toOptionalNumber = ({ value }: TransformFnParams) => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : value;
};

export const toOptionalInt = ({ value }: TransformFnParams) => {
  const num = toOptionalNumber({ value } as TransformFnParams);
  if (typeof num !== 'number') return num;
  return Math.floor(num);
};

export const toOptionalBoolean = ({ value }: TransformFnParams) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lowered)) return true;
    if (['0', 'false', 'no', 'off'].includes(lowered)) return false;
  }
  return value;
};

export const toTrimmedString = ({ value }: TransformFnParams) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};
