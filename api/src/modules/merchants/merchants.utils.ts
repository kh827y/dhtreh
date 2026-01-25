import {
  asRecord as asRecordShared,
  isNonEmptyString as isNonEmptyStringShared,
} from '../../shared/common/input.util';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

export const asRecord = asRecordShared;

export const hasOwn = (
  value: object | null | undefined,
  key: string,
): boolean =>
  !!value && Object.prototype.hasOwnProperty.call(value, key) === true;

export const isNonEmptyString = isNonEmptyStringShared;

export const formatUnknownError = (
  value: unknown,
  fallback: string,
): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value == null) return fallback;
  try {
    return JSON.stringify(value);
  } catch (err) {
    logIgnoredError(err, 'formatUnknownError', undefined, 'debug');
    return fallback;
  }
};
