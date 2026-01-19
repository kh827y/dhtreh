import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { PromotionRewardType } from '@prisma/client';

export type PortalPermissionState = {
  allowAll?: boolean;
  resources?: Map<string, Set<string>> | Record<string, unknown>;
};

export const PORTAL_PERMISSIONS_HANDLED_KEY = 'portal_permissions_handled';
export const PortalPermissionsHandled = () =>
  SetMetadata(PORTAL_PERMISSIONS_HANDLED_KEY, true);

const EDIT_ACTIONS = new Set(['create', 'update', 'delete', 'manage', '*']);

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function normalizeResource(value: unknown) {
  return toStringValue(value).trim().toLowerCase();
}

function normalizeAction(value: unknown) {
  return toStringValue(value).trim().toLowerCase();
}

function toActionSet(raw: unknown): Set<string> | null {
  if (!raw) return null;
  if (raw instanceof Set) {
    return new Set(Array.from(raw).map((action) => normalizeAction(action)));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((action) => normalizeAction(action)));
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return new Set(
      Object.keys(record)
        .filter((key) => Boolean(record[key]))
        .map((key) => normalizeAction(key)),
    );
  }
  return null;
}

function readActions(
  state: PortalPermissionState,
  resource: string,
): Set<string> | null {
  if (!state?.resources) return null;
  const key = normalizeResource(resource);
  if (state.resources instanceof Map) {
    return toActionSet(state.resources.get(key));
  }
  const raw = (state.resources as Record<string, unknown>)[key];
  return toActionSet(raw);
}

function canPerform(action: string, actions: Set<string>) {
  const normalized = normalizeAction(action);
  if (!normalized) return false;
  const hasEdit = Array.from(actions).some((value) => EDIT_ACTIONS.has(value));
  if (normalized === 'read') {
    return actions.has('read') || hasEdit;
  }
  if (normalized === 'manage') {
    return hasEdit;
  }
  return actions.has(normalized) || hasEdit;
}

export function hasPortalPermission(
  state: PortalPermissionState | null | undefined,
  resource: string,
  action: string = 'read',
) {
  if (!state) return false;
  if (state.allowAll) return true;
  const normalizedResource = normalizeResource(resource);
  const allActions = readActions(state, '__all__');
  if (allActions && canPerform(action, allActions)) return true;
  const resourcesToCheck = [normalizedResource];
  for (const key of resourcesToCheck) {
    const actions = readActions(state, key);
    if (!actions || actions.size === 0) continue;
    if (canPerform(action, actions)) return true;
  }
  return false;
}

export function assertPortalPermissions(
  req: { portalPermissions?: PortalPermissionState | null },
  resources: string[],
  action: string,
  mode: 'any' | 'all' = 'all',
) {
  const state: PortalPermissionState | null | undefined =
    req?.portalPermissions;
  const allowed =
    mode === 'any'
      ? resources.some((resource) =>
          hasPortalPermission(state, resource, action),
        )
      : resources.every((resource) =>
          hasPortalPermission(state, resource, action),
        );
  if (!allowed) {
    throw new ForbiddenException('Недостаточно прав');
  }
}

const PRODUCT_PROMO_KINDS = new Set(['NTH_FREE', 'FIXED_PRICE']);

export function resolvePromotionResource(payload: {
  rewardType?: PromotionRewardType | null;
  rewardMetadata?: unknown;
}) {
  const rewardType = String(payload?.rewardType || '').toUpperCase();
  if (rewardType === 'DISCOUNT') return 'product_promotions';
  const meta = payload?.rewardMetadata;
  const rewardMeta =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  const productIds = Array.isArray(rewardMeta.productIds)
    ? rewardMeta.productIds
    : [];
  const categoryIds = Array.isArray(rewardMeta.categoryIds)
    ? rewardMeta.categoryIds
    : [];
  const kind =
    typeof rewardMeta.kind === 'string' ? rewardMeta.kind.toUpperCase() : '';
  const isProductPromo =
    PRODUCT_PROMO_KINDS.has(kind) ||
    productIds.length > 0 ||
    categoryIds.length > 0;
  if (isProductPromo) return 'product_promotions';
  return 'points_promotions';
}

export function resolveMechanicResource(type?: string | null) {
  const normalized = String(type || '').toUpperCase();
  switch (normalized) {
    case 'BIRTHDAY':
      return 'mechanic_birthday';
    case 'WINBACK':
      return 'mechanic_auto_return';
    case 'REGISTRATION_BONUS':
      return 'mechanic_registration_bonus';
    case 'EXPIRATION_REMINDER':
      return 'mechanic_ttl';
    case 'REFERRAL':
      return 'mechanic_referral';
    case 'PURCHASE_LIMITS':
      return 'mechanic_redeem_limits';
    case 'TIERS':
      return 'mechanic_levels';
    case 'CUSTOM':
      return 'loyalty';
    default:
      return 'loyalty';
  }
}
