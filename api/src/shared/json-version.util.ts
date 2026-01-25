const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const JSON_SCHEMA_VERSION_KEY = 'schemaVersion';
export const DEFAULT_JSON_SCHEMA_VERSION = 1;

export const getJsonSchemaVersion = (value: unknown): number | null => {
  if (!isPlainObject(value)) return null;
  const raw = value[JSON_SCHEMA_VERSION_KEY];
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

export const withJsonSchemaVersion = <T>(
  value: T,
  version: number = DEFAULT_JSON_SCHEMA_VERSION,
): T => {
  if (!isPlainObject(value)) return value;
  const existing = getJsonSchemaVersion(value);
  if (existing) return value;
  return {
    ...(value as Record<string, unknown>),
    [JSON_SCHEMA_VERSION_KEY]: version,
  } as T;
};

export const setJsonSchemaVersion = <T>(value: T, version: number): T => {
  if (!isPlainObject(value)) return value;
  return {
    ...(value as Record<string, unknown>),
    [JSON_SCHEMA_VERSION_KEY]: version,
  } as T;
};
