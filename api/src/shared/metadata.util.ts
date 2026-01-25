import { Prisma } from '@prisma/client';
import {
  DEFAULT_JSON_SCHEMA_VERSION,
  getJsonSchemaVersion,
  setJsonSchemaVersion,
} from './json-version.util';

export const METADATA_SCHEMA_VERSION = DEFAULT_JSON_SCHEMA_VERSION;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type MetadataUpgradeResult = {
  value: Prisma.InputJsonValue | null | undefined;
  changed: boolean;
  fromVersion: number | null;
  toVersion: number;
};

export const upgradeMetadata = (
  value: Prisma.InputJsonValue | null | undefined,
  version: number = METADATA_SCHEMA_VERSION,
): MetadataUpgradeResult => {
  if (value === null || value === undefined) {
    return { value, changed: false, fromVersion: null, toVersion: version };
  }
  if (!isPlainObject(value)) {
    return { value, changed: false, fromVersion: null, toVersion: version };
  }
  const fromVersion = getJsonSchemaVersion(value);
  if (fromVersion === version) {
    return { value, changed: false, fromVersion, toVersion: version };
  }
  const next = setJsonSchemaVersion(
    { ...(value as Record<string, unknown>) },
    version,
  );
  return {
    value: next as Prisma.InputJsonValue,
    changed: true,
    fromVersion,
    toVersion: version,
  };
};

export const ensureMetadataVersion = (
  value: Prisma.InputJsonValue | null | undefined,
  version: number = METADATA_SCHEMA_VERSION,
): Prisma.InputJsonValue | null | undefined => {
  if (value === null || value === undefined) return value;
  if (!isPlainObject(value)) return value;
  const upgraded = upgradeMetadata(value, version);
  return upgraded.value;
};
