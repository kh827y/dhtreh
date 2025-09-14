import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CampaignCronService {
  private readonly logger = new Logger(CampaignCronService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ежедневная обработка ДР-кампаний (BIRTHDAY)
   * Запуск: каждый день в 09:00 по серверному времени
   */
  @Cron('0 9 * * *')
  async processBirthdayCampaigns() {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(now); endOfDay.setHours(23,59,59,999);

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'BIRTHDAY',
        status: { in: ['ACTIVE', 'active'] },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
    });

    for (const campaign of campaigns) {
      const reward = (campaign.reward as any) || {};
      if (!reward || reward.type !== 'POINTS' || !Number(reward.value)) {
        continue; // выдаём только фиксированные баллы в рамках планировщика
      }
      // Предвычислим оставшиеся лимиты кампании
      const [totalUsageCount, totalRewardSum] = await Promise.all([
        this.prisma.campaignUsage.count({ where: { campaignId: campaign.id } }),
        this.prisma.campaignUsage.aggregate({ where: { campaignId: campaign.id }, _sum: { rewardValue: true } }),
      ]);
      let remainingTotal = campaign.maxUsageTotal ? Math.max(0, campaign.maxUsageTotal - totalUsageCount) : Number.POSITIVE_INFINITY;
      let remainingBudget = campaign.budget ? Math.max(0, campaign.budget - ((totalRewardSum._sum.rewardValue as number) || 0)) : Number.POSITIVE_INFINITY;
      if (remainingTotal <= 0 || remainingBudget <= 0) continue;

      const segmentId = (campaign as any).targetSegmentId || (campaign as any).segmentId || null;

      // Итерация по целевым клиентам батчами
      const batch = 500;
      if (segmentId) {
        let cursor: { id: string } | undefined = undefined;
        while (true) {
          const links = await this.prisma.segmentCustomer.findMany({
            where: { segmentId },
            select: { id: true, customerId: true },
            orderBy: { id: 'asc' },
            take: batch,
            ...(cursor ? { skip: 1, cursor } : {}),
          });
          if (!links.length) break;
          await this.processBirthdayForCustomers(campaign, links.map(l => l.customerId), reward.value, startOfDay, endOfDay, now, () => {
            remainingTotal--; remainingBudget -= reward.value;
            return remainingTotal > 0 && remainingBudget > 0;
          });
          cursor = { id: links[links.length - 1].id };
          if (!(remainingTotal > 0 && remainingBudget > 0)) break;
        }
      } else {
        // Все клиенты мерчанта (по наличию кошелька у мерчанта)
        let cursor: { id: string } | undefined = undefined;
        while (true) {
          const customers = await this.prisma.customer.findMany({
            where: { wallets: { some: { merchantId: campaign.merchantId } } },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: batch,
            ...(cursor ? { skip: 1, cursor } : {}),
          });
          if (!customers.length) break;
          await this.processBirthdayForCustomers(campaign, customers.map(c => c.id), reward.value, startOfDay, endOfDay, now, () => {
            remainingTotal--; remainingBudget -= reward.value;
            return remainingTotal > 0 && remainingBudget > 0;
          });
          cursor = { id: customers[customers.length - 1].id };
          if (!(remainingTotal > 0 && remainingBudget > 0)) break;
        }
      }
    }
  }
  /**
   * Рег‑бонус (FIRST_PURCHASE/Welcome): раз в день выдаём фикс. баллы новым клиентам
   * Запуск: каждый день в 09:15
   * Условия:
   *  - type = 'FIRST_PURCHASE' (фикс. баллы)
   *  - клиент создан сегодня (по серверному времени)
   *  - нет транзакций
   *  - не было usage по этой кампании
   * Примечание: это базовая реализация «welcome». Вариант «первой покупки» можно делать в runtime при транзакции.
   */
  @Cron('15 9 * * *')
  async processWelcomeCampaigns() {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(now); endOfDay.setHours(23,59,59,999);

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'FIRST_PURCHASE',
        status: { in: ['ACTIVE', 'active'] },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
    });

    for (const campaign of campaigns) {
      const reward = (campaign.reward as any) || {};
      if (!reward || reward.type !== 'POINTS' || !Number(reward.value)) continue;

      const segmentId = (campaign as any).targetSegmentId || (campaign as any).segmentId || null;

      // Предвычислим бюджет/лимиты
      const [totalUsageCount, totalRewardSum] = await Promise.all([
        this.prisma.campaignUsage.count({ where: { campaignId: campaign.id } }),
        this.prisma.campaignUsage.aggregate({ where: { campaignId: campaign.id }, _sum: { rewardValue: true } }),
      ]);
      let remainingTotal = campaign.maxUsageTotal ? Math.max(0, campaign.maxUsageTotal - totalUsageCount) : Number.POSITIVE_INFINITY;
      let remainingBudget = campaign.budget ? Math.max(0, campaign.budget - ((totalRewardSum._sum.rewardValue as number) || 0)) : Number.POSITIVE_INFINITY;
      if (remainingTotal <= 0 || remainingBudget <= 0) continue;

      // Ищем новых клиентов за сегодня без транзакций и без usage по кампании
      const batch = 500;
      let cursor: { id: string } | undefined = undefined;
      while (true) {
        const customers = await this.prisma.customer.findMany({
          where: {
            createdAt: { gte: startOfDay, lte: endOfDay },
            wallets: { some: { merchantId: campaign.merchantId } },
            transactions: { none: { merchantId: campaign.merchantId } },
            ...(segmentId ? { segments: { some: { segmentId } } } : {}),
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: batch,
          ...(cursor ? { skip: 1, cursor } : {}),
        });
        if (!customers.length) break;
        for (const c of customers) {
          const already = await this.prisma.campaignUsage.findFirst({ where: { campaignId: campaign.id, customerId: c.id }, select: { id: true } });
          if (already) continue;
          const ok = await this.awardPointsGeneric(campaign.merchantId, campaign.id, c.id, reward.value, `WELCOME-${now.toISOString().slice(0,10)}`);
          if (ok) { remainingTotal--; remainingBudget -= reward.value; }
          if (!(remainingTotal > 0 && remainingBudget > 0)) break;
        }
        cursor = { id: customers[customers.length - 1].id };
        if (!(remainingTotal > 0 && remainingBudget > 0)) break;
      }
    }
  }

  /**
   * Winback: возвращаем «уснувших» клиентов, у которых нет покупок N дней
   * Запуск: каждый день в 09:30
   * Ожидаемые параметры в content/rules:
   *  - winbackDays: число дней без покупок
   *  - reward: { type: 'POINTS', value: number }
   */
  @Cron('30 9 * * *')
  async processWinbackCampaigns() {
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: { in: ['ACTIVE', 'active'] },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
    });

    for (const campaign of campaigns) {
      const reward = (campaign.reward as any) || {};
      const cfg = (campaign.content as any) || (campaign as any).rules || {};
      const winbackDays = Number(cfg.winbackDays || cfg.lapsedDays || 0) || 0;
      if (!winbackDays) continue;
      if (!reward || reward.type !== 'POINTS' || !Number(reward.value)) continue;

      // Предвычислим бюджет/лимиты
      const [totalUsageCount, totalRewardSum] = await Promise.all([
        this.prisma.campaignUsage.count({ where: { campaignId: campaign.id } }),
        this.prisma.campaignUsage.aggregate({ where: { campaignId: campaign.id }, _sum: { rewardValue: true } }),
      ]);
      let remainingTotal = campaign.maxUsageTotal ? Math.max(0, campaign.maxUsageTotal - totalUsageCount) : Number.POSITIVE_INFINITY;
      let remainingBudget = campaign.budget ? Math.max(0, campaign.budget - ((totalRewardSum._sum.rewardValue as number) || 0)) : Number.POSITIVE_INFINITY;
      if (remainingTotal <= 0 || remainingBudget <= 0) continue;

      const segmentId = (campaign as any).targetSegmentId || (campaign as any).segmentId || null;
      const staleSince = new Date(Date.now() - winbackDays * 24 * 60 * 60 * 1000);

      const batch = 500;
      let lastCustomerId: string | undefined = undefined;
      while (true) {
        // Используем агрегированную таблицу статистик клиента для мерчанта
        const stats = await this.prisma.customerStats.findMany({
          where: {
            merchantId: campaign.merchantId,
            // были активны (visits > 0), но давно не покупали
            visits: { gt: 0 },
            OR: [ { lastOrderAt: null }, { lastOrderAt: { lt: staleSince } } ],
          },
          select: { customerId: true },
          orderBy: { customerId: 'asc' },
          take: batch,
          ...(lastCustomerId ? { skip: 1, cursor: { merchantId_customerId: { merchantId: campaign.merchantId, customerId: lastCustomerId } } } : {}),
        });
        if (!stats.length) break;
        const customerIds = stats.map(s => s.customerId);

        // опционально фильтруем по сегменту
        let allowed = new Set(customerIds);
        if (segmentId) {
          const seg = await this.prisma.segmentCustomer.findMany({ where: { segmentId, customerId: { in: customerIds } }, select: { customerId: true } });
          allowed = new Set(seg.map(x => x.customerId));
        }

        for (const customerId of customerIds) {
          if (!allowed.has(customerId)) continue;
          // не дублируем выдачу в последние winbackDays
          const dup = await this.prisma.campaignUsage.findFirst({ where: { campaignId: campaign.id, customerId, usedAt: { gte: staleSince } }, select: { id: true } });
          if (dup) continue;

          const ok = await this.awardPointsGeneric(campaign.merchantId, campaign.id, customerId, reward.value, `WINBACK-${now.toISOString().slice(0,10)}`);
          if (ok) { remainingTotal--; remainingBudget -= reward.value; }
          if (!(remainingTotal > 0 && remainingBudget > 0)) break;
        }
        lastCustomerId = stats[stats.length - 1].customerId;
        if (!(remainingTotal > 0 && remainingBudget > 0)) break;
      }
    }
  }

  private async processBirthdayForCustomers(
    campaign: any,
    customerIds: string[],
    points: number,
    startOfDay: Date,
    endOfDay: Date,
    now: Date,
    onAwarded: () => boolean,
  ) {
    // Забираем данные клиентов (ДР)
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, birthday: true },
    });

    for (const c of customers) {
      if (!c.birthday) continue;
      if (!this.isInBirthdayRange(c.birthday, now, (campaign.content as any)?.birthdayRange ?? (campaign.rules as any)?.birthdayRange ?? 7)) continue;

      // не повторять в тот же день
      const already = await this.prisma.campaignUsage.findFirst({
        where: { campaignId: campaign.id, customerId: c.id, usedAt: { gte: startOfDay, lt: endOfDay } },
        select: { id: true },
      });
      if (already) continue;

      // лимит на клиента
      if (campaign.maxUsagePerCustomer) {
        const cnt = await this.prisma.campaignUsage.count({ where: { campaignId: campaign.id, customerId: c.id } });
        if (cnt >= campaign.maxUsagePerCustomer) continue;
      }

      // бюджет и общий лимит проверяются в вызывающей стороне через onAwarded()
      const okToContinue = await this.awardBirthdayPoints(campaign.merchantId, campaign.id, c.id, points, now);
      if (okToContinue) {
        if (!onAwarded()) break; // обновим счётчики во внешней функции и проверим общий лимит/бюджет
      }
    }
  }

  private async awardBirthdayPoints(merchantId: string, campaignId: string, customerId: string, points: number, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // usage
      await tx.campaignUsage.create({
        data: {
          campaignId,
          customerId,
          rewardType: 'POINTS',
          rewardValue: points,
          usedAt: now,
        },
      });

      // ensure wallet
      let wallet = await tx.wallet.findFirst({ where: { merchantId, customerId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { merchantId, customerId, type: 'POINTS' as any, balance: 0 } });
      }
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: points } } });

      // transaction for audit
      await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: 'CAMPAIGN' as any,
          amount: points,
          orderId: `BIRTHDAY-${now.toISOString().slice(0,10)}`,
        },
      });

      return true;
    }).then(() => true).catch((e) => { this.logger.error(e); return false; });
  }

  private async awardPointsGeneric(merchantId: string, campaignId: string, customerId: string, points: number, orderPrefix: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.campaignUsage.create({ data: { campaignId, customerId, rewardType: 'POINTS', rewardValue: points, usedAt: new Date() } });
      let wallet = await tx.wallet.findFirst({ where: { merchantId, customerId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { merchantId, customerId, type: 'POINTS' as any, balance: 0 } });
      }
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: points } } });
      await tx.transaction.create({ data: { merchantId, customerId, type: 'CAMPAIGN' as any, amount: points, orderId: `${orderPrefix}` } });
      return true;
    }).then(() => true).catch((e) => { this.logger.error(e); return false; });
  }

  private isInBirthdayRange(birthday: Date, today: Date, range: number): boolean {
    const currentYear = today.getFullYear();
    const bd = new Date(currentYear, birthday.getMonth(), birthday.getDate());
    let diffDays = Math.ceil((bd.getTime() - today.setHours(0,0,0,0)) / (1000*60*60*24));
    if (diffDays < -range) {
      // попробуем следующий год
      const next = new Date(currentYear + 1, birthday.getMonth(), birthday.getDate());
      diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000*60*60*24));
    }
    return Math.abs(diffDays) <= Math.max(0, Number(range) || 0);
  }
}
