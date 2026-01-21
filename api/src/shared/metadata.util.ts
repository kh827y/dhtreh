import { Prisma } from '@prisma/client';
import {
  DEFAULT_JSON_SCHEMA_VERSION,
  withJsonSchemaVersion,
} from './json-version.util';

export const METADATA_SCHEMA_VERSION = DEFAULT_JSON_SCHEMA_VERSION;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureMetadataVersion = (
  value: Prisma.InputJsonValue | null | undefined,
  version: number = METADATA_SCHEMA_VERSION,
): Prisma.InputJsonValue | null | undefined => {
  if (value === null || value === undefined) return value;
  if (!isPlainObject(value)) return value;
  return withJsonSchemaVersion(
    { ...(value as Record<string, unknown>) },
    version,
  ) as Prisma.InputJsonValue;
};
