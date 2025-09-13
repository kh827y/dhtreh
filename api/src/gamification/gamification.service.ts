import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

export interface CreateAchievementDto {
  merchantId: string;
  code: string;
  name: string;
  description: string;
  icon?: string;
  category: 'PURCHASE' | 'SOCIAL' | 'MILESTONE' | 'SPECIAL' | 'SEASONAL';
  type: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  conditions: {
    metric: string; // transactions_count, total_spent, referrals_count, reviews_count, etc
    operator: 'gte' | 'lte' | 'eq' | 'between';
    value: number;
    value2?: number; // for between operator
  };
  reward?: {
    type: 'POINTS' | 'VOUCHER' | 'BADGE' | 'MULTIPLIER';
    value: number;
    voucherId?: string;
  };
  maxProgress?: number;
  expiresAt?: Date;
  isActive?: boolean;
}

export interface CreateChallengeDto {
  merchantId: string;
  name: string;
  description: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'SPECIAL';
  startDate?: Date;
  endDate?: Date;
  tasks: Array<{
    name: string;
    description: string;
    target: number;
    metric: string;
    reward: number;
  }>;
  totalReward: number;
  maxParticipants?: number;
}

export interface CreateLevelDto {
  merchantId: string;
  level: number;
  name: string;
  minPoints: number;
  maxPoints: number;
  benefits: string[];
  multiplier?: number; // Множитель баллов для этого уровня
  icon?: string;
  color?: string;
}

@Injectable()
export class GamificationService {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

