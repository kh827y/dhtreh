export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): JsonRecord | null =>
  isRecord(value) ? value : null;

export const cloneRecord = (value: unknown): JsonRecord => ({
  ...(asRecord(value) ?? {}),
});

export const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

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
