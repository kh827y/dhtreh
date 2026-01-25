import { Prisma, WalletType } from '@prisma/client';

export type PortalCustomerReferrerDto = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type PortalCustomerInviteDto = {
  code: string | null;
  link: string | null;
};

export type PortalCustomerExpiryDto = {
  id: string;
  accrualDate: string;
  expiresAt: string | null;
  amount: number;
  status: 'ACTIVE' | 'PENDING';
};

export type PortalCustomerTransactionDto = {
  id: string;
  type: string;
  orderId?: string | null;
  change: number;
  purchaseAmount: number;
  datetime: string;
  details: string;
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

export type PortalCustomerReviewDto = {
  id: string;
  outlet: string | null;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

export type PortalInvitedCustomerDto = {
  id: string;
  name: string | null;
  phone: string | null;
  joinedAt: string | null;
  purchases: number | null;
};

export type PortalCustomerDto = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  birthday: string | null;
  gender: string | null;
  tags: string[];
  balance: number;
  pendingBalance: number;
  visits: number;
  averageCheck: number;
  daysSinceLastVisit: number | null;
  visitFrequencyDays: number | null;
  age: number | null;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  registeredAt: string | null;
  createdAt: string | null;
  erasedAt: string | null;
  comment: string | null;
  accrualsBlocked: boolean;
  redemptionsBlocked?: boolean;
  levelId?: string | null;
  levelName?: string | null;
  levelExpireDays?: number | null;
  referrer?: PortalCustomerReferrerDto | null;
  invite?: PortalCustomerInviteDto | null;
  expiry?: PortalCustomerExpiryDto[];
  transactions?: PortalCustomerTransactionDto[];
  reviews?: PortalCustomerReviewDto[];
  invited?: PortalInvitedCustomerDto[];
  earnRateBps?: number | null;
};

export type ListCustomersQuery = {
  search?: string;
  limit?: number;
  offset?: number;
  segmentId?: string;
  registeredOnly?: boolean;
  excludeMiniapp?: boolean;
};

export type Aggregates = {
  pendingBalance: Map<string, number>;
  spendCurrentMonth: Map<string, number>;
  spendPreviousMonth: Map<string, number>;
  totalSpent: Map<string, number>;
  visitCount: Map<string, number>;
  firstPurchaseAt: Map<string, Date>;
  lastPurchaseAt: Map<string, Date>;
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// После рефактора Customer = per-merchant модель, все поля напрямую
export const customerBaseSelect = (merchantId: string) =>
  ({
    id: true,
    phone: true,
    email: true,
    name: true,
    profileName: true,
    birthday: true,
    gender: true,
    tags: true,
    comment: true,
    accrualsBlocked: true,
    redemptionsBlocked: true,
    createdAt: true,
    updatedAt: true,
    erasedAt: true,
    tierAssignments: {
      where: {
        merchantId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      take: 1,
      select: {
        tier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    wallets: {
      where: { merchantId, type: WalletType.POINTS },
      select: { balance: true },
    },
    customerStats: {
      where: { merchantId },
      select: {
        visits: true,
        totalSpent: true,
        avgCheck: true,
        firstSeenAt: true,
        lastSeenAt: true,
        lastOrderAt: true,
      },
    },
  }) satisfies Prisma.CustomerSelect;

export type CustomerBase = Prisma.CustomerGetPayload<{
  select: ReturnType<typeof customerBaseSelect>;
}>;
