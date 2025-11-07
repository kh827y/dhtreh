import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

@Injectable()
export class AnalyticsAggregatorWorker {
  private readonly logger = new Logger(AnalyticsAggregatorWorker.name);
  constructor(private prisma: PrismaService) {}

  // Ежедневная агрегация KPI за вчерашний день
  @Cron('0 2 * * *')
  async aggregateDailyKpis() {
    const today = new Date();
    const day = new Date(today);
    day.setDate(day.getDate() - 1); // вчера
    day.setHours(0, 0, 0, 0);

    await this.aggregateForDate(day);
  }

  // Публичный метод для ручного запуска (можно дергать из скриптов/команд)
  async aggregateForDate(dayStart: Date) {
    const from = startOfDay(dayStart);
    const to = endOfDay(dayStart);

    const merchants = await this.prisma.merchant.findMany({
      select: { id: true },
    });

    for (const m of merchants) {
      try {
        await this.aggregateMerchantDaily(m.id, from, to);
        await this.recalculateCustomerStats(m.id);
      } catch (e) {
        this.logger.error(
          `Failed to aggregate for merchant ${m.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async aggregateMerchantDaily(
    merchantId: string,
    from: Date,
    to: Date,
  ) {
    // revenue/transactionCount/pointsIssued/pointsRedeemed
    const [earnSum, redeemSum, earnCount, earnRedeemCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { merchantId, type: 'EARN', createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          merchantId,
          type: 'REDEEM',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { merchantId, type: 'EARN', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.transaction.count({
        where: {
          merchantId,
          type: { in: ['EARN', 'REDEEM'] },
          createdAt: { gte: from, lte: to },
        },
      }),
    ]);

    const revenue = Math.abs(earnSum._sum.amount || 0);
    const transactionCount = earnRedeemCount;
    const averageCheck = transactionCount > 0 ? revenue / transactionCount : 0;
    const pointsIssued = Math.abs(earnSum._sum.amount || 0);
    const pointsRedeemed = Math.abs(redeemSum._sum.amount || 0);

    const [newCustomers, activeCustomers] = await Promise.all([
      this.prisma.wallet.count({
        where: { merchantId, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.transaction
        .groupBy({
          by: ['customerId'],
          where: { merchantId, createdAt: { gte: from, lte: to } },
        })
        .then((x) => x.length),
    ]);

    await this.prisma.merchantKpiDaily.upsert({
      where: { merchantId_date: { merchantId, date: from } as any },
      update: {
        revenue,
        transactionCount,
        averageCheck,
        newCustomers,
        activeCustomers,
        pointsIssued,
        pointsRedeemed,
      },
      create: {
        merchantId,
        date: from,
        revenue,
        transactionCount,
        averageCheck,
        newCustomers,
        activeCustomers,
        pointsIssued,
        pointsRedeemed,
      },
    });
  }

  // Пересчет CustomerStats целиком (v1 простая реализация)
  private async recalculateCustomerStats(merchantId: string) {
    // Получим базовые данные: firstSeenAt из wallet.createdAt, а также визиты/спенд из receipt
    const wallets = await this.prisma.wallet.findMany({
      where: { merchantId },
      select: { customerId: true, createdAt: true },
    });
    const firstSeenMap = new Map<string, Date>();
    for (const w of wallets) {
      const prev = firstSeenMap.get(w.customerId);
      if (!prev || prev > w.createdAt)
        firstSeenMap.set(w.customerId, w.createdAt);
    }

    const receipts = await this.prisma.receipt.groupBy({
      by: ['customerId'],
      where: { merchantId, total: { gt: 0 }, canceledAt: null },
      _sum: { total: true },
      _count: { id: true },
      _max: { createdAt: true },
      _min: { createdAt: true },
    });

    // Подготовим массивы для R/F/M
    const stats: Array<{
      customerId: string;
      visits: number;
      totalSpent: number;
      lastOrderAt?: Date;
      firstSeenAt?: Date;
    }> = [];

    for (const r of receipts) {
      stats.push({
        customerId: r.customerId,
        visits: r._count.id || 0,
        totalSpent: r._sum.total || 0,
        lastOrderAt: r._max.createdAt || undefined,
        firstSeenAt: firstSeenMap.get(r.customerId),
      });
    }

    // Добавим тех, у кого есть только кошелек, но еще нет чеков
    for (const [customerId, firstSeenAt] of firstSeenMap.entries()) {
      if (!stats.find((s) => s.customerId === customerId)) {
        stats.push({
          customerId,
          visits: 0,
          totalSpent: 0,
          lastOrderAt: undefined,
          firstSeenAt,
        });
      }
    }

    // Рассчитать RFM квантилями (простая версия)
    const today = new Date();
    const recencies: number[] = [];
    const freqs: number[] = [];
    const mons: number[] = [];

    const derived = stats.map((s) => {
      const daysSince = s.lastOrderAt
        ? Math.max(
            0,
            Math.floor((today.getTime() - s.lastOrderAt.getTime()) / 86400000),
          )
        : 99999;
      recencies.push(daysSince);
      freqs.push(s.visits);
      mons.push(s.totalSpent);
      return { ...s, daysSince };
    });

    function quantiles(values: number[]) {
      const arr = values.slice().sort((a, b) => a - b);
      const q = (p: number) =>
        arr.length
          ? arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))]
          : 0;
      return { q20: q(0.2), q40: q(0.4), q60: q(0.6), q80: q(0.8) };
    }

    const qR = quantiles(recencies);
    const qF = quantiles(freqs);
    const qM = quantiles(mons);

    function scoreRecency(v: number) {
      // чем меньше давность, тем ближе балл к 5 (перенумеруем далее)
      if (v <= qR.q20) return 5;
      if (v <= qR.q40) return 4;
      if (v <= qR.q60) return 3;
      if (v <= qR.q80) return 2;
      return 1;
    }
    function scoreAsc(
      v: number,
      qs: { q20: number; q40: number; q60: number; q80: number },
    ) {
      // большее значение → выше балл (до инверсии 6 - score)
      if (v <= qs.q20) return 1;
      if (v <= qs.q40) return 2;
      if (v <= qs.q60) return 3;
      if (v <= qs.q80) return 4;
      return 5;
    }

    for (const s of derived) {
      const recencyScore = scoreRecency(s.daysSince);
      const freqScore = scoreAsc(s.visits, qF);
      const moneyScore = scoreAsc(s.totalSpent, qM);
      const rfmR = 6 - recencyScore;
      const rfmF = 6 - freqScore;
      const rfmM = 6 - moneyScore;
      const rfmScore = rfmR * 100 + rfmF * 10 + rfmM; // классический RFM код
      const rfmClass = `${rfmR}-${rfmF}-${rfmM}`;

      const avgCheck = s.visits > 0 ? s.totalSpent / s.visits : 0;

      await this.prisma.customerStats.upsert({
        where: {
          merchantId_customerId: {
            merchantId,
            customerId: s.customerId,
          } as any,
        },
        update: {
          firstSeenAt: s.firstSeenAt ?? undefined,
          lastSeenAt: new Date(),
          lastOrderAt: s.lastOrderAt ?? null,
          visits: s.visits,
          totalSpent: s.totalSpent,
          avgCheck,
          rfmR,
          rfmF,
          rfmM,
          rfmScore,
          rfmClass,
        },
        create: {
          merchantId,
          customerId: s.customerId,
          firstSeenAt: s.firstSeenAt ?? new Date(),
          lastSeenAt: new Date(),
          lastOrderAt: s.lastOrderAt ?? null,
          visits: s.visits,
          totalSpent: s.totalSpent,
          avgCheck,
          rfmR,
          rfmF,
          rfmM,
          rfmScore,
          rfmClass,
        },
      });
    }
  }
}
