import type { LoyaltyPromotion, Prisma, PromotionStatus } from '@prisma/client';

export type CampaignType =
  | 'BONUS'
  | 'DISCOUNT'
  | 'CASHBACK'
  | 'BIRTHDAY'
  | 'REFERRAL'
  | 'FIRST_PURCHASE';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export type CampaignNotificationChannel = 'SMS' | 'TELEGRAM' | 'PUSH';

export interface CampaignRules {
  minPurchaseAmount?: number;
  maxPurchaseAmount?: number;
  productCategories?: string[];
  dayOfWeek?: number[];
  timeFrom?: string;
  timeTo?: string;
  outlets?: string[];
  customerStatus?: ('NEW' | 'REGULAR' | 'VIP')[];
  minTransactionCount?: number;
  birthdayRange?: number;
}

export interface CampaignReward {
  type: 'POINTS' | 'PERCENT' | 'FIXED' | 'PRODUCT';
  value: number;
  maxValue?: number;
  multiplier?: number;
  productId?: string;
  description?: string;
}

export interface CreateCampaignDto {
  merchantId: string;
  name: string;
  description?: string;
  type: CampaignType;
  status?: CampaignStatus;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  targetSegmentId?: string | null;
  rules: CampaignRules;
  reward: CampaignReward;
  budget?: number | null;
  maxUsagePerCustomer?: number | null;
  maxUsageTotal?: number | null;
  notificationChannels?: CampaignNotificationChannel[];
  metadata?: any;
}

export interface LegacyCampaignDto {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  targetSegmentId?: string | null;
  segmentId?: string | null;
  rules: CampaignRules;
  reward: CampaignReward;
  budget?: number | null;
  maxUsagePerCustomer?: number | null;
  maxUsageTotal?: number | null;
  notificationChannels: CampaignNotificationChannel[];
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

type PromotionWithRelations = Prisma.LoyaltyPromotionGetPayload<{
  include?: {
    audience?: true;
  };
}>;

function asCampaignNotificationChannels(value: any): CampaignNotificationChannel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item === 'SMS' || item === 'TELEGRAM' || item === 'PUSH') return item;
      return null;
    })
    .filter((item): item is CampaignNotificationChannel => item !== null);
}

function toNumber(value: any): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function toNumberOrNull(value: any): number | null | undefined {
  if (value == null) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCampaignRules(raw: any): CampaignRules {
  if (!raw || typeof raw !== 'object') return {};
  const rules = raw as Record<string, any>;
  const result: CampaignRules = {};
  const minPurchaseAmount = toNumber(rules.minPurchaseAmount);
  if (minPurchaseAmount != null) result.minPurchaseAmount = minPurchaseAmount;
  const maxPurchaseAmount = toNumber(rules.maxPurchaseAmount);
  if (maxPurchaseAmount != null) result.maxPurchaseAmount = maxPurchaseAmount;
  if (Array.isArray(rules.productCategories)) {
    result.productCategories = rules.productCategories.map(String);
  }
  if (Array.isArray(rules.dayOfWeek)) {
    result.dayOfWeek = rules.dayOfWeek
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value)) as number[];
  }
  if (typeof rules.timeFrom === 'string') result.timeFrom = rules.timeFrom;
  if (typeof rules.timeTo === 'string') result.timeTo = rules.timeTo;
  if (Array.isArray(rules.outlets)) result.outlets = rules.outlets.map(String);
  if (Array.isArray(rules.customerStatus)) {
    result.customerStatus = rules.customerStatus
      .map((value) => (value === 'NEW' || value === 'REGULAR' || value === 'VIP' ? value : null))
      .filter((value): value is 'NEW' | 'REGULAR' | 'VIP' => value !== null);
  }
  const minTransactionCount = toNumber(rules.minTransactionCount);
  if (minTransactionCount != null) result.minTransactionCount = minTransactionCount;
  const birthdayRange = toNumber(rules.birthdayRange);
  if (birthdayRange != null) result.birthdayRange = birthdayRange;
  return result;
}

function normalizeCampaignReward(raw: any): CampaignReward {
  if (raw && typeof raw === 'object') {
    const reward = raw as Record<string, any>;
    const type = reward.type;
    const normalizedType: CampaignReward['type'] =
      type === 'POINTS' || type === 'PERCENT' || type === 'FIXED' || type === 'PRODUCT'
        ? type
        : 'POINTS';
    return {
      type: normalizedType,
      value: Number.isFinite(reward.value) ? Number(reward.value) : 0,
      maxValue: toNumberOrNull(reward.maxValue) ?? undefined,
      multiplier: toNumberOrNull(reward.multiplier) ?? undefined,
      productId: reward.productId ? String(reward.productId) : undefined,
      description: typeof reward.description === 'string' ? reward.description : undefined,
    };
  }
  return {
    type: 'POINTS',
    value: 0,
  };
}

function promotionStatusToCampaignStatus(status: PromotionStatus | null | undefined): CampaignStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'PAUSED':
      return 'PAUSED';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'DRAFT';
  }
}

function extractLegacyMetadata(source: LoyaltyPromotion): Record<string, any> {
  const raw: any = (source as any).metadata ?? {};
  if (raw && typeof raw === 'object' && raw.legacyCampaign && typeof raw.legacyCampaign === 'object') {
    return raw.legacyCampaign as Record<string, any>;
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

export function transformPromotionEntity(entity: PromotionWithRelations): LegacyCampaignDto {
  const legacy = extractLegacyMetadata(entity);
  const rules = normalizeCampaignRules(legacy.rules ?? {});
  const rewardSource = legacy.reward ?? (entity.rewardMetadata ?? {});
  const reward = normalizeCampaignReward({ ...rewardSource, type: rewardSource?.type ?? legacy.type ?? entity.rewardType });
  const notificationChannels = asCampaignNotificationChannels(
    legacy.notificationChannels ?? legacy.channels ?? [],
  );
  return {
    id: entity.id,
    merchantId: entity.merchantId,
    name: entity.name,
    description: entity.description ?? undefined,
    type: (legacy.type as CampaignType) ?? 'BONUS',
    status: promotionStatusToCampaignStatus(entity.status),
    startDate: (legacy.startDate ? new Date(legacy.startDate) : entity.startAt) ?? null,
    endDate: (legacy.endDate ? new Date(legacy.endDate) : entity.endAt) ?? null,
    targetSegmentId: legacy.targetSegmentId ?? entity.segmentId ?? null,
    segmentId: entity.segmentId ?? null,
    rules,
    reward,
    budget: legacy.budget ?? null,
    maxUsagePerCustomer: legacy.maxUsagePerCustomer ?? null,
    maxUsageTotal: legacy.maxUsageTotal ?? null,
    notificationChannels,
    metadata: entity.metadata ?? undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    archivedAt: entity.archivedAt ?? undefined,
  };
}

export function toLegacyCampaignDto(source: PromotionWithRelations | LoyaltyPromotion): LegacyCampaignDto {
  return transformPromotionEntity(source as PromotionWithRelations);
}
