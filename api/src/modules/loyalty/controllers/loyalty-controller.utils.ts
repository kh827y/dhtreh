export const ALL_CUSTOMERS_SEGMENT_KEY = 'all-customers';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

export const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const readErrorCode = (err: unknown): string => {
  const record = asRecord(err);
  const code = record?.code;
  if (typeof code === 'string') return code;
  const name = record?.name;
  return typeof name === 'string' ? name : '';
};

export const readErrorMessage = (err: unknown): string => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const record = asRecord(err);
  const message = record?.message;
  if (typeof message === 'string') return message;
  if (typeof err === 'number' || typeof err === 'boolean' || err == null) {
    return String(err ?? '');
  }
  return '';
};
