import { Injectable } from '@nestjs/common';
import { Prisma, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics-cache.service';
import { AnalyticsTimezoneService } from '../analytics-timezone.service';
import type {
  BirthdayItem,
  CustomerMetrics,
  CustomerPortraitMetrics,
  DashboardPeriod,
  PurchaseRecencyDistribution,
  RecencyBucket,
  RecencyGrouping,
  RepeatPurchasesMetrics,
  TimeActivityDay,
  TimeActivityHour,
  TimeActivityMetrics,
  TimeHeatmapCell,
} from '../analytics.service';
import type { RussiaTimezone } from '../../../shared/timezone/russia-timezones';
import { VALID_RECEIPT_NO_REFUND_SQL } from '../../../shared/common/valid-receipt-sql.util';

@Injectable()
export class AnalyticsCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCacheService,
    private readonly timezone: AnalyticsTimezoneService,
  ) {}

  private cacheKey(
    prefix: string,
    parts: Array<string | number | null | undefined>,
  ) {
    return [
      prefix,
      ...parts.map((part) => (part == null ? '' : String(part))),
    ].join('|');
  }

  private pluralize(value: number, forms: [string, string, string]): string {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${value} ${forms[2]}`.trim();
    const mod10 = value % 10;
    if (mod10 === 1) return `${value} ${forms[0]}`.trim();
    if (mod10 >= 2 && mod10 <= 4) return `${value} ${forms[1]}`.trim();
    return `${value} ${forms[2]}`.trim();
  }

  /**
   * Портрет клиента: пол, возраст, матрица пол×возраст за период
   */
  async getCustomerPortrait(
    merchantId: string,
    period: DashboardPeriod,
    segmentId?: string,
  ): Promise<CustomerPortraitMetrics> {
    const cacheKey = this.cacheKey('portrait', [
      merchantId,
      segmentId,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<CustomerPortraitMetrics>(cacheKey);
    if (cached) return cached;
    const receipts = await this.prisma.receipt.findMany({
      where: {
        merchantId,
        canceledAt: null,
        total: { gt: 0 },
        createdAt: { gte: period.from, lte: period.to },
        ...(segmentId
          ? {
              customer: {
                segments: { some: { segmentId } },
              },
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, gender: true, birthday: true } },
      },
    });

    const receiptOrderIds = Array.from(
      new Set(
        receipts
          .map((receipt) => receipt.orderId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    let relevantReceipts = receipts;
    if (receiptOrderIds.length > 0) {
      const refundedOrders = await this.prisma.transaction.findMany({
        where: {
          merchantId,
          type: 'REFUND',
          canceledAt: null,
          orderId: { in: receiptOrderIds },
        },
        select: { orderId: true },
      });
      if (refundedOrders.length > 0) {
        const refundSet = new Set(
          refundedOrders
            .map((entry) => entry.orderId)
            .filter((value): value is string => Boolean(value)),
        );
        relevantReceipts = receipts.filter(
          (receipt) => !refundSet.has(receipt.orderId),
        );
      }
    }
    const genderMap = new Map<
      string,
      { customers: Set<string>; transactions: number; revenue: number }
    >();
    const ageMap = new Map<
      number,
      { customers: Set<string>; transactions: number; revenue: number }
    >();
    const sexAgeMap = new Map<
      string,
      { customers: Set<string>; transactions: number; revenue: number }
    >();

    const today = period.to || new Date();
    const normalizeSex = (value: string | null | undefined): string => {
      const v = (value || '').toString().trim().toUpperCase();
      if (
        v === 'M' ||
        v === 'MALE' ||
        v === 'М' ||
        v === 'МУЖ' ||
        v === 'МУЖСКОЙ'
      )
        return 'M';
      if (
        v === 'F' ||
        v === 'FEMALE' ||
        v === 'Ж' ||
        v === 'ЖЕН' ||
        v === 'ЖЕНСКИЙ'
      )
        return 'F';
      return 'U';
    };

    const clampAge = (value: number | null): number | null => {
      if (value == null || Number.isNaN(value)) return null;
      if (value < 0) return 0;
      if (value > 100) return 100;
      return value;
    };

    for (const receipt of relevantReceipts) {
      const customerId = receipt.customerId;
      const sex = normalizeSex(receipt.customer?.gender);
      const bday = receipt.customer?.birthday || null;
      const age = bday
        ? Math.floor(
            (today.getTime() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;
      const ageValue = clampAge(age);
      const total = Math.max(0, receipt.total || 0);

      if (!genderMap.has(sex))
        genderMap.set(sex, {
          customers: new Set(),
          transactions: 0,
          revenue: 0,
        });
      const g = genderMap.get(sex)!;
      if (customerId) g.customers.add(customerId);
      g.transactions++;
      g.revenue += total;

      if (ageValue != null) {
        if (!ageMap.has(ageValue))
          ageMap.set(ageValue, {
            customers: new Set(),
            transactions: 0,
            revenue: 0,
          });
        const a = ageMap.get(ageValue)!;
        if (customerId) a.customers.add(customerId);
        a.transactions++;
        a.revenue += total;

        const key = `${sex}:${ageValue}`;
        if (!sexAgeMap.has(key))
          sexAgeMap.set(key, {
            customers: new Set(),
            transactions: 0,
            revenue: 0,
          });
        const sa = sexAgeMap.get(key)!;
        if (customerId) sa.customers.add(customerId);
        sa.transactions++;
        sa.revenue += total;
      }
    }

    const gender = Array.from(genderMap.entries())
      .map(([sex, v]) => ({
        sex,
        customers: v.customers.size,
        transactions: v.transactions,
        revenue: Math.round(v.revenue),
        averageCheck:
          v.transactions > 0 ? Math.round(v.revenue / v.transactions) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const age: Array<{
      age: number;
      customers: number;
      transactions: number;
      revenue: number;
      averageCheck: number;
    }> = [];
    for (let value = 0; value <= 100; value++) {
      const bucket = ageMap.get(value);
      const revenue = bucket ? bucket.revenue : 0;
      const transactions = bucket ? bucket.transactions : 0;
      age.push({
        age: value,
        customers: bucket ? bucket.customers.size : 0,
        transactions,
        revenue: Math.round(revenue),
        averageCheck: transactions > 0 ? Math.round(revenue / transactions) : 0,
      });
    }

    const sexAgeOrder: Record<string, number> = { M: 0, F: 1, U: 2 };
    const sexAge = Array.from(sexAgeMap.entries())
      .map(([key, v]) => {
        const [sex, ageRaw] = key.split(':');
        const ageValue = Number(ageRaw);
        const revenue = v.revenue;
        return {
          sex,
          age: Number.isFinite(ageValue) ? ageValue : 0,
          customers: v.customers.size,
          transactions: v.transactions,
          revenue: Math.round(revenue),
          averageCheck:
            v.transactions > 0 ? Math.round(v.revenue / v.transactions) : 0,
        };
      })
      .sort((a, b) => {
        if (a.age !== b.age) return a.age - b.age;
        const aOrder = sexAgeOrder[a.sex] ?? 3;
        const bOrder = sexAgeOrder[b.sex] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.sex.localeCompare(b.sex);
      });

    const result = { gender, age, sexAge };
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Повторные продажи и распределение покупок на клиента за период
   */
  async getRepeatPurchases(
    merchantId: string,
    period: DashboardPeriod,
    outletId?: string,
  ): Promise<RepeatPurchasesMetrics> {
    const cacheKey = this.cacheKey('repeat', [
      merchantId,
      outletId,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<RepeatPurchasesMetrics>(cacheKey);
    if (cached) return cached;
    const outletFilter = outletId && outletId !== 'all' ? outletId : null;
    const purchases = await this.prisma.$queryRaw<
      Array<{ customerId: string; purchases: bigint | number | null }>
    >(Prisma.sql`
      SELECT
        r."customerId" AS "customerId",
        COUNT(*)::bigint AS purchases
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${period.from}
        AND r."createdAt" <= ${period.to}
        AND ${VALID_RECEIPT_NO_REFUND_SQL}
        ${outletFilter ? Prisma.sql`AND r."outletId" = ${outletFilter}` : Prisma.sql``}
      GROUP BY r."customerId"
    `);
    const buyers = purchases
      .map((row) => ({
        customerId: row.customerId,
        purchases: Number(row.purchases ?? 0),
      }))
      .filter((row) => Boolean(row.customerId) && row.purchases > 0);
    const uniqueBuyers = buyers.length;
    const repeatBuyers = buyers.filter((row) => row.purchases >= 2).length;
    const histogramMap = new Map<number, number>();
    for (const entry of buyers) {
      histogramMap.set(
        entry.purchases,
        (histogramMap.get(entry.purchases) ?? 0) + 1,
      );
    }
    const histogram = Array.from(histogramMap.entries())
      .map(([count, customers]) => ({
        purchases: count,
        customers,
      }))
      .sort((a, b) => a.purchases - b.purchases);
    const [newBuyersRow] = await this.prisma.$queryRaw<
      Array<{ count: number }>
    >(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT
          r."customerId" AS customer_id,
          MIN(r."createdAt") AS first_purchase
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND ${VALID_RECEIPT_NO_REFUND_SQL}
          AND r."customerId" IS NOT NULL
          ${outletFilter ? Prisma.sql`AND r."outletId" = ${outletFilter}` : Prisma.sql``}
        GROUP BY r."customerId"
        HAVING MIN(r."createdAt") BETWEEN ${period.from} AND ${period.to}
      ) AS first_orders
    `);
    const newBuyers = Number(newBuyersRow?.count ?? 0);
    const result = { uniqueBuyers, newBuyers, repeatBuyers, histogram };
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Ближайшие дни рождения
   */
  async getBirthdays(
    merchantId: string,
    withinDays = 30,
    limit = 100,
    timezone?: string | RussiaTimezone,
  ): Promise<BirthdayItem[]> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('birthdays', [
      merchantId,
      tz.code,
      withinDays,
      limit,
    ]);
    const cached = this.cache.get<BirthdayItem[]>(cacheKey);
    if (cached) return cached;
    const offsetMs = tz.utcOffsetMinutes * 60 * 1000;
    const now = new Date();
    const localNow = new Date(now.getTime() + offsetMs);
    const localYear = localNow.getUTCFullYear();
    const localMonth = localNow.getUTCMonth();
    const localDay = localNow.getUTCDate();
    const localTodayEpoch = Date.UTC(localYear, localMonth, localDay);
    const endLocalEpoch = localTodayEpoch + withinDays * 24 * 60 * 60 * 1000;

    const customers = await this.prisma.customer.findMany({
      where: {
        birthday: { not: null },
        wallets: { some: { merchantId } },
        erasedAt: null,
      },
      select: { id: true, name: true, phone: true, birthday: true },
    });

    const items: BirthdayItem[] = [];
    for (const c of customers) {
      const birthday = c.birthday!;
      const birthMonth = birthday.getUTCMonth();
      const birthDay = birthday.getUTCDate();
      let nextLocalEpoch = Date.UTC(localYear, birthMonth, birthDay);
      if (nextLocalEpoch < localTodayEpoch) {
        nextLocalEpoch = Date.UTC(localYear + 1, birthMonth, birthDay);
      }
      if (nextLocalEpoch <= endLocalEpoch) {
        const nextBirthdayUtc = new Date(nextLocalEpoch - offsetMs);
        const age =
          new Date(nextLocalEpoch).getUTCFullYear() - birthday.getUTCFullYear();
        items.push({
          customerId: c.id,
          name: c.name || undefined,
          phone: c.phone || undefined,
          nextBirthday: nextBirthdayUtc.toISOString(),
          age,
        });
      }
    }
    items.sort((a, b) => a.nextBirthday.localeCompare(b.nextBirthday));
    const result = items.slice(0, limit);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Метрики клиентов
   */
  async getCustomerMetrics(
    merchantId: string,
    period: DashboardPeriod,
  ): Promise<CustomerMetrics> {
    const cacheKey = this.cacheKey('customers', [
      merchantId,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<CustomerMetrics>(cacheKey);
    if (cached) return cached;
    const totalCustomers = await this.prisma.customer.count({
      where: { merchantId },
    });

    const newCustomers = await this.prisma.customer.count({
      where: {
        merchantId,
        createdAt: { gte: period.from, lte: period.to },
      },
    });

    const [activeRow] = await this.prisma.$queryRaw<
      Array<{ count: bigint | number | null }>
    >(Prisma.sql`
      SELECT COUNT(DISTINCT r."customerId")::bigint AS count
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${period.from}
        AND r."createdAt" <= ${period.to}
        AND ${VALID_RECEIPT_NO_REFUND_SQL}
    `);
    const activeCustomers = Number(activeRow?.count || 0);

    const visits = await this.prisma.$queryRaw<
      Array<{ visits: bigint | number | null }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS visits
      FROM "Receipt" r
      WHERE r."merchantId" = ${merchantId}
        AND r."createdAt" >= ${period.from}
        AND r."createdAt" <= ${period.to}
        AND ${VALID_RECEIPT_NO_REFUND_SQL}
      GROUP BY r."customerId"
    `);
    const visitsTotal = visits.reduce(
      (sum, row) => sum + Number(row.visits || 0),
      0,
    );
    const averageVisits = visits.length > 0 ? visitsTotal / visits.length : 0;

    const inactiveCustomers = Math.max(0, totalCustomers - activeCustomers);
    const churnRate =
      totalCustomers > 0 ? (inactiveCustomers / totalCustomers) * 100 : 0;
    const retentionRate = 100 - churnRate;

    const ltv = await this.calculateCustomerLTV(merchantId);

    const topCustomers = await this.getTopCustomers(merchantId, 10);

    const result = {
      totalCustomers,
      newCustomers,
      activeCustomers,
      churnRate: Math.round(churnRate * 10) / 10,
      retentionRate: Math.round(retentionRate * 10) / 10,
      customerLifetimeValue: Math.round(ltv),
      averageVisitsPerCustomer: Math.round(averageVisits * 10) / 10,
      topCustomers,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getPurchaseRecencyDistribution(
    merchantId: string,
    group: RecencyGrouping,
    rawLimit?: number,
    timezone?: string | RussiaTimezone,
  ): Promise<PurchaseRecencyDistribution> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('recency', [
      merchantId,
      tz.code,
      group,
      rawLimit,
    ]);
    const cached = this.cache.get<PurchaseRecencyDistribution>(cacheKey);
    if (cached) return cached;
    const offsetInterval = Prisma.sql`${tz.utcOffsetMinutes} * interval '1 minute'`;
    const normalizedGroup: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const defaults: Record<RecencyGrouping, number> = {
      day: 30,
      week: 10,
      month: 5,
    };
    const maximums: Record<RecencyGrouping, number> = {
      day: 365,
      week: 52,
      month: 12,
    };
    const limit = Math.max(
      1,
      Math.min(
        rawLimit ?? defaults[normalizedGroup],
        maximums[normalizedGroup],
      ),
    );

    const rows = await this.prisma.$queryRaw<
      Array<{ days: number; customers: number }>
    >(Prisma.sql`
      SELECT
        GREATEST(
          0,
          (DATE(NOW() + ${offsetInterval}) - DATE("lastOrderAt" + ${offsetInterval}))
        )::int AS days,
        COUNT(*)::int AS customers
      FROM "CustomerStats"
      WHERE "merchantId" = ${merchantId}
        AND "lastOrderAt" IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const bucketsMap = new Map<number, number>();

    const mapToBucket = (days: number): number => {
      if (normalizedGroup === 'day') return days;
      if (normalizedGroup === 'week') {
        if (days <= 0) return 0;
        const base = Math.floor(days / 7);
        return days % 7 === 0 ? Math.max(base - 1, 0) : base;
      }
      if (days <= 0) return 0;
      const base = Math.floor(days / 30);
      return days % 30 === 0 ? Math.max(base - 1, 0) : base;
    };

    for (const row of rows) {
      const bucket = mapToBucket(Number(row.days || 0));
      if (bucket < 0 || bucket >= limit) continue;
      const current = bucketsMap.get(bucket) ?? 0;
      bucketsMap.set(bucket, current + Number(row.customers || 0));
    }

    const buckets: RecencyBucket[] = [];
    for (let index = 0; index < limit; index++) {
      const customers = bucketsMap.get(index) ?? 0;
      if (normalizedGroup === 'day') {
        buckets.push({
          index,
          value: index,
          label: String(index),
          customers,
        });
        continue;
      }
      if (normalizedGroup === 'week') {
        const value = index + 1;
        buckets.push({
          index,
          value,
          label: this.pluralize(value, ['неделя', 'недели', 'недель']),
          customers,
        });
        continue;
      }
      const value = index + 1;
      buckets.push({
        index,
        value,
        label: this.pluralize(value, ['месяц', 'месяца', 'месяцев']),
        customers,
      });
    }

    const totalCustomers = buckets.reduce(
      (acc, bucket) => acc + bucket.customers,
      0,
    );

    const result = {
      group: normalizedGroup,
      buckets,
      totalCustomers,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  async getTimeActivityMetrics(
    merchantId: string,
    period: DashboardPeriod,
    timezone?: string | RussiaTimezone,
  ): Promise<TimeActivityMetrics> {
    const tz = await this.timezone.getTimezoneInfo(merchantId, timezone);
    const cacheKey = this.cacheKey('time-activity', [
      merchantId,
      tz.code,
      period.from.toISOString(),
      period.to.toISOString(),
    ]);
    const cached = this.cache.get<TimeActivityMetrics>(cacheKey);
    if (cached) return cached;
    const offsetInterval = Prisma.sql`${tz.utcOffsetMinutes} * interval '1 minute'`;
    const validReceiptExclusion = Prisma.sql`AND ${VALID_RECEIPT_NO_REFUND_SQL}`;
    const [dayRows, hourRows, cellRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          dow: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(ISODOW FROM (r."createdAt" + ${offsetInterval}))::int AS dow,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          ${validReceiptExclusion}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<
        Array<{
          hour: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(HOUR FROM (r."createdAt" + ${offsetInterval}))::int AS hour,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          ${validReceiptExclusion}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<
        Array<{
          dow: number;
          hour: number;
          orders: number;
          customers: number;
          revenue: number;
        }>
      >(Prisma.sql`
        SELECT
          EXTRACT(ISODOW FROM (r."createdAt" + ${offsetInterval}))::int AS dow,
          EXTRACT(HOUR FROM (r."createdAt" + ${offsetInterval}))::int AS hour,
          COUNT(*)::int AS orders,
          COUNT(DISTINCT r."customerId")::int AS customers,
          COALESCE(SUM(r."total"), 0)::int AS revenue
        FROM "Receipt" r
        WHERE r."merchantId" = ${merchantId}
          AND r."createdAt" BETWEEN ${period.from} AND ${period.to}
          ${validReceiptExclusion}
        GROUP BY 1, 2
      `),
    ]);

    const hoursRange = Array.from({ length: 24 }, (_, idx) => idx);
    const isoWeekDays = Array.from({ length: 7 }, (_, idx) => idx + 1); // 1..7

    const cellMap = new Map<string, TimeHeatmapCell>();

    for (const row of cellRows) {
      const day = Math.min(Math.max(Number(row.dow || 1), 1), 7);
      const hour = Math.min(Math.max(Number(row.hour || 0), 0), 23);
      const orders = Math.max(0, Number(row.orders || 0));
      const revenue = Math.max(0, Number(row.revenue || 0));
      const customers = Math.max(0, Number(row.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      const key = `${day}:${hour}`;
      cellMap.set(key, { day, hour, orders, customers, revenue, averageCheck });
    }

    const dayOfWeek: TimeActivityDay[] = isoWeekDays.map((day) => {
      const row = dayRows.find((item) => Number(item.dow || 0) === day);
      const orders = Math.max(0, Number(row?.orders || 0));
      const revenue = Math.max(0, Number(row?.revenue || 0));
      const customers = Math.max(0, Number(row?.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      return { day, orders, revenue, customers, averageCheck };
    });

    const hours: TimeActivityHour[] = hoursRange.map((hour) => {
      const row = hourRows.find((item) => Number(item.hour || 0) === hour);
      const orders = Math.max(0, Number(row?.orders || 0));
      const revenue = Math.max(0, Number(row?.revenue || 0));
      const customers = Math.max(0, Number(row?.customers || 0));
      const averageCheck = orders > 0 ? revenue / orders : 0;
      return { hour, orders, revenue, customers, averageCheck };
    });

    const heatmap: TimeHeatmapCell[] = [];
    for (const day of isoWeekDays) {
      for (const hour of hoursRange) {
        const key = `${day}:${hour}`;
        const existing = cellMap.get(key);
        if (existing) {
          heatmap.push(existing);
        } else {
          heatmap.push({
            day,
            hour,
            orders: 0,
            customers: 0,
            revenue: 0,
            averageCheck: 0,
          });
        }
      }
    }

    const result = { dayOfWeek, hours, heatmap };
    this.cache.set(cacheKey, result);
    return result;
  }

  private async calculateCustomerLTV(merchantId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        totalSpent: Prisma.Decimal | number | null;
        customers: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r."total"), 0)::numeric AS "totalSpent",
        COUNT(DISTINCT r."customerId")::bigint AS customers
      FROM "Receipt" r
      JOIN "Customer" c
        ON c."id" = r."customerId"
       AND c."merchantId" = r."merchantId"
      WHERE r."merchantId" = ${merchantId}
        AND ${VALID_RECEIPT_NO_REFUND_SQL}
        AND c."erasedAt" IS NULL
    `);

    const customers = Number(row?.customers ?? 0);
    if (customers <= 0) return 0;
    return Number(row?.totalSpent ?? 0) / customers;
  }

  private async getTopCustomers(
    merchantId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      name?: string;
      phone?: string;
      totalSpent: number;
      visits: number;
      lastVisit: Date;
      loyaltyPoints: number;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        customerId: string;
        name: string | null;
        phone: string | null;
        totalSpent: Prisma.Decimal | number | null;
        visits: bigint | number | null;
        lastVisit: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        r."customerId" AS "customerId",
        c."name" AS "name",
        c."phone" AS "phone",
        COALESCE(SUM(r."total"), 0)::numeric AS "totalSpent",
        COUNT(*)::bigint AS visits,
        MAX(r."createdAt") AS "lastVisit"
      FROM "Receipt" r
      JOIN "Customer" c
        ON c."id" = r."customerId"
       AND c."merchantId" = r."merchantId"
      WHERE r."merchantId" = ${merchantId}
        AND ${VALID_RECEIPT_NO_REFUND_SQL}
        AND c."erasedAt" IS NULL
      GROUP BY r."customerId", c."name", c."phone"
      ORDER BY "totalSpent" DESC, "lastVisit" DESC
      LIMIT ${Math.max(1, limit)}
    `);

    const ids = rows.map((row) => row.customerId).filter(Boolean);
    if (ids.length === 0) return [];

    const wallets = await this.prisma.wallet.findMany({
      where: {
        merchantId,
        customerId: { in: ids },
        type: WalletType.POINTS,
        customer: { erasedAt: null },
      },
      select: { customerId: true, balance: true },
    });
    const wMap = new Map(wallets.map((w) => [w.customerId, w.balance || 0]));

    return rows.map((row) => {
      const total = Math.max(0, Number(row.totalSpent ?? 0));
      const visits = Number(row.visits ?? 0);
      const lastVisit = row.lastVisit ?? new Date(0);
      const loyaltyPoints = wMap.get(row.customerId) || 0;
      return {
        id: row.customerId,
        name: row.name || undefined,
        phone: row.phone || undefined,
        totalSpent: total,
        visits,
        lastVisit,
        loyaltyPoints,
      };
    });
  }
}
