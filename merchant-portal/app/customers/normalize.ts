import {
  type CustomerRecord,
  type CustomerTransaction,
  type CustomerExpiry,
  type CustomerReview,
  type InvitedCustomer,
  type CustomerInvite,
  type CustomerReferrer,
} from "./data";

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
  };
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
  const visitFrequencyDays =
    visitFrequencyDaysRaw != null ? Math.max(0, visitFrequencyDaysRaw) : null;

  const transactions = Array.isArray(input?.transactions)
    ? input.transactions.map(normalizeTransaction)
    : [];
  const expiry = Array.isArray(input?.expiry)
    ? input.expiry
        .map(normalizeExpiry)
        .filter((item) => item.amount > 0 && item.expiresAt)
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

  const visits = Math.max(0, toNumber(input?.visits ?? input?.purchaseCount));
  let visitFrequencyLabel =
    toStringOrNull(input?.visitFrequencyLabel ?? input?.visitFrequencyText ?? input?.visitFrequencyReadable)?.trim() || null;
  if (!visitFrequencyLabel) {
    const textualFrequency = toStringOrNull(input?.visitFrequency);
    if (textualFrequency && toOptionalNumber(textualFrequency) === null) {
      visitFrequencyLabel = textualFrequency.trim() || null;
    }
  }
  if (!visitFrequencyLabel && visitFrequencyDays != null && visitFrequencyDays !== 0) {
    visitFrequencyLabel = `≈ ${visitFrequencyDays} дн.`;
  }

  const daysSinceLastPurchaseRaw = pickNumber(
    input?.daysSinceLastVisit,
    input?.daysSinceLastPurchase,
    input?.lastPurchaseDays,
    Array.isArray(input?.customerStats) ? input.customerStats[0]?.daysSinceLastPurchase : undefined,
  );
  const daysSinceLastVisit =
    daysSinceLastPurchaseRaw != null ? Math.max(0, Math.round(daysSinceLastPurchaseRaw)) : null;

  return {
    id: String(input?.id ?? ""),
    login: phone || toStringOrNull(input?.email ?? input?.id) ?? "",
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
    visitFrequency: visitFrequencyLabel,
    averageCheck: Math.max(0, toNumber(input?.averageCheck)),
    bonusBalance: Math.max(0, toNumber(input?.balance ?? input?.bonusBalance)),
    pendingBalance: Math.max(0, toNumber(input?.pendingBalance)),
    spendPreviousMonth: Math.max(0, toNumber(input?.spendPreviousMonth)),
    spendCurrentMonth: Math.max(0, toNumber(input?.spendCurrentMonth)),
    spendTotal: Math.max(0, toNumber(input?.spendTotal)),
    tags,
    registeredAt,
    comment: toStringOrNull(input?.comment),
    blocked: Boolean(input?.accrualsBlocked ?? input?.blocked),
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
