import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateSegmentDto {
  merchantId: string;
  name: string;
  description?: string;
  type: 'STATIC' | 'DYNAMIC';
  rules?: SegmentRules;
  customerIds?: string[]; // Для статических сегментов
  metadata?: any;
}

export interface SegmentRules {
  // Демографические критерии
  ageFrom?: number;
  ageTo?: number;
  gender?: 'M' | 'F';
  city?: string;
  
  // Поведенческие критерии
  lastPurchaseDaysAgo?: number; // Покупка за последние N дней
  minPurchases?: number; // Минимум покупок
  maxPurchases?: number; // Максимум покупок
  minTotalSpent?: number; // Минимальная общая сумма
  maxTotalSpent?: number; // Максимальная общая сумма
  avgPurchaseFrom?: number; // Средний чек от
  avgPurchaseTo?: number; // Средний чек до
  
  // Активность
  hasActiveWallet?: boolean; // Есть активный кошелек
  minBalance?: number; // Минимальный баланс
  maxBalance?: number; // Максимальный баланс
  lastActivityDaysAgo?: number; // Последняя активность N дней назад
  
  // Частота покупок
  purchaseFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'RARE';
  
  // Категории товаров
  purchasedCategories?: string[]; // Покупал товары из категорий
  notPurchasedCategories?: string[]; // НЕ покупал товары из категорий
  
  // Точки продаж
  visitedOutlets?: string[]; // Посещал точки
  notVisitedOutlets?: string[]; // НЕ посещал точки
  
  // Специальные условия
  hasBirthday?: boolean; // Есть дата рождения
  hasPhone?: boolean; // Есть телефон
  hasTelegram?: boolean; // Подключен Telegram
  
  // RFM сегментация
  recency?: 'HIGH' | 'MEDIUM' | 'LOW'; // Давность покупки
  frequency?: 'HIGH' | 'MEDIUM' | 'LOW'; // Частота покупок
  monetary?: 'HIGH' | 'MEDIUM' | 'LOW'; // Денежная ценность
}

