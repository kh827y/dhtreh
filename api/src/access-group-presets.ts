import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AccessScope, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type AccessGroupPresetPermission = {
  resource: string;
  action: string;
  conditions?: Prisma.JsonValue | null;
};

export type AccessGroupPreset = {
  name: string;
  description: string | null;
  scope: AccessScope;
  isSystem: boolean;
  isDefault: boolean;
  permissions: AccessGroupPresetPermission[];
};

const PRESET_FILE = 'access-groups.json';
const PRESET_PATHS = [
  process.env.ACCESS_GROUP_PRESETS_PATH,
  path.resolve(process.cwd(), 'fixtures', PRESET_FILE),
  path.resolve(process.cwd(), 'api', 'fixtures', PRESET_FILE),
  path.resolve(__dirname, '..', 'fixtures', PRESET_FILE),
  path.resolve(__dirname, '..', '..', 'fixtures', PRESET_FILE),
].filter((value): value is string => Boolean(value));

type RawPresetFile = {
  groups?: unknown;
};

type RawPresetGroup = {
  name?: unknown;
  description?: unknown;
  scope?: unknown;
  isSystem?: unknown;
  isDefault?: unknown;
  permissions?: unknown;
};

type RawPresetPermission = {
  resource?: unknown;
  actions?: unknown;
  action?: unknown;
  conditions?: unknown;
};

function normalizeScope(raw: unknown): AccessScope {
  const value = String(raw || 'PORTAL')
    .trim()
    .toUpperCase();
  return value === 'CASHIER' ? AccessScope.CASHIER : AccessScope.PORTAL;
}

function normalizeActions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((action) => String(action || '').trim().toLowerCase());
  }
  if (raw != null) {
    return [String(raw).trim().toLowerCase()];
  }
  return [];
}

export function loadAccessGroupPresets(): AccessGroupPreset[] {
  const presetPath =
    PRESET_PATHS.find((candidate) => existsSync(candidate)) || null;
  if (!presetPath) return [];
  let parsed: RawPresetFile | null = null;
  try {
    parsed = JSON.parse(readFileSync(presetPath, 'utf8')) as RawPresetFile;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const rawGroups = parsed.groups;
  if (!Array.isArray(rawGroups)) return [];

  const presets: AccessGroupPreset[] = [];
  for (const raw of rawGroups) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const group = raw as RawPresetGroup;
    const name = String(group.name || '').trim();
    if (!name) continue;
    const description =
      typeof group.description === 'string' ? group.description : null;
    const permissions: AccessGroupPresetPermission[] = [];
    const rawPermissions = Array.isArray(group.permissions)
      ? (group.permissions as RawPresetPermission[])
      : [];
    const seen = new Set<string>();
    for (const item of rawPermissions) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const resource = String(item.resource || '').trim().toLowerCase();
      if (!resource) continue;
      const actions = normalizeActions(item.actions ?? item.action);
      for (const action of actions) {
        if (!action) continue;
        const key = `${resource}:${action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        permissions.push({
          resource,
          action,
          conditions:
            item.conditions === undefined ? null : (item.conditions as any),
        });
      }
    }

    presets.push({
      name,
      description,
      scope: normalizeScope(group.scope),
      isSystem: Boolean(group.isSystem),
      isDefault: Boolean(group.isDefault),
      permissions,
    });
  }
  return presets;
}

export async function createAccessGroupsFromPresets(
  prisma: Prisma.TransactionClient | PrismaService,
  merchantId: string,
): Promise<number> {
  const presets = loadAccessGroupPresets();
  if (!presets.length) return 0;
  let created = 0;
  for (const preset of presets) {
    try {
      const group = await prisma.accessGroup.create({
        data: {
          merchantId,
          name: preset.name,
          description: preset.description,
          scope: preset.scope,
          isSystem: preset.isSystem,
          isDefault: preset.isDefault,
        },
      });
      if (preset.permissions.length) {
        const data = preset.permissions.map((permission) => {
          const raw = permission.conditions;
          const conditions =
            raw === undefined
              ? undefined
              : raw === null
                ? Prisma.DbNull
                : (raw as Prisma.InputJsonValue);
          return {
            groupId: group.id,
            resource: permission.resource,
            action: permission.action,
            ...(conditions === undefined ? {} : { conditions }),
          };
        });
        await prisma.accessGroupPermission.createMany({
          data,
        });
      }
      created += 1;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }
  return created;
}
