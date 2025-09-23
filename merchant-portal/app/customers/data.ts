export type Gender = "male" | "female" | "unknown";

export type CustomerRecord = {
  id: string;
  login: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  visitFrequency: string;
  averageCheck: number;
  birthday: string | null;
  age: number | null;
  gender: Gender;
  daysSinceLastVisit: number | null;
  visitCount: number;
  bonusBalance: number;
  pendingBalance: number;
  level: string | null;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  tags: string[];
  registeredAt: string;
  comment: string | null;
  blocked: boolean;
  referrer: string | null;
  group: string | null;
  inviteCode: string | null;
  customerNumber: string | null;
  deviceNumber: string | null;
};

export type CustomerExpiry = {
  id: string;
  accrualDate: string;
  expiresAt: string | null;
  amount: number;
};

export type CustomerTransaction = {
  id: string;
  purchaseAmount: number;
  change: number;
  details: string;
  datetime: string;
  outlet: string | null;
  rating?: number;
  receipt: string | null;
  manager: string | null;
  carrier: string | null;
  carrierCode?: string | null;
  toPay: number;
  paidByPoints: number;
  total: number;
  type: string;
  comment?: string | null;
};

export type CustomerReview = {
  id: string;
  outlet: string | null;
  rating: number;
  comment: string;
  createdAt: string;
};

export type InvitedCustomer = {
  id: string;
  name: string | null;
  login: string | null;
  joinedAt: string | null;
  purchases?: number | null;
};

export type CustomerDetails = CustomerRecord & {
  expiry: CustomerExpiry[];
  transactions: CustomerTransaction[];
  reviews: CustomerReview[];
  invited: InvitedCustomer[];
  metadata: Record<string, any>;
};

export function getFullName(customer: { firstName: string | null; lastName: string | null }): string {
  const parts = [customer.firstName, customer.lastName].filter(Boolean);
  return parts.join(" ") || "";
}

export function normalizeGender(value: string | null | undefined): Gender {
  const lowered = (value || "").toLowerCase();
  if (lowered.startsWith("m")) return "male";
  if (lowered.startsWith("f") || lowered.startsWith("ж")) return "female";
  return "unknown";
}
