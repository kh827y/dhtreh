import { ForbiddenException } from '@nestjs/common';
import { LoyaltyMechanicType, PromotionRewardType } from '@prisma/client';

type PortalPermissionState = {
  allowAll?: boolean;
  resources?: Map<string, Set<string>> | Record<string, any>;
};

const EDIT_ACTIONS = new Set(['create', 'update', 'delete', 'manage', '*']);

const LEGACY_RESOURCE_ALIASES: Record<string, string[]> = {
  products: ['loyalty'],
  categories: ['loyalty'],
  audiences: ['loyalty'],
  customers: ['loyalty'],
  points_promotions: ['loyalty'],
  product_promotions: ['loyalty'],
  promocodes: ['loyalty'],
  telegram_notifications: ['loyalty'],
  broadcasts: ['loyalty'],
  system_settings: ['loyalty'],
  feedback: ['loyalty'],
  staff_motivation: ['loyalty'],
  antifraud: ['loyalty'],
  cashier_panel: ['loyalty'],
  import: ['loyalty'],
  integrations: ['loyalty'],
  rfm_analysis: ['analytics'],
  analytics: ['analytics'],
  staff: ['staff'],
  access_groups: ['staff'],
  outlets: ['outlets'],
  wallet: ['loyalty'],
  mechanic_birthday: ['loyalty'],
  mechanic_auto_return: ['loyalty'],
  mechanic_levels: ['loyalty'],
  mechanic_redeem_limits: ['loyalty'],
  mechanic_registration_bonus: ['loyalty'],
  mechanic_ttl: ['loyalty'],
  mechanic_referral: ['loyalty'],
};

function normalizeResource(value: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAction(value: string) {
  return String(value || '').trim().toLowerCase();
}

function toActionSet(raw: any): Set<string> | null {
  if (!raw) return null;
  if (raw instanceof Set) {
    return new Set(Array.from(raw).map((action) => normalizeAction(action)));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((action) => normalizeAction(action)));
  }
  if (raw && typeof raw === 'object') {
    return new Set(
      Object.keys(raw)
        .filter((key) => raw[key])
        .map((key) => normalizeAction(key)),
    );
  }
  return null;
}

function readActions(state: PortalPermissionState, resource: string): Set<string> | null {
  if (!state?.resources) return null;
  const key = normalizeResource(resource);
  if (state.resources instanceof Map) {
    return toActionSet(state.resources.get(key));
  }
  const raw = (state.resources as Record<string, any>)[key];
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
  const resourcesToCheck = [
    normalizedResource,
    ...(LEGACY_RESOURCE_ALIASES[normalizedResource] || []),
  ];
  for (const key of resourcesToCheck) {
    const actions = readActions(state, key);
    if (!actions || actions.size === 0) continue;
    if (canPerform(action, actions)) return true;
  }
  return false;
}

export function assertPortalPermissions(
  req: any,
  resources: string[],
  action: string,
  mode: 'any' | 'all' = 'all',
) {
  const state: PortalPermissionState | null | undefined = req?.portalPermissions;
  const allowed =
    mode === 'any'
      ? resources.some((resource) => hasPortalPermission(state, resource, action))
      : resources.every((resource) => hasPortalPermission(state, resource, action));
  if (!allowed) {
    throw new ForbiddenException('Недостаточно прав');
  }
}

const PRODUCT_PROMO_KINDS = new Set(['NTH_FREE', 'FIXED_PRICE']);

export function resolvePromotionResource(payload: {
  rewardType?: PromotionRewardType | string | null;
  rewardMetadata?: any;
}) {
  const rewardType = String(payload?.rewardType || '').toUpperCase();
  if (rewardType === 'DISCOUNT') return 'product_promotions';
  const meta = payload?.rewardMetadata;
  const rewardMeta = meta && typeof meta === 'object' ? meta : {};
  const productIds = Array.isArray((rewardMeta as any).productIds)
    ? (rewardMeta as any).productIds
    : [];
  const categoryIds = Array.isArray((rewardMeta as any).categoryIds)
    ? (rewardMeta as any).categoryIds
    : [];
  const kind = String((rewardMeta as any).kind || '').toUpperCase();
  const isProductPromo =
    PRODUCT_PROMO_KINDS.has(kind) || productIds.length > 0 || categoryIds.length > 0;
  if (isProductPromo) return 'product_promotions';
  return 'points_promotions';
}

export function resolveMechanicResource(type?: LoyaltyMechanicType | string | null) {
  const normalized = String(type || '').toUpperCase();
  switch (normalized) {
    case LoyaltyMechanicType.BIRTHDAY:
      return 'mechanic_birthday';
    case LoyaltyMechanicType.WINBACK:
      return 'mechanic_auto_return';
    case LoyaltyMechanicType.REGISTRATION_BONUS:
      return 'mechanic_registration_bonus';
    case LoyaltyMechanicType.EXPIRATION_REMINDER:
      return 'mechanic_ttl';
    case LoyaltyMechanicType.REFERRAL:
      return 'mechanic_referral';
    case LoyaltyMechanicType.PURCHASE_LIMITS:
      return 'mechanic_redeem_limits';
    case LoyaltyMechanicType.TIERS:
      return 'mechanic_levels';
    case LoyaltyMechanicType.CUSTOM:
      return 'loyalty';
    default:
      return 'loyalty';
  }
}