  /**
   * Создать достижение
   */
  async createAchievement(dto: CreateAchievementDto) {
    // Проверяем уникальность кода
    const existing = await (this.prisma as any).achievement?.findFirst?.({
      where: {
        merchantId: dto.merchantId,
        code: dto.code,
      },
    });

    if (existing) {
      throw new BadRequestException(`Достижение с кодом ${dto.code} уже существует`);
    }

    return (this.prisma as any).achievement?.create?.({
      data: {
        merchantId: dto.merchantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        category: dto.category,
        type: dto.type,
        conditions: dto.conditions,
        reward: dto.reward,
        maxProgress: dto.maxProgress || 1,
        expiresAt: dto.expiresAt,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Проверить и выдать достижения клиенту
   */
  async checkAndAwardAchievements(customerId: string, merchantId: string, trigger?: string) {
    // Получаем активные достижения
    const achievements = await (this.prisma as any).achievement?.findMany?.({
      where: {
        merchantId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    // Получаем уже полученные достижения
    const earnedAchievements = await (this.prisma as any).customerAchievement?.findMany?.({
      where: {
        customerId,
        achievement: {
          merchantId,
        },
      },
      select: {
        achievementId: true,
      },
    });

    const earnedIds = new Set(earnedAchievements.map(ea => ea.achievementId));
    const newAchievements: any[] = [];

    // Получаем статистику клиента
    const stats = await this.getCustomerStats(customerId, merchantId);

    for (const achievement of achievements) {
      // Пропускаем уже полученные
      if (earnedIds.has(achievement.id)) continue;

      // Проверяем условия
      if (this.checkAchievementConditions(achievement.conditions, stats)) {
        // Выдаем достижение
        const customerAchievement = await (this.prisma as any).customerAchievement?.create?.({
          data: {
            customerId,
            achievementId: achievement.id,
            progress: achievement.maxProgress,
            unlockedAt: new Date(),
          },
        });

        // Выдаем награду
        if (achievement.reward) {
          await this.grantAchievementReward(
            customerId,
            merchantId,
            achievement.reward,
            achievement.name
          );
        }

        newAchievements.push({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          type: achievement.type,
          reward: achievement.reward,
        });
      }
    }

    return newAchievements;
  }

  /**
   * Создать челлендж
   */
  async createChallenge(dto: CreateChallengeDto) {
    const startDate = dto.startDate || new Date();
    let endDate = dto.endDate;

    // Автоматически устанавливаем дату окончания для периодических челленджей
    if (!endDate) {
      const now = new Date();
      switch (dto.type) {
        case 'DAILY':
          endDate = new Date(now.setHours(23, 59, 59, 999));
          break;
        case 'WEEKLY':
          endDate = new Date(now.setDate(now.getDate() + 7));
          break;
        case 'MONTHLY':
          endDate = new Date(now.setMonth(now.getMonth() + 1));
          break;
      }
    }

    return (this.prisma as any).challenge?.create?.({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        startDate,
        endDate,
        tasks: dto.tasks,
        totalReward: dto.totalReward,
        maxParticipants: dto.maxParticipants || 0,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Участвовать в челлендже
   */
  async joinChallenge(challengeId: string, customerId: string) {
    const challenge = await (this.prisma as any).challenge?.findUnique?.({
      where: { id: challengeId },
      include: {
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Челлендж не найден');
    }

    if (challenge.status !== 'ACTIVE') {
      throw new BadRequestException('Челлендж неактивен');
    }

    const now = new Date();
    if (now < challenge.startDate || now > challenge.endDate) {
      throw new BadRequestException('Челлендж еще не начался или уже закончился');
    }

    // Проверяем лимит участников
    if (challenge.maxParticipants > 0 && challenge._count.participants >= challenge.maxParticipants) {
      throw new BadRequestException('Достигнут лимит участников');
    }

    // Проверяем, не участвует ли уже
    const existing = await (this.prisma as any).challengeParticipant?.findFirst?.({
      where: {
        challengeId,
        customerId,
      },
    });

    if (existing) {
      throw new BadRequestException('Вы уже участвуете в этом челлендже');
    }

    // Создаем участие
    return (this.prisma as any).challengeParticipant?.create?.({
      data: {
        challengeId,
        customerId,
        progress: {},
        status: 'IN_PROGRESS',
      },
    });
  }

  /**
   * Обновить прогресс челленджа
   */
  async updateChallengeProgress(
    customerId: string,
    merchantId: string,
    metric: string,
    value: number
  ) {
    // Находим активные челленджи пользователя
    const participations = await (this.prisma as any).challengeParticipant?.findMany?.({
      where: {
        customerId,
        status: 'IN_PROGRESS',
        challenge: {
          merchantId,
          status: 'ACTIVE',
          endDate: { gt: new Date() },
        },
      },
      include: {
        challenge: true,
      },
    });

    const completed: any[] = [];

    for (const participation of participations) {
      const challenge = participation.challenge;
      const progress = participation.progress as any || {};
      
      // Обновляем прогресс для соответствующих задач
      let updated = false;
      let allTasksCompleted = true;

      for (const task of challenge.tasks as any[]) {
        if (task.metric === metric) {
          const taskProgress = progress[task.name] || 0;
          progress[task.name] = Math.min(taskProgress + value, task.target);
          updated = true;
        }

        if (!progress[task.name] || progress[task.name] < task.target) {
          allTasksCompleted = false;
        }
      }

      if (updated) {
        // Обновляем прогресс в БД
        await (this.prisma as any).challengeParticipant?.update?.({
          where: { id: participation.id },
          data: {
            progress,
            status: allTasksCompleted ? 'COMPLETED' : 'IN_PROGRESS',
            completedAt: allTasksCompleted ? new Date() : null,
          },
        });

        // Если челлендж завершен, выдаем награду
        if (allTasksCompleted && participation.status !== 'COMPLETED') {
          await this.loyaltyService.earn({
            customerId,
            merchantId,
            amount: challenge.totalReward,
            orderId: `challenge_${challenge.id}`,
          });

          completed.push({
            challengeId: challenge.id,
            name: challenge.name,
            reward: challenge.totalReward,
          });
        }
      }
    }

    return completed;
  }

  /**
   * Создать уровень
   */
  async createLevel(dto: CreateLevelDto) {
    // Проверяем, нет ли пересечений диапазонов
    const existing = await (this.prisma as any).customerLevel?.findFirst?.({
      where: {
        merchantId: dto.merchantId,
        OR: [
          {
            AND: [
              { minPoints: { lte: dto.minPoints } },
              { maxPoints: { gte: dto.minPoints } },
            ],
          },
          {
            AND: [
              { minPoints: { lte: dto.maxPoints } },
              { maxPoints: { gte: dto.maxPoints } },
            ],
          },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Диапазон баллов пересекается с существующим уровнем');
    }

    return (this.prisma as any).customerLevel?.create?.({
      data: {
        merchantId: dto.merchantId,
        level: dto.level,
        name: dto.name,
        minPoints: dto.minPoints,
        maxPoints: dto.maxPoints,
        benefits: dto.benefits,
        multiplier: dto.multiplier || 1.0,
        icon: dto.icon,
        color: dto.color,
      },
    });
  }

  /**
   * Получить текущий уровень клиента
   */
  async getCustomerLevel(customerId: string, merchantId: string) {
    // Получаем текущий баланс
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId,
        merchantId,
      },
    });

    if (!wallet) {
      return null;
    }

    // Получаем общее количество заработанных баллов
    const totalEarned = await this.prisma.transaction.aggregate({
      where: {
        customerId,
        merchantId,
        type: 'EARN',
      },
      _sum: {
        amount: true,
      },
    });

    const totalPoints = totalEarned._sum.amount || 0;

    // Находим соответствующий уровень
    const level = await (this.prisma as any).customerLevel?.findFirst?.({
      where: {
        merchantId,
        minPoints: { lte: totalPoints },
        maxPoints: { gte: totalPoints },
      },
    });

    if (!level) {
      // Возвращаем базовый уровень
      return {
        level: 0,
        name: 'Новичок',
        currentPoints: totalPoints,
        nextLevelPoints: 100,
        progress: 0,
        multiplier: 1.0,
      };
    }

    // Рассчитываем прогресс до следующего уровня
    const nextLevel = await (this.prisma as any).customerLevel?.findFirst?.({
      where: {
        merchantId,
        level: level.level + 1,
      },
    });

    const progress = nextLevel
      ? ((totalPoints - level.minPoints) / (nextLevel.minPoints - level.minPoints)) * 100
      : 100;

    return {
      level: level.level,
      name: level.name,
      currentPoints: totalPoints,
      nextLevelPoints: nextLevel?.minPoints || level.maxPoints,
      progress: Math.min(Math.round(progress), 100),
      multiplier: level.multiplier,
      benefits: level.benefits,
      icon: level.icon,
      color: level.color,
    };
  }

  /**
   * Получить рейтинг лидеров
   */
  async getLeaderboard(
    merchantId: string,
    period: 'ALL_TIME' | 'MONTHLY' | 'WEEKLY' = 'ALL_TIME',
    limit: number = 10
  ) {
    let dateFilter: any = {};
    const now = new Date();

    switch (period) {
      case 'WEEKLY':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter = { createdAt: { gte: weekAgo } };
        break;
      case 'MONTHLY':
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter = { createdAt: { gte: monthAgo } };
        break;
    }

    // Получаем топ клиентов по заработанным баллам
    const topCustomers = await this.prisma.transaction.groupBy({
      by: ['customerId'],
      where: {
        merchantId,
        type: 'EARN',
        ...dateFilter,
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: 'desc',
        },
      },
      take: limit,
    });

    // Получаем информацию о клиентах
    const customerIds = topCustomers.map(tc => tc.customerId);
    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: customerIds },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const customerMap = new Map(customers.map(c => [c.id, c]));

    // Формируем лидерборд
    return topCustomers.map((tc, index) => {
      const customer = customerMap.get(tc.customerId);
      return {
        rank: index + 1,
        customerId: tc.customerId,
        name: customer?.name || 'Аноним',
        points: tc._sum.amount || 0,
      };
    });
  }

  /**
   * Получить достижения клиента
   */
  async getCustomerAchievements(customerId: string, merchantId: string) {
    const achievements = await (this.prisma as any).customerAchievement?.findMany?.({
      where: {
        customerId,
        achievement: {
          merchantId,
        },
      },
      include: {
        achievement: true,
      },
      orderBy: {
        unlockedAt: 'desc',
      },
    });

    // Получаем все возможные достижения
    const allAchievements = await (this.prisma as any).achievement?.findMany?.({
      where: {
        merchantId,
        isActive: true,
      },
    });

    const unlockedIds = new Set(achievements.map(a => a.achievementId));
    
    return {
      unlocked: achievements.map(a => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        icon: a.achievement.icon,
        type: a.achievement.type,
        category: a.achievement.category,
        unlockedAt: a.unlockedAt,
        progress: a.progress,
        maxProgress: a.achievement.maxProgress,
      })),
      locked: allAchievements
        .filter(a => !unlockedIds.has(a.id))
        .map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
          type: a.type,
          category: a.category,
          maxProgress: a.maxProgress,
          conditions: a.conditions,
        })),
      stats: {
        total: allAchievements.length,
        unlocked: achievements.length,
        completion: allAchievements.length > 0
          ? Math.round((achievements.length / allAchievements.length) * 100)
          : 0,
      },
    };
  }

  /**
   * Получить активные челленджи
   */
  async getActiveChallenges(merchantId: string, customerId?: string) {
    const where: any = {
      merchantId,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    };

    const challenges = await (this.prisma as any).challenge?.findMany?.({
      where,
      include: {
        _count: {
          select: { participants: true },
        },
      },
      orderBy: {
        endDate: 'asc',
      },
    });

    // Если указан клиент, получаем его участие
    if (customerId) {
      const participations = await (this.prisma as any).challengeParticipant?.findMany?.({
        where: {
          customerId,
          challengeId: { in: challenges.map(c => c.id) },
        },
      });

      const participationMap = new Map(participations.map(p => [p.challengeId, p]));

      return challenges.map(challenge => ({
        ...challenge,
        participation: participationMap.get(challenge.id) || null,
        participantsCount: challenge._count.participants,
        daysLeft: Math.ceil((challenge.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }));
    }

    return challenges.map(challenge => ({
      ...challenge,
      participantsCount: challenge._count.participants,
      daysLeft: Math.ceil((challenge.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }));
  }

  // Вспомогательные методы

  private async getCustomerStats(customerId: string, merchantId: string) {
    const [transactions, referrals, reviews] = await Promise.all([
      // Транзакции
      this.prisma.transaction.aggregate({
        where: {
          customerId,
          merchantId,
          type: 'EARN',
        },
        _count: true,
        _sum: {
          amount: true,
        },
      }),
      // Рефералы
      this.prisma.referral.count({
        where: {
          referrerId: customerId,
          status: 'COMPLETED',
          program: {
            merchantId,
          },
        },
      }),
      // Отзывы
      this.prisma.review.count({
        where: {
          customerId,
          merchantId,
          status: 'APPROVED',
        },
      }),
    ]);

    return {
      transactions_count: transactions._count,
      total_spent: transactions._sum.amount || 0,
      referrals_count: referrals,
      reviews_count: reviews,
    };
  }

  private checkAchievementConditions(conditions: any, stats: any): boolean {
    const metric = stats[conditions.metric];
    if (metric === undefined) return false;

    switch (conditions.operator) {
      case 'gte':
        return metric >= conditions.value;
      case 'lte':
        return metric <= conditions.value;
      case 'eq':
        return metric === conditions.value;
      case 'between':
        return metric >= conditions.value && metric <= conditions.value2;
      default:
        return false;
    }
  }

  private async grantAchievementReward(
    customerId: string,
    merchantId: string,
    reward: any,
    achievementName: string
  ) {
    switch (reward.type) {
      case 'POINTS':
        await this.loyaltyService.earn({
          customerId,
          merchantId,
          amount: reward.value,
          orderId: `achievement_${Date.now()}`,
        });
        break;
      
      case 'VOUCHER':
        // TODO: Создать и выдать ваучер
        break;
      
      case 'MULTIPLIER':
        // TODO: Применить множитель к следующим транзакциям
        break;
    }
  }
}
