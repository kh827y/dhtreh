import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

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
  includeImportedBase?: boolean;
}

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export async function fetchReceiptAggregates(
  prisma: PrismaClientLike,
  params: ReceiptAggregateParams,
): Promise<ReceiptAggregateRow[]> {
  const normalizedIds = params.customerIds
    ?.map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
  const useImportedBase = params.includeImportedBase === true && !params.period;

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

  const joinClause = useImportedBase
    ? Prisma.sql`LEFT JOIN "CustomerStats" cs ON cs."merchantId" = r."merchantId" AND cs."customerId" = r."customerId"`
    : Prisma.sql``;
  const customerJoin = Prisma.sql`JOIN "Customer" c ON c."id" = r."customerId" AND c."merchantId" = r."merchantId"`;
  const importBoundaryClause = useImportedBase
    ? Prisma.sql`AND (cs."importedLastPurchaseAt" IS NULL OR r."createdAt" > cs."importedLastPurchaseAt")`
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
    ${customerJoin}
    ${joinClause}
    WHERE r."merchantId" = ${params.merchantId}
      AND c."erasedAt" IS NULL
      AND r."total" > 0
      AND r."canceledAt" IS NULL
      ${periodClause}
      ${customerClause}
      ${importBoundaryClause}
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

  const receiptRows = rows
    .map((row) => ({
      customerId: row.customerId,
      visits: Number(row.visits ?? 0),
      totalSpent: Number(row.totalSpent ?? 0),
      firstPurchaseAt: row.firstPurchaseAt ?? null,
      lastPurchaseAt: row.lastPurchaseAt ?? null,
    }))
    .filter((row) => Boolean(row.customerId));

  if (!useImportedBase) return receiptRows;

  const importWhere: Prisma.CustomerStatsWhereInput = {
    merchantId: params.merchantId,
    customer: { erasedAt: null },
    OR: [
      { importedTotalSpent: { not: null } },
      { importedVisits: { not: null } },
      { importedLastPurchaseAt: { not: null } },
    ],
  };
  if (normalizedIds && normalizedIds.length) {
    importWhere.customerId = { in: normalizedIds };
  }

  const importedRows = await prisma.customerStats.findMany({
    where: importWhere,
    select: {
      customerId: true,
      importedTotalSpent: true,
      importedVisits: true,
      importedLastPurchaseAt: true,
    },
  });

  const merged = new Map<string, ReceiptAggregateRow>();
  for (const row of receiptRows) {
    merged.set(row.customerId, { ...row });
  }

  const maxDate = (a: Date | null, b: Date | null) => {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  };

  for (const row of importedRows) {
    const customerId = row.customerId;
    if (!customerId) continue;
    const baseVisits = Math.max(0, Number(row.importedVisits ?? 0));
    const baseTotal = Math.max(0, Number(row.importedTotalSpent ?? 0));
    const baseLast = row.importedLastPurchaseAt ?? null;
    const existing = merged.get(customerId);
    if (existing) {
      existing.visits += baseVisits;
      existing.totalSpent += baseTotal;
      existing.lastPurchaseAt = maxDate(existing.lastPurchaseAt, baseLast);
      continue;
    }
    merged.set(customerId, {
      customerId,
      visits: baseVisits,
      totalSpent: baseTotal,
      firstPurchaseAt: null,
      lastPurchaseAt: baseLast,
    });
  }

  return Array.from(merged.values());
}
