import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface ReceiptAggregateRow {
  customerId: string;
  visits: number;
  totalSpent: number;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
}

interface ReceiptAggregateParams {
  merchantId: string;
  customerIds?: string[];
  period?: { from: Date; to: Date; inclusiveEnd?: boolean };
}

export async function fetchReceiptAggregates(
  prisma: PrismaService,
  params: ReceiptAggregateParams,
): Promise<ReceiptAggregateRow[]> {
  const normalizedIds = params.customerIds
    ?.map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));

  const customerClause =
    normalizedIds && normalizedIds.length
      ? Prisma.sql`AND r."customerId" IN (${Prisma.join(
          normalizedIds.map((id) => Prisma.sql`${id}`),
        )})`
      : Prisma.sql``;

  const periodClause = params.period
    ? params.period.inclusiveEnd === false
      ? Prisma.sql`AND r."createdAt" >= ${params.period.from} AND r."createdAt" < ${params.period.to}`
      : Prisma.sql`AND r."createdAt" >= ${params.period.from} AND r."createdAt" <= ${params.period.to}`
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<
    Array<{
      customerId: string;
      visits: bigint | number | null;
      totalSpent: Prisma.Decimal | number | null;
      firstPurchaseAt: Date | null;
      lastPurchaseAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT
      r."customerId" AS "customerId",
      COUNT(*)::bigint AS "visits",
      COALESCE(SUM(r."total"), 0)::numeric AS "totalSpent",
      MIN(r."createdAt") AS "firstPurchaseAt",
      MAX(r."createdAt") AS "lastPurchaseAt"
    FROM "Receipt" r
    WHERE r."merchantId" = ${params.merchantId}
      AND r."total" > 0
      AND r."canceledAt" IS NULL
      ${periodClause}
      ${customerClause}
      AND NOT EXISTS (
        SELECT 1
        FROM "Transaction" refund
        WHERE refund."merchantId" = r."merchantId"
          AND refund."orderId" = r."orderId"
          AND refund."type" = 'REFUND'
          AND refund."canceledAt" IS NULL
      )
    GROUP BY r."customerId"
  `);

  return rows
    .map((row) => ({
      customerId: row.customerId,
      visits: Number(row.visits ?? 0),
      totalSpent: Number(row.totalSpent ?? 0),
      firstPurchaseAt: row.firstPurchaseAt ?? null,
      lastPurchaseAt: row.lastPurchaseAt ?? null,
    }))
    .filter((row) => Boolean(row.customerId));
}
