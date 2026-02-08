import { Prisma } from '@prisma/client';

/**
 * Canonical receipt validity policy for analytics/KPI queries:
 * - positive total
 * - receipt not canceled
 * - no active REFUND transaction with the same orderId
 *
 * Uses canonical aliases used across the codebase:
 * - receipt alias: r
 * - refund transaction alias: refund
 */
export const VALID_RECEIPT_NO_REFUND_SQL = Prisma.sql`
  r."total" > 0
  AND r."canceledAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Transaction" refund
    WHERE refund."merchantId" = r."merchantId"
      AND refund."orderId" = r."orderId"
      AND refund."type" = 'REFUND'
      AND refund."canceledAt" IS NULL
  )
`;

/**
 * Canonical active-customer + valid receipt policy.
 * Requires customer alias "c" in the query.
 */
export const VALID_ACTIVE_CUSTOMER_RECEIPT_SQL = Prisma.sql`
  c."erasedAt" IS NULL
  AND ${VALID_RECEIPT_NO_REFUND_SQL}
`;

