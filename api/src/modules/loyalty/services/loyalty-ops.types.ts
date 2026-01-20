import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

export type QrMeta =
  | { jti: string; iat: number; exp: number; kind?: 'jwt' | 'short' | 'plain' }
  | undefined;

export type IntegrationBonusParams = {
  merchantId: string;
  customerId: string;
  userToken?: string | null;
  invoiceNum?: string | null;
  idempotencyKey: string;
  total?: number | null;
  paidBonus?: number | null;
  bonusValue?: number | null;
  outletId?: string | null;
  deviceId?: string | null;
  resolvedDeviceId?: string | null;
  staffId?: string | null;
  operationDate?: Date | null;
  requestId?: string | null;
  items?: PositionInput[];
};

export type IntegrationBonusResult = {
  receiptId: string;
  orderId: string;
  invoiceNum: string | null;
  redeemApplied: number;
  earnApplied: number;
  balanceBefore: number | null;
  balanceAfter: number;
  alreadyProcessed: boolean;
};

export type PositionInput = {
  productId?: string;
  externalId?: string;
  name?: string;
  qty: number;
  price: number;
  basePrice?: number;
  accruePoints?: boolean;
  actionIds?: string[];
  actionNames?: string[];
};

export type ResolvedPosition = PositionInput & {
  amount: number;
  categoryId?: string | null;
  resolvedProductId?: string | null;
  resolvedCategoryId?: string | null;
  promotionId?: string | null;
  promotionMultiplier: number;
  earnPoints?: number;
  redeemAmount?: number;
  accruePoints: boolean;
  redeemPercent?: number;
  basePrice?: number;
  allowEarnAndPay?: boolean;
  pointPromotions?: ActivePromotionRule[];
  appliedPromotionIds?: string[];
  appliedPointPromotionId?: string | null;
  promotionPointsBonus?: number;
};

export type ActivePromotionRule = {
  id: string;
  name: string;
  kind: 'POINTS_MULTIPLIER' | 'NTH_FREE' | 'FIXED_PRICE';
  pointsRuleType?: 'multiplier' | 'percent' | 'fixed';
  pointsValue?: number;
  segmentId?: string | null;
  usageLimit?:
    | 'unlimited'
    | 'once_per_client'
    | 'once_per_day'
    | 'once_per_week'
    | 'once_per_month'
    | null;
  buyQty?: number;
  freeQty?: number;
  fixedPrice?: number;
  productIds: Set<string>;
  categoryIds: Set<string>;
};

export type PrismaTx = Prisma.TransactionClient;
export type PrismaClientLike = PrismaTx | PrismaService;
export type OptionalModelsClient = PrismaClientLike & {
  merchantSettings?: PrismaService['merchantSettings'];
  earnLot?: PrismaService['earnLot'];
  loyaltyRealtimeEvent?: {
    findMany?: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
};