@Injectable()
export class SegmentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Создать новый сегмент
   */
  async createSegment(dto: CreateSegmentDto) {
    const segment = await this.prisma.customerSegment.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        rules: (dto.rules as any) || {},
      },
    });

    // Если статический сегмент с указанными клиентами
    if (dto.type === 'STATIC' && dto.customerIds && dto.customerIds.length > 0) {
      await this.addCustomersToSegment(segment.id, dto.customerIds);
    }

    // Если динамический сегмент, рассчитываем клиентов
    if (dto.type === 'DYNAMIC' && dto.rules) {
      await this.recalculateSegment(segment.id);
    }

    return segment;
  }

  /**
   * Получить список сегментов мерчанта
   */
  async getSegments(merchantId: string) {
    return this.prisma.customerSegment.findMany({
      where: { merchantId },
      include: {
        _count: {
          select: {
            customers: true,
            campaigns: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить детали сегмента
   */
  async getSegment(segmentId: string) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
      include: {
        customers: {
          take: 100,
          include: {
            customer: true,
          },
        },
        campaigns: true,
        _count: {
          select: {
            customers: true,
            campaigns: true,
          },
        },
      },
    });

    if (!segment) {
      throw new NotFoundException('Сегмент не найден');
    }

    // Добавляем статистику
    const stats = await this.getSegmentStats(segmentId);

    return {
      ...segment,
      stats,
    };
  }

  /**
   * Обновить сегмент
   */
  async updateSegment(segmentId: string, dto: Partial<CreateSegmentDto>) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new NotFoundException('Сегмент не найден');
    }

    const updated = await this.prisma.customerSegment.update({
      where: { id: segmentId },
      data: {
        name: dto.name,
        description: dto.description,
        rules: (dto.rules as any),
      },
    });

    // Если обновлены правила динамического сегмента, пересчитываем
    if (segment.type === 'DYNAMIC' && dto.rules) {
      await this.recalculateSegment(segmentId);
    }

    return updated;
  }

  /**
   * Добавить клиентов в статический сегмент
   */
  async addCustomersToSegment(segmentId: string, customerIds: string[]) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new NotFoundException('Сегмент не найден');
    }

    if (segment.type !== 'STATIC') {
      throw new BadRequestException('Можно добавлять клиентов только в статические сегменты');
    }

    const data = customerIds.map(customerId => ({
      segmentId,
      customerId,
    }));

    await this.prisma.segmentCustomer.createMany({
      data,
      skipDuplicates: true,
    });

    return { added: customerIds.length };
  }

  /**
   * Удалить клиентов из сегмента
   */
  async removeCustomersFromSegment(segmentId: string, customerIds: string[]) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new NotFoundException('Сегмент не найден');
    }

    if (segment.type !== 'STATIC') {
      throw new BadRequestException('Можно удалять клиентов только из статических сегментов');
    }

    await this.prisma.segmentCustomer.deleteMany({
      where: {
        segmentId,
        customerId: { in: customerIds },
      },
    });

    return { removed: customerIds.length };
  }

  /**
   * Пересчитать динамический сегмент
   */
  async recalculateSegment(segmentId: string) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment || segment.type !== 'DYNAMIC') {
      throw new BadRequestException('Можно пересчитывать только динамические сегменты');
    }

    const rules = segment.rules as SegmentRules;
    
    // Очищаем текущих клиентов
    await this.prisma.segmentCustomer.deleteMany({
      where: { segmentId },
    });

    // Находим подходящих клиентов
    const customers = await this.findCustomersByRules(segment.merchantId, rules);

    // Добавляем в сегмент
    if (customers.length > 0) {
      const data = customers.map(customerId => ({
        segmentId,
        customerId,
      }));

      await this.prisma.segmentCustomer.createMany({
        data,
      });
    }

    return { recalculated: customers.length };
  }

  /**
   * Поиск клиентов по правилам
   */
  private async findCustomersByRules(merchantId: string, rules: SegmentRules): Promise<string[]> {
    // Используем агрегированные статистики + кошельки через Prisma, без сырых SQL
    const candidateIds = new Set<string>();
    let seeded = false;

    // 1) Фильтрация по статистике клиента (CustomerStats)
    const statsWhere: any = { merchantId };
    if (rules.lastPurchaseDaysAgo !== undefined) {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - rules.lastPurchaseDaysAgo);
      statsWhere.lastOrderAt = { gte: dateFrom };
    }
    if (rules.minPurchases !== undefined || rules.maxPurchases !== undefined) {
      statsWhere.visits = {};
      if (rules.minPurchases !== undefined) statsWhere.visits.gte = rules.minPurchases;
      if (rules.maxPurchases !== undefined) statsWhere.visits.lte = rules.maxPurchases;
    }
    if (rules.minTotalSpent !== undefined || rules.maxTotalSpent !== undefined) {
      statsWhere.totalSpent = {};
      if (rules.minTotalSpent !== undefined) statsWhere.totalSpent.gte = rules.minTotalSpent;
      if (rules.maxTotalSpent !== undefined) statsWhere.totalSpent.lte = rules.maxTotalSpent;
    }

    if (Object.keys(statsWhere).length > 1) { // кроме merchantId что-то добавили
      const stats = await this.prisma.customerStats.findMany({
        where: statsWhere,
        select: { customerId: true },
      });
      for (const s of stats) candidateIds.add(s.customerId);
      seeded = true;
    }

    // 2) Фильтрация по балансу кошелька (Wallet)
    if (rules.minBalance !== undefined || rules.maxBalance !== undefined) {
      const walWhere: any = { merchantId, type: 'POINTS' as any };
      if (rules.minBalance !== undefined || rules.maxBalance !== undefined) {
        walWhere.balance = {};
        if (rules.minBalance !== undefined) walWhere.balance.gte = rules.minBalance;
        if (rules.maxBalance !== undefined) walWhere.balance.lte = rules.maxBalance;
      }
      const wallets = await this.prisma.wallet.findMany({ where: walWhere, select: { customerId: true } });
      const walletSet = new Set(wallets.map(w => w.customerId));
      if (!seeded) {
        for (const id of walletSet) candidateIds.add(id);
        seeded = true;
      } else {
        // Пересечение с уже отфильтрованными по статистике
        for (const id of Array.from(candidateIds)) if (!walletSet.has(id)) candidateIds.delete(id);
      }
    }

    // Если ни одно правило не применилось — берём всех с кошельком мерчанта
    if (!seeded) {
      const wallets = await this.prisma.wallet.findMany({ where: { merchantId, type: 'POINTS' as any }, select: { customerId: true } });
      for (const w of wallets) candidateIds.add(w.customerId);
    }

    return Array.from(candidateIds);
  }

  /**
   * Получить статистику сегмента
   */
  private async getSegmentStats(segmentId: string) {
    const segment = await this.prisma.customerSegment.findUnique({ where: { id: segmentId } });
    if (!segment) return null;

    const customers = await this.prisma.segmentCustomer.findMany({
      where: { segmentId },
      include: {
        customer: {
          include: {
            wallets: { where: { merchantId: segment.merchantId } },
            transactions: {
              where: {
                merchantId: segment.merchantId,
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            },
          },
        },
      },
    });

    let totalBalance = 0;
    let totalTransactions = 0;
    let totalSpent = 0;
    let activeCustomers = 0;

    for (const sc of customers) {
      const wallet = sc.customer.wallets[0];
      if (wallet) {
        totalBalance += wallet.balance;
        if (wallet.balance > 0) activeCustomers++;
      }

      totalTransactions += sc.customer.transactions.length;
      totalSpent += sc.customer.transactions
        .filter(t => t.type === 'REDEEM')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    }

    const customerCount = customers.length;

    return {
      customerCount,
      activeCustomers,
      totalBalance,
      avgBalance: customerCount > 0 ? Math.round(totalBalance / customerCount) : 0,
      totalTransactions,
      avgTransactions: customerCount > 0 ? Math.round(totalTransactions / customerCount) : 0,
      totalSpent,
      avgSpent: customerCount > 0 ? Math.round(totalSpent / customerCount) : 0,
    };
  }

  /**
   * Предустановленные сегменты для малого бизнеса
   */
  async createDefaultSegments(merchantId: string) {
    const segments = [
      {
        name: 'Новые клиенты',
        description: 'Клиенты с менее чем 3 покупками',
        type: 'DYNAMIC' as const,
        rules: {
          maxPurchases: 2,
        },
      },
      {
        name: 'Постоянные клиенты',
        description: 'Клиенты с 10+ покупками',
        type: 'DYNAMIC' as const,
        rules: {
          minPurchases: 10,
        },
      },
      {
        name: 'VIP клиенты',
        description: 'Топ клиенты по сумме покупок',
        type: 'DYNAMIC' as const,
        rules: {
          minTotalSpent: 50000,
        },
      },
      {
        name: 'Спящие клиенты',
        description: 'Не было покупок более 30 дней',
        type: 'DYNAMIC' as const,
        rules: {
          lastPurchaseDaysAgo: 30,
        },
      },
      {
        name: 'Активные',
        description: 'Покупка за последние 7 дней',
        type: 'DYNAMIC' as const,
        rules: {
          lastPurchaseDaysAgo: 7,
        },
      },
    ];

    const created: any[] = [];
    for (const segment of segments) {
      const s = await this.createSegment({
        merchantId,
        ...segment,
      });
      created.push(s);
    }

    return created;
  }
}
