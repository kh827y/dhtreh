import type { PromotionRewardType, PromotionStatus } from '@prisma/client';

export interface TierPayload {
  name: string;
  description?: string | null;
  thresholdAmount?: number | null;
  earnRatePercent?: number | null;
  redeemRatePercent?: number | null;
  minPaymentAmount?: number | null;
  isInitial?: boolean;
  isHidden?: boolean;
  color?: string | null;
  actorId?: string | null;
}

export interface TierDto {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  thresholdAmount: number;
  earnRateBps: number;
  redeemRateBps: number | null;
  minPaymentAmount: number | null;
  isInitial: boolean;
  isHidden: boolean;
  isDefault: boolean;
  color: string | null;
  customersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TierMemberDto {
  customerId: string;
  name: string | null;
  phone: string | null;
  assignedAt: string;
  source: string | null;
  totalSpent: number | null;
  firstSeenAt: string | null;
}

export interface TierMembersResponse {
  tierId: string;
  total: number;
  items: TierMemberDto[];
  nextCursor: string | null;
}

export interface PromotionPayload {
  name: string;
  description?: string | null;
  segmentId?: string | null;
  targetTierId?: string | null;
  status?: PromotionStatus;
  rewardType: PromotionRewardType;
  rewardValue?: number | null;
  rewardMetadata?: unknown;
  pointsExpireInDays?: number | null;
  pushTemplateStartId?: string | null;
  pushTemplateReminderId?: string | null;
  pushOnStart?: boolean;
  pushReminderEnabled?: boolean;
  reminderOffsetHours?: number | null;
  autoLaunch?: boolean;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  metadata?: unknown;
  actorId?: string;
}

export interface OperationsLogFilters {
  type?: 'PROMO_CODE' | 'PROMOTION';
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
}
