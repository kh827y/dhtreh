import {
  type CustomerRecord,
  type CustomerTransaction,
  type CustomerExpiry,
  type CustomerReview,
  type InvitedCustomer,
  type CustomerInvite,
  type CustomerReferrer,
} from "./data";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TransactionForStats = CustomerTransaction & {
  __sourceDatetime?: string | null;
};

function toNumber(input: unknown, fallback = 0): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function toStringOrNull(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return null;
}

function toOptionalNumber(input: unknown): number | null {
  if (typeof input === "string" && input.trim() === "") return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const nested = pickNumber(record.days, record.value, record.amount, record.count);
      if (nested !== null) return nested;
    }
    const parsed = toOptionalNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeTransaction(input: any): CustomerTransaction {
  return {
    id: String(input?.id ?? ""),
    type: String(input?.type ?? "UNKNOWN"),
    orderId: toStringOrNull(input?.orderId),
    purchaseAmount: toNumber(input?.purchaseAmount),
    change: toNumber(input?.change),
    details: toStringOrNull(input?.details) ?? "Операция с баллами",
    datetime: toStringOrNull(input?.datetime) ?? new Date().toISOString(),
    outlet: toStringOrNull(input?.outlet),
    rating: input?.rating != null ? toNumber(input.rating) : null,
    receiptNumber: toStringOrNull(input?.receiptNumber),
    manager: toStringOrNull(input?.manager),
    carrier: toStringOrNull(input?.carrier),
    carrierCode: toStringOrNull(input?.carrierCode),
    toPay: input?.toPay != null ? toNumber(input.toPay) : null,
    paidByPoints: input?.paidByPoints != null ? toNumber(input.paidByPoints) : null,
    total: input?.total != null ? toNumber(input.total) : null,
    blockedAccrual: Boolean(input?.blockedAccrual),
    receiptId: toStringOrNull(input?.receiptId),
    canceledAt: toStringOrNull(input?.canceledAt),
    canceledBy:
      input?.canceledBy && typeof input.canceledBy === "object"
        ? {
            id: toStringOrNull(input.canceledBy.id) ?? "",
            name:
              toStringOrNull(
                input.canceledBy.name ??
                  input.canceledBy.fullName ??
                  input.canceledBy.login,
              ) ?? null,
          }
        : null,
    note: toStringOrNull(input?.note),
    kind: toStringOrNull(input?.kind),
    earnAmount: toOptionalNumber(input?.earnAmount),
    redeemAmount: toOptionalNumber(input?.redeemAmount),
    referralCustomerId: toStringOrNull(input?.referralCustomerId),
    referralCustomerName: toStringOrNull(input?.referralCustomerName),
    referralCustomerPhone: toStringOrNull(input?.referralCustomerPhone),
  };
}

