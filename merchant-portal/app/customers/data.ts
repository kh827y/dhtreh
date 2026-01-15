export type Gender = "male" | "female" | "unknown";

export type CustomerReferrer = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type CustomerInvite = {
  code: string | null;
  link: string | null;
};

export type CustomerExpiry = {
  id: string;
  accrualDate: string;
  expiresAt: string | null;
  amount: number;
  status: "ACTIVE" | "PENDING";
};

export type CustomerTransaction = {
  id: string;
  type: string;
  orderId?: string | null;
  purchaseAmount: number;
  change: number;
  details: string;
  datetime: string;
  outlet: string | null;
  rating: number | null;
  receiptNumber: string | null;
  manager: string | null;
  carrier: string | null;
  carrierCode: string | null;
  toPay: number | null;
  paidByPoints: number | null;
  total: number | null;
  blockedAccrual: boolean;
  receiptId?: string | null;
  canceledAt?: string | null;
  canceledBy?: { id: string; name: string | null } | null;
  note?: string | null;
  kind?: string | null;
  earnAmount?: number | null;
  redeemAmount?: number | null;
  referralCustomerId?: string | null;
  referralCustomerName?: string | null;
  referralCustomerPhone?: string | null;
};

export type CustomerReview = {
  id: string;
  outlet: string | null;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

export type InvitedCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  joinedAt: string | null;
  purchases: number | null;
};

export type CustomerRecord = {
  id: string;
  login: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  gender: Gender;
  birthday: string | null;
  age: number | null;
  daysSinceLastVisit: number | null;
  visitFrequencyDays: number | null;
  visits: number;
  visitFrequency?: string | null;
  averageCheck: number;
  bonusBalance: number;
  pendingBalance: number;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  tags: string[];
  registeredAt: string | null;
  erasedAt: string | null;
  comment: string | null;
  blocked: boolean;
  redeemBlocked: boolean;
  referrer?: CustomerReferrer | null;
  invite?: CustomerInvite | null;
  transactions: CustomerTransaction[];
  expiry: CustomerExpiry[];
  reviews: CustomerReview[];
  invited: InvitedCustomer[];
  levelName: string | null;
  levelId?: string | null;
  group?: string | null;
  customerNumber?: string | null;
  earnRateBps?: number | null;
};

export function getFullName(customer: CustomerRecord): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
}
