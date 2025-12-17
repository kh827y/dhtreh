export type PromotionRedeemParticipant = {
  promotionId: string;
  customerId: string;
  joinedAt: Date;
  pointsIssued: number | null;
};

export type PromotionRedeemReceipt = {
  customerId: string;
  createdAt: Date;
  redeemApplied: number | null;
  total: number | null;
};

export type PromotionRedeemRevenue = {
  series: number[];
  dates: string[];
  netTotal: number;
  redeemedTotal: number;
  grossTotal: number;
};

export function computePromotionRedeemRevenueFromData(
  participants: PromotionRedeemParticipant[],
  receipts: PromotionRedeemReceipt[],
): Map<string, PromotionRedeemRevenue> {
  const result = new Map<string, PromotionRedeemRevenue>();
  if (!participants.length || !receipts.length) return result;

  const sortedParticipants = [...participants]
    .filter((p) => p?.promotionId && p?.customerId && p?.joinedAt instanceof Date)
    .sort((a, b) =>
      a.customerId === b.customerId
        ? a.joinedAt.getTime() - b.joinedAt.getTime()
        : a.customerId.localeCompare(b.customerId),
    );

  const participantsByCustomer = new Map<
    string,
    Array<{ promotionId: string; joinedAt: Date; remaining: number }>
  >();

  sortedParticipants.forEach((p) => {
    const remaining = Math.max(0, Number(p.pointsIssued ?? 0));
    const list = participantsByCustomer.get(p.customerId) ?? [];
    list.push({ promotionId: p.promotionId, joinedAt: p.joinedAt, remaining });
    participantsByCustomer.set(p.customerId, list);
  });

  const receiptsByCustomer = new Map<string, PromotionRedeemReceipt[]>();
  receipts.forEach((r) => {
    if (!r?.customerId) return;
    if (!(r.createdAt instanceof Date)) return;
    const list = receiptsByCustomer.get(r.customerId) ?? [];
    list.push(r);
    receiptsByCustomer.set(r.customerId, list);
  });

  const buckets = new Map<
    string,
    {
      byDay: Map<string, { net: number; redeemed: number }>;
      netTotal: number;
      redeemedTotal: number;
    }
  >();

  participantsByCustomer.forEach((customerPromos, customerId) => {
    customerPromos.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    const customerReceipts = receiptsByCustomer
      .get(customerId)
      ?.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (!customerReceipts?.length) return;

    customerReceipts.forEach((receipt) => {
      const totalRedeem = Math.max(0, Number(receipt.redeemApplied ?? 0));
      if (!totalRedeem) return;
      const cashPart = Math.max(0, Number(receipt.total ?? 0) - totalRedeem);

      const allocations: Array<{ promo: (typeof customerPromos)[number]; amount: number }> = [];
      let redeemLeft = totalRedeem;

      for (const promo of customerPromos) {
        if (promo.joinedAt > receipt.createdAt) break;
        if (promo.remaining <= 0) continue;
        if (redeemLeft <= 0) break;
        const allocated = Math.min(promo.remaining, redeemLeft);
        promo.remaining -= allocated;
        redeemLeft -= allocated;
        allocations.push({ promo, amount: allocated });
      }

      const promoRedeemTotal = allocations.reduce((acc, cur) => acc + cur.amount, 0);
      if (!promoRedeemTotal) return;

      allocations.forEach(({ promo, amount }) => {
        const share = amount / promoRedeemTotal;
        const netPart = cashPart * share;
        const dayKey = receipt.createdAt.toISOString().slice(0, 10);
        if (!buckets.has(promo.promotionId)) {
          buckets.set(promo.promotionId, { byDay: new Map(), netTotal: 0, redeemedTotal: 0 });
        }
        const bucket = buckets.get(promo.promotionId)!;
        const dayBucket = bucket.byDay.get(dayKey) ?? { net: 0, redeemed: 0 };
        dayBucket.net += netPart;
        dayBucket.redeemed += amount;
        bucket.byDay.set(dayKey, dayBucket);
        bucket.netTotal += netPart;
        bucket.redeemedTotal += amount;
      });
    });
  });

  buckets.forEach((value, promoId) => {
    const days = Array.from(value.byDay.keys()).sort();
    const series = days.map((day) => Math.round(value.byDay.get(day)?.net ?? 0));
    const netTotal = Math.round(value.netTotal);
    const redeemedTotal = Math.round(value.redeemedTotal);
    result.set(promoId, {
      series,
      dates: days,
      netTotal,
      redeemedTotal,
      grossTotal: Math.round(netTotal + redeemedTotal),
    });
  });

  return result;
}

