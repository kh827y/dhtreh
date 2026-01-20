import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../core/prisma/prisma.service';

const BASE_TIER_PRESET = {
  name: 'Base',
  thresholdAmount: 0,
  earnRateBps: 300,
  redeemRateBps: 5000,
  minPaymentAmount: 0,
};

export type EnsureBaseTierResult = {
  id: string;
  merchantId: string;
  name: string;
};

export async function ensureBaseTier(
  prisma: PrismaService,
  merchantId: string,
): Promise<EnsureBaseTierResult | null> {
  const normalized = (merchantId || '').trim();
  if (!normalized) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyTier.findFirst({
        where: { merchantId: normalized, isInitial: true },
      });
      if (existing) return existing;
      const minOrder = await tx.loyaltyTier.aggregate({
        where: { merchantId: normalized },
        _min: { order: true },
      });
      const baseOrder =
        typeof minOrder?._min?.order === 'number'
          ? Math.min(minOrder._min.order - 1, 0)
          : 0;
      return tx.loyaltyTier.create({
        data: {
          merchantId: normalized,
          name: BASE_TIER_PRESET.name,
          description: 'Базовый уровень по умолчанию',
          thresholdAmount: BASE_TIER_PRESET.thresholdAmount,
          earnRateBps: BASE_TIER_PRESET.earnRateBps,
          redeemRateBps: BASE_TIER_PRESET.redeemRateBps,
          isInitial: true,
          isDefault: true,
          isHidden: false,
          metadata: { minPaymentAmount: BASE_TIER_PRESET.minPaymentAmount },
          order: baseOrder,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      const fallback = await prisma.loyaltyTier.findFirst({
        where: { merchantId: normalized, isInitial: true },
      });
      if (fallback) return fallback;
    }
    throw error;
  }
}

export function isHiddenTier(tier: { isHidden?: boolean | null }): boolean {
  return Boolean(tier?.isHidden);
}

export function toLevelRule(tier: {
  name: string;
  thresholdAmount?: number | null;
  earnRateBps?: number | null;
  redeemRateBps?: number | null;
  metadata?: unknown;
  isHidden?: boolean | null;
}) {
  const minPaymentValue = (() => {
    if (!tier.metadata || typeof tier.metadata !== 'object') return null;
    const meta = tier.metadata as Record<string, unknown>;
    const raw = meta.minPaymentAmount ?? meta.minPayment;
    if (raw == null) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
  })();
  return {
    name: tier.name,
    threshold: Math.max(0, Number(tier.thresholdAmount ?? 0) || 0),
    earnRateBps:
      tier.earnRateBps != null
        ? Math.max(0, Math.round(Number(tier.earnRateBps)))
        : undefined,
    redeemRateBps:
      tier.redeemRateBps != null
        ? Math.max(0, Math.round(Number(tier.redeemRateBps)))
        : undefined,
    minPaymentAmount: minPaymentValue,
    isHidden: isHiddenTier(tier),
  };
}

export const baseTierPreset = BASE_TIER_PRESET;
