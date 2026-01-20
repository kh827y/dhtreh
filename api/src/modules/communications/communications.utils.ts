import { Prisma } from '@prisma/client';

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

export const toInputJsonValue = (
  value: JsonRecord | null | undefined,
): Prisma.InputJsonValue | null =>
  value ? (value as Prisma.InputJsonValue) : null;

export const toNullableJsonInput = (
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value;
};
