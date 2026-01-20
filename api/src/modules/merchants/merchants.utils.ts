export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const hasOwn = (value: object | null | undefined, key: string): boolean =>
  !!value && Object.prototype.hasOwnProperty.call(value, key) === true;

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const formatUnknownError = (value: unknown, fallback: string): string => {
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
  } catch {
    return fallback;
  }
};
