export type TransactionKind =
  | "earn"
  | "redeem"
  | "promo"
  | "campaign"
  | "refund"
  | "adjust"
  | "referral"
  | "burn"
  | "complimentary"
  | "other";

export type TransactionMeta = { title: string; kind: TransactionKind };

export function getTransactionMeta(type: string, source?: string | null): TransactionMeta {
  const sourceUpper =
    typeof source === "string" && source.trim().length > 0 ? source.trim().toUpperCase() : null;
  if (sourceUpper === "COMPLIMENTARY") {
    return { title: "Начислено администратором", kind: "complimentary" };
  }
  if (sourceUpper === "REFERRAL_ROLLBACK") {
    return { title: "Возврат реферала", kind: "referral" };
  }
  if (sourceUpper === "MANUAL_ACCRUAL") {
    return { title: "Начисление", kind: "earn" };
  }
  const lower = type.toLowerCase();
  if (lower === "adjust") return { title: "Баллы сгорели", kind: "burn" };
  if (lower.includes('referral')) return { title: 'Реферальная программа', kind: 'referral' };
  if (lower.includes('registration')) return { title: 'Бонус за регистрацию', kind: 'earn' };
  if (lower.includes("promo")) return { title: "Промокод", kind: "promo" };
  if (lower.includes("campaign") || lower.includes("promotion")) {
    return { title: "Акция", kind: "campaign" };
  }
  if (lower.includes("refund") || lower.includes("return")) {
    return { title: "Возврат", kind: "refund" };
  }
  if (lower.includes("adjust")) {
    return { title: "Корректировка", kind: "adjust" };
  }
  if (lower.includes("redeem") || lower.includes("spend")) {
    return { title: "Списание", kind: "redeem" };
  }
  if (lower.includes("earn") || lower.includes("accrual")) {
    return { title: "Начисление", kind: "earn" };
  }
  return { title: type, kind: "other" };
}
