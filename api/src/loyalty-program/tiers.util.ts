import type { Prisma } from '@prisma/client';

export interface TierPreset {
  name: string;
  description?: string | null;
  thresholdAmount: number;
  earnRatePercent: number;
  redeemRatePercent: number;
  minPaymentAmount?: number | null;
  isInitial?: boolean;
  isHidden?: boolean;
  color?: string | null;
}

type PrismaClientLike = {
  $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  loyaltyTier: {
    count(args: Prisma.LoyaltyTierCountArgs): Promise<number>;
    create(args: Prisma.LoyaltyTierCreateArgs): Promise<Prisma.LoyaltyTierGetPayload<{ }>>;
    findFirst(args: Prisma.LoyaltyTierFindFirstArgs): Promise<Prisma.LoyaltyTierGetPayload<{ }> | null>;
  };
};

export const DEFAULT_TIER_PRESETS: TierPreset[] = [
  {
    name: 'Базовый',
    description: 'Стартовый уровень лояльности',
    thresholdAmount: 0,
    earnRatePercent: 3,
    redeemRatePercent: 50,
    minPaymentAmount: 0,
    isInitial: true,
    isHidden: false,
  },
  {
    name: 'VIP',
    description: 'Повышенные привилегии для постоянных гостей',
    thresholdAmount: 5000,
    earnRatePercent: 6,
    redeemRatePercent: 70,
    minPaymentAmount: 0,
    isInitial: false,
    isHidden: false,
  },
];

function toBps(percent: number): number {
  return Math.round(percent * 100);
}

export async function ensureDefaultTiers(
  prisma: PrismaClientLike,
  merchantId: string,
): Promise<void> {
  if (!merchantId) return;
  await prisma.$transaction(async (tx) => {
    const total = await tx.loyaltyTier.count({ where: { merchantId } });
    if (total > 0) return;
    for (const [index, preset] of DEFAULT_TIER_PRESETS.entries()) {
      await tx.loyaltyTier.create({
        data: {
          merchantId,
          name: preset.name,
          description: preset.description ?? null,
          thresholdAmount: preset.thresholdAmount,
          earnRateBps: toBps(preset.earnRatePercent),
          redeemRateBps: toBps(preset.redeemRatePercent),
          isInitial: !!preset.isInitial,
          isDefault: !!preset.isInitial,
          isHidden: !!preset.isHidden,
          color: preset.color ?? null,
          metadata:
            preset.minPaymentAmount != null
              ? ({ minPaymentAmount: preset.minPaymentAmount } as Prisma.InputJsonValue)
              : undefined,
          order: index + 1,
        },
      });
    }
  });
}

export function extractTierMinPayment(
  metadata: Prisma.JsonValue | null | undefined,
): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const meta = metadata as Record<string, unknown>;
  const raw = meta?.minPaymentAmount ?? meta?.minPayment;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}