function hasPositiveValue(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function transactionDateForStats(transaction: TransactionForStats): Date | null {
  const source = transaction.__sourceDatetime ?? transaction.datetime;
  if (!transaction.__sourceDatetime) return null;
  if (!source) return null;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computePurchaseStats(
  transactions: TransactionForStats[],
  visitsHint: number | null | undefined,
): {
  purchaseCount: number;
  lastPurchaseDays: number | null;
  frequencyDays: number | null;
} {
  const purchases = transactions.filter((txn) => {
    if (txn.canceledAt) return false;
    const type = typeof txn.type === "string" ? txn.type.toLowerCase() : "";
    const kind = typeof txn.kind === "string" ? txn.kind.toLowerCase() : "";
    const orderId = typeof txn.orderId === "string" ? txn.orderId.trim().toLowerCase() : "";
    if (orderId === "registration_bonus") return false;
    if (kind.includes("registration")) return false;
    if (type === "refund" || kind === "refund" || /возврат/.test(kind)) {
      return false;
    }
    if (
      hasPositiveValue(txn.total) ||
      hasPositiveValue(txn.purchaseAmount) ||
      hasPositiveValue(txn.toPay)
    ) {
      return true;
    }
    if (["earn", "purchase", "order", "sale"].includes(type)) return true;
    if (/(purchase|order|sale|покуп)/.test(kind)) return true;
    return false;
  });

  const datedPurchases = purchases
    .map((txn) => transactionDateForStats(txn))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  const purchaseCount = purchases.length;
  const lastPurchaseAt = datedPurchases[datedPurchases.length - 1] ?? null;
  const firstPurchaseAt = datedPurchases[0] ?? null;

  const lastPurchaseDays = lastPurchaseAt
    ? Math.max(0, Math.floor((Date.now() - lastPurchaseAt.getTime()) / MS_PER_DAY))
    : null;

  let frequencyDays: number | null = null;
  const visitsFromHint =
    visitsHint != null && Number.isFinite(visitsHint) ? Math.max(0, Math.round(visitsHint)) : 0;

  if (firstPurchaseAt && lastPurchaseAt && datedPurchases.length >= 2) {
    const spanDays = Math.max(
      0,
      Math.round((lastPurchaseAt.getTime() - firstPurchaseAt.getTime()) / MS_PER_DAY),
    );
    if (spanDays > 0) {
      const effectiveVisits = Math.max(datedPurchases.length, visitsFromHint || 0);
      if (effectiveVisits >= 2) {
        frequencyDays = Math.max(1, Math.round(spanDays / (effectiveVisits - 1)));
      }
    }
  }

  return { purchaseCount, lastPurchaseDays, frequencyDays };
}

function normalizeExpiry(input: any): CustomerExpiry {
  return {
    id: String(input?.id ?? ""),
    accrualDate: toStringOrNull(input?.accrualDate) ?? "",
    expiresAt: toStringOrNull(input?.expiresAt),
    amount: Math.max(0, toNumber(input?.amount)),
    status: input?.status === "PENDING" ? "PENDING" : "ACTIVE",
  };
}

function normalizeReview(input: any): CustomerReview {
  return {
    id: String(input?.id ?? ""),
    outlet: toStringOrNull(input?.outlet),
    rating: input?.rating != null ? toNumber(input.rating) : null,
    comment: toStringOrNull(input?.comment),
    createdAt: toStringOrNull(input?.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeInvited(input: any): InvitedCustomer {
  return {
    id: String(input?.id ?? ""),
    name: toStringOrNull(input?.name),
    phone: toStringOrNull(input?.phone),
    joinedAt: toStringOrNull(input?.joinedAt),
    purchases: input?.purchases != null ? toNumber(input.purchases) : null,
  };
}

function normalizeInvite(input: any): CustomerInvite | null {
  if (!input) return null;
  const code = toStringOrNull(input.code ?? input.inviteCode);
  const link = toStringOrNull(input.link ?? input.inviteLink);
  if (!code && !link) return null;
  return {
    code: code ?? null,
    link: link ?? null,
  };
}

function normalizeReferrer(input: any): CustomerReferrer | null {
  if (!input) return null;
  const id = toStringOrNull(input.id);
  if (!id) return null;
  return {
    id,
    name: toStringOrNull(input.name ?? input.fullName ?? input.login) ?? null,
    phone: toStringOrNull(input.phone),
  };
}

function sanitizePhone(input: any): string {
  const str = toStringOrNull(input) ?? "";
  return str.trim();
}

export function normalizeCustomer(input: any): CustomerRecord {
  const phone = sanitizePhone(input?.phone ?? input?.login ?? "");
  const firstName = toStringOrNull(input?.firstName);
  const lastName = toStringOrNull(input?.lastName);
  const birthday = toStringOrNull(input?.birthday);
  const registeredAt = toStringOrNull(input?.registeredAt ?? input?.createdAt);

  const visitFrequencyDaysRaw = pickNumber(
    input?.visitFrequencyDays,
    input?.visitFrequencyInterval,
    input?.visitFrequency,
    Array.isArray(input?.customerStats) ? input.customerStats[0]?.visitFrequencyDays : undefined,
  );

  const rawTransactions = Array.isArray(input?.transactions) ? input.transactions : [];
  const transactions: CustomerTransaction[] = [];
  const transactionsForStats: TransactionForStats[] = [];
  for (const raw of rawTransactions) {
    const normalized = normalizeTransaction(raw);
    transactions.push(normalized);
    transactionsForStats.push({
      ...normalized,
      __sourceDatetime: toStringOrNull(raw?.datetime),
    });
  }
  const expiry = Array.isArray(input?.expiry)
    ? input.expiry
        .map(normalizeExpiry)
        .filter((item: CustomerExpiry) => item.amount > 0 && item.expiresAt)
    : [];
  const reviews = Array.isArray(input?.reviews)
    ? input.reviews.map(normalizeReview)
    : [];
  const invited = Array.isArray(input?.invited)
    ? input.invited.map(normalizeInvited)
    : [];

  const tags = Array.isArray(input?.tags)
    ? input.tags.filter((tag: unknown) => typeof tag === "string").map((tag: string) => tag.trim()).filter(Boolean)
    : [];

  const visitsFromApiRaw = toOptionalNumber(input?.visits ?? input?.purchaseCount);
  const purchaseStats = computePurchaseStats(transactionsForStats, visitsFromApiRaw);
  const visitsFromApi = visitsFromApiRaw != null ? Math.max(0, Math.round(visitsFromApiRaw)) : null;
  const visits = visitsFromApi != null ? visitsFromApi : purchaseStats.purchaseCount;

  let visitFrequencyDays =
    visitFrequencyDaysRaw != null ? Math.max(0, Math.round(visitFrequencyDaysRaw)) : null;
  if (visitFrequencyDays == null && purchaseStats.frequencyDays != null) {
    visitFrequencyDays = purchaseStats.frequencyDays;
  }

  const daysSinceLastPurchaseRaw = pickNumber(
    input?.daysSinceLastVisit,
    input?.daysSinceLastPurchase,
    input?.lastPurchaseDays,
    Array.isArray(input?.customerStats) ? input.customerStats[0]?.daysSinceLastPurchase : undefined,
  );
  let daysSinceLastVisit =
    daysSinceLastPurchaseRaw != null ? Math.max(0, Math.round(daysSinceLastPurchaseRaw)) : null;
  if (daysSinceLastVisit == null && purchaseStats.lastPurchaseDays != null) {
    daysSinceLastVisit = purchaseStats.lastPurchaseDays;
  }

  return {
    id: String(input?.id ?? ""),
    login: phone || (toStringOrNull(input?.email ?? input?.id) ?? ""),
    phone: phone || null,
    email: toStringOrNull(input?.email),
    firstName,
    lastName,
    gender: input?.gender === "male" || input?.gender === "female" ? input.gender : "unknown",
    birthday,
    age: input?.age != null ? toNumber(input.age) : null,
    daysSinceLastVisit,
    visitFrequencyDays,
    visits,
    visitFrequency: null,
    averageCheck: Math.max(0, toNumber(input?.averageCheck)),
    bonusBalance: Math.max(0, toNumber(input?.balance ?? input?.bonusBalance)),
    pendingBalance: Math.max(0, toNumber(input?.pendingBalance)),
    spendPreviousMonth: Math.max(0, toNumber(input?.spendPreviousMonth)),
    spendCurrentMonth: Math.max(0, toNumber(input?.spendCurrentMonth)),
    spendTotal: Math.max(0, toNumber(input?.spendTotal)),
    tags,
    registeredAt,
    erasedAt: toStringOrNull(input?.erasedAt),
    comment: toStringOrNull(input?.comment),
    blocked: Boolean(input?.accrualsBlocked ?? input?.blocked),
    redeemBlocked: Boolean(
      (input as any)?.redemptionsBlocked ?? (input as any)?.redeemBlocked,
    ),
    referrer: normalizeReferrer(input?.referrer),
    invite: normalizeInvite(input?.invite ?? { inviteCode: input?.inviteCode, inviteLink: input?.inviteLink }),
    transactions,
    expiry,
    reviews,
    invited,
    levelName: toStringOrNull(input?.levelName ?? input?.level),
    levelId: toStringOrNull(input?.levelId),
    group: toStringOrNull(input?.group),
    customerNumber: toStringOrNull(input?.customerNumber),
    earnRateBps:
      input?.earnRateBps != null
        ? Math.max(0, Math.floor(Number(input.earnRateBps)))
        : null,
  };
}
