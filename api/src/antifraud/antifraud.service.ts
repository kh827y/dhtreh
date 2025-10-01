import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface RiskScore {
  level: RiskLevel;
  score: number; // 0-100
  factors: string[];
  shouldBlock: boolean;
  shouldReview: boolean;
}

export interface TransactionContext {
  merchantId: string;
  customerId: string;
  amount: number;
  type: 'EARN' | 'REDEEM';
  outletId?: string;
  staffId?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: { lat: number; lon: number };
}

@Injectable()
export class AntiFraudService {
  private readonly logger = new Logger(AntiFraudService.name);
  
  // Пороги для различных проверок
  private readonly THRESHOLDS = {
    velocityPerHour: 5,        // Макс операций в час
    velocityPerDay: 20,         // Макс операций в день
    largeTransactionAmount: 10000, // Крупная транзакция
    unusualHourStart: 2,        // Необычное время (2:00 - 5:00)
    unusualHourEnd: 5,
    maxDistanceKm: 50,         // Макс расстояние между транзакциями
    suspiciousPatternScore: 70, // Порог подозрительности
  };

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private metrics: MetricsService,
  ) {}

  /**
   * Основная функция проверки транзакции
   */
  async checkTransaction(context: TransactionContext): Promise<RiskScore> {
    const factors: string[] = [];
    let totalScore = 0;

    try {
      // 1. Проверка скорости транзакций
      const velocityScore = await this.checkVelocity(context);
      totalScore += velocityScore.score;
      factors.push(...velocityScore.factors);

      // 2. Проверка суммы транзакции
      const amountScore = this.checkAmount(context);
      totalScore += amountScore.score;
      factors.push(...amountScore.factors);

      // 3. Проверка времени транзакции
      const timeScore = this.checkTime();
      totalScore += timeScore.score;
      factors.push(...timeScore.factors);

      // 3.5 Проверка клиентских сигналов (IP/User-Agent)
      const clientScore = this.checkClientSignals(context);
      totalScore += clientScore.score;
      factors.push(...clientScore.factors);

      // 4. Проверка паттернов поведения
      const patternScore = await this.checkBehaviorPatterns(context);
      totalScore += patternScore.score;
      factors.push(...patternScore.factors);

      // 5. Проверка геолокации (если доступна)
      if (context.location) {
        const geoScore = await this.checkGeolocation(context);
        totalScore += geoScore.score;
        factors.push(...geoScore.factors);
      }
      // 6. Проверка торговой точки/устройства
      const outletScore = await this.checkOutlet(context);
      totalScore += outletScore.score;
      factors.push(...outletScore.factors);

      // 7. Проверка на известные паттерны мошенничества
      const fraudPatternScore = await this.checkKnownFraudPatterns(context);
      totalScore += fraudPatternScore.score;
      factors.push(...fraudPatternScore.factors);

      // Нормализация score (0-100)
      const normalizedScore = Math.min(100, totalScore);

      // Определение уровня риска
      const riskLevel = this.calculateRiskLevel(normalizedScore);

      // Логирование подозрительных транзакций
      if (normalizedScore > 50) {
        await this.logSuspiciousActivity(context, normalizedScore, factors, riskLevel);
      }

      return {
        level: riskLevel,
        score: normalizedScore,
        factors,
        shouldBlock: riskLevel === RiskLevel.CRITICAL,
        shouldReview: riskLevel === RiskLevel.HIGH,
      };
    } catch (error) {
      this.logger.error('Ошибка проверки антифрода:', error);
      // В случае ошибки возвращаем низкий риск, чтобы не блокировать легитимные транзакции
      return {
        level: RiskLevel.LOW,
        score: 0,
        factors: ['antifraud_check_error'],
        shouldBlock: false,
        shouldReview: false,
      };
    }
  }

  /**
   * Проверка скорости транзакций
   */
  private async checkVelocity(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    // Проверка за последний час
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyTransactions = await this.prisma.transaction.count({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        createdAt: { gte: hourAgo },
      },
    });

    if (hourlyTransactions > this.THRESHOLDS.velocityPerHour) {
      score += 30;
      factors.push(`high_hourly_velocity:${hourlyTransactions}`);
    }

    // Проверка за последние сутки
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyTransactions = await this.prisma.transaction.count({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        createdAt: { gte: dayAgo },
      },
    });

    if (dailyTransactions > this.THRESHOLDS.velocityPerDay) {
      score += 20;
      factors.push(`high_daily_velocity:${dailyTransactions}`);
    }

    // Проверка на быстрые последовательные транзакции
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTransactions = await this.prisma.transaction.count({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    if (recentTransactions > 2) {
      score += 25;
      factors.push(`rapid_transactions:${recentTransactions}_in_5min`);
    }

    return { score, factors };
  }

  /**
   * Проверка клиентских сигналов (IP и User-Agent)
   */
  private checkClientSignals(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    const ip = (context.ipAddress || '').toString();
    const ua = (context.userAgent || '').toString();

    if (!ua) {
      score += 5;
      factors.push('no_user_agent');
    } else if (/curl|wget|httpie|python-requests|postman/i.test(ua)) {
      score += 10;
      factors.push('technical_user_agent');
    }

    if (ip && (/^127\./.test(ip) || ip === '::1' || /^(::ffff:)?127\./.test(ip) || /localhost/i.test(ip))) {
      score += 5;
      factors.push('local_ip');
    }

    return { score, factors };
  }

  /**
   * Проверка суммы транзакции
   */
  private checkAmount(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    if (context.amount > this.THRESHOLDS.largeTransactionAmount) {
      score += 15;
      factors.push(`large_amount:${context.amount}`);
    }

    // Проверка на круглые суммы (потенциальное тестирование)
    if (context.amount % 1000 === 0 && context.amount >= 5000) {
      score += 10;
      factors.push('round_amount');
    }

    // Проверка на максимальные суммы
    if (context.type === 'REDEEM' && context.amount > 50000) {
      score += 30;
      factors.push('excessive_redeem_amount');
    }

    return { score, factors };
  }

  /**
   * Проверка времени транзакции
   */
  private checkTime() {
    const factors: string[] = [];
    let score = 0;

    const currentHour = new Date().getHours();
    
    // Проверка на необычное время
    if (currentHour >= this.THRESHOLDS.unusualHourStart && 
        currentHour <= this.THRESHOLDS.unusualHourEnd) {
      score += 15;
      factors.push(`unusual_hour:${currentHour}`);
    }

    // Проверка на выходные дни для B2B
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      score += 5;
      factors.push('weekend_transaction');
    }

    return { score, factors };
  }

  /**
   * Проверка паттернов поведения
   */
  private async checkBehaviorPatterns(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    // Получаем историю транзакций
    const history = await this.prisma.transaction.findMany({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Проверка на резкое изменение поведения
    if (history.length > 10) {
      const avgAmount = history.reduce((sum, t) => sum + Math.abs(t.amount), 0) / history.length;
      
      if (context.amount > avgAmount * 3) {
        score += 20;
        factors.push(`amount_spike:${(context.amount / avgAmount).toFixed(1)}x`);
      }
    }

    // Проверка на последовательные списания
    if (context.type === 'REDEEM') {
      const recentRedeems = history.filter(t => 
        t.type === 'REDEEM' && 
        new Date(t.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );
      
      if (recentRedeems.length > 3) {
        score += 15;
        factors.push(`multiple_redeems:${recentRedeems.length}_per_day`);
      }
    }

    // Проверка на подозрительный баланс манипуляций
    const earnSum = history.filter(t => t.type === 'EARN').reduce((sum, t) => sum + t.amount, 0);
    const redeemSum = Math.abs(history.filter(t => t.type === 'REDEEM').reduce((sum, t) => sum + t.amount, 0));
    
    if (redeemSum > earnSum * 1.5 && earnSum > 0) {
      score += 25;
      factors.push('balance_manipulation');
    }

    return { score, factors };
  }

  /**
   * Проверка геолокации
   */
  private async checkGeolocation(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    if (!context.location) return { score, factors };

    // Получаем последнюю транзакцию с геолокацией
    const lastTransactionWithGeo = await this.prisma.transaction.findFirst({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        NOT: { id: undefined }, // Исключаем текущую
      },
      orderBy: { createdAt: 'desc' },
    });

    // Здесь должна быть логика проверки расстояния между транзакциями
    // Для примера используем заглушку
    const distance = 0; // calculateDistance(lastLocation, context.location);
    
    if (distance > this.THRESHOLDS.maxDistanceKm) {
      score += 30;
      factors.push(`location_jump:${distance}km`);
    }

    return { score, factors };
  }

  /**
   * Проверка устройства
   */
  private async checkOutlet(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    const { outletId } = context;

    if (!outletId) {
      score += 10;
      factors.push('no_outlet_id');
      return { score, factors };
    }

    const legacyThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const outletHistory = await this.prisma.transaction.count({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        outletId,
        createdAt: { lt: legacyThreshold },
      },
    });

    if (outletHistory === 0) {
      score += 15;
      factors.push('new_outlet');
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const uniqueOutlets = await this.prisma.transaction.findMany({
      where: {
        customerId: context.customerId,
        merchantId: context.merchantId,
        createdAt: { gte: weekAgo },
      },
      select: { outletId: true },
      distinct: ['outletId'],
    });

    const uniqueCount = uniqueOutlets.filter((item: any) => !!item?.outletId).length;

    if (uniqueCount > 3) {
      score += 20;
      factors.push(`multiple_outlets:${uniqueCount}`);
    }

    return { score, factors };
  }

  /**
   * Проверка на известные паттерны мошенничества
   */
  private async checkKnownFraudPatterns(context: TransactionContext) {
    const factors: string[] = [];
    let score = 0;

    // Проверка на тестовые данные
    if (context.customerId.includes('test') || context.customerId.includes('demo')) {
      score += 5;
      factors.push('test_account');
    }

    // Проверка на подозрительные комбинации
    if (context.type === 'EARN' && context.amount > 100000) {
      score += 40;
      factors.push('suspicious_earn_amount');
    }

    // Проверка черного списка
    const blacklisted = await this.checkBlacklist(context.customerId);
    if (blacklisted) {
      score += 100;
      factors.push('blacklisted_customer');
    }

    return { score, factors };
  }

  /**
   * Проверка черного списка
   */
  private async checkBlacklist(customerId: string): Promise<boolean> {
    // Здесь должна быть проверка по реальной базе черного списка
    // Для примера возвращаем false
    return false;
  }

  /**
   * Расчет уровня риска
   */
  private calculateRiskLevel(score: number): RiskLevel {
    if (score >= 80) return RiskLevel.CRITICAL;
    if (score >= 60) return RiskLevel.HIGH;
    if (score >= 30) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  /**
   * Логирование подозрительной активности
   */
  private async logSuspiciousActivity(
    context: TransactionContext,
    score: number,
    factors: string[],
    level: RiskLevel,
  ) {
    try {
      await this.prisma.adminAudit.create({
        data: {
          actor: 'antifraud_system',
          method: 'FRAUD_CHECK',
          path: '/antifraud/check',
          merchantId: context.merchantId,
          action: 'suspicious_activity_detected',
          payload: {
            customerId: context.customerId,
            outletId: context.outletId ?? null,
            score,
            factors,
            riskLevel: level,
            context: JSON.parse(JSON.stringify(context)),
            timestamp: new Date().toISOString(),
          } as any,
        },
      });

      // Отправка алерта администраторам при критическом уровне
      if (level === RiskLevel.CRITICAL) {
        await this.sendAdminAlert(context, score, factors);
      }
    } catch (error) {
      this.logger.error('Ошибка логирования подозрительной активности:', error);
    }
  }

  /**
   * Отправка алерта администраторам
   */
  private async sendAdminAlert(
    context: TransactionContext,
    score: number,
    factors: string[]
  ) {
    // Здесь должна быть интеграция с системой нотификаций
    this.logger.warn(`FRAUD ALERT: Customer ${context.customerId}, Score: ${score}, Factors: ${factors.join(', ')}`);
  }

  /**
   * История проверок/транзакций клиента (простой вариант)
   */
  async getCustomerHistory(merchantId: string, customerId: string) {
    const [txns, audits] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { merchantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.adminAudit.findMany({
        where: { merchantId, actor: 'antifraud_system' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { txns, audits };
  }

  /**
   * Ручная отметка результата проверки (review)
   */
  async reviewCheck(checkId: string, dto: { approved: boolean; notes?: string; reviewedBy: string; }) {
    try {
      await this.prisma.adminAudit.create({
        data: {
          actor: dto.reviewedBy || 'admin',
          method: 'FRAUD_REVIEW',
          path: '/antifraud/:checkId/review',
          action: dto.approved ? 'fraud_review_approved' : 'fraud_review_rejected',
          payload: {
            checkId,
            approved: dto.approved,
            notes: dto.notes,
            timestamp: new Date().toISOString(),
          } as any,
        },
      });
      try { this.metrics.inc('antifraud_reviewed_total'); } catch {}
    } catch {}
    return { ok: true };
  }

  /**
   * Обучение модели на основе обратной связи
   */
  async provideFeedback(
    transactionId: string,
    isFraud: boolean,
    notes?: string
  ) {
    try {
      await this.prisma.adminAudit.create({
        data: {
          actor: 'admin',
          method: 'FRAUD_FEEDBACK',
          path: '/antifraud/feedback',
          action: isFraud ? 'confirmed_fraud' : 'false_positive',
          payload: {
            transactionId,
            isFraud,
            notes,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Здесь можно добавить логику обновления ML модели
      this.logger.log(`Fraud feedback recorded: ${transactionId} is ${isFraud ? 'fraud' : 'legitimate'}`);
    } catch (error) {
      this.logger.error('Ошибка записи feedback:', error);
    }
  }

  /**
   * Получение статистики по антифроду
   */
  async getStatistics(merchantId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const audits = await this.prisma.adminAudit.findMany({
      where: {
        merchantId,
        action: 'suspicious_activity_detected',
        createdAt: { gte: since },
      },
    });

    const blocked = audits.filter(a => (a.payload as any)?.riskLevel === RiskLevel.CRITICAL).length;
    const reviewed = audits.filter(a => (a.payload as any)?.riskLevel === RiskLevel.HIGH).length;
    const total = audits.length;

    const factorCounts = new Map<string, number>();
    for (const audit of audits) {
      const payload: any = audit.payload ?? {};
      const arr: string[] = Array.isArray(payload?.factors) ? payload.factors : [];
      for (const factor of arr) {
        const key = String(factor || '').split(':')[0];
        factorCounts.set(key, (factorCounts.get(key) ?? 0) + 1);
      }
    }

    const topFactors = Array.from(factorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([factor, count]) => ({ factor, count }));

    return {
      period: `${days} days`,
      totalChecks: total,
      blockedTransactions: blocked,
      reviewedTransactions: reviewed,
      blockRate: total > 0 ? (blocked / total * 100).toFixed(2) + '%' : '0%',
      reviewRate: total > 0 ? (reviewed / total * 100).toFixed(2) + '%' : '0%',
      topFactors,
    };
  }

  /**
   * Публичная запись результата антифрод‑проверки в модель FraudCheck
   */
  async recordFraudCheck(
    context: TransactionContext,
    score: RiskScore,
    transactionId?: string,
  ) {
    try {
      const createFn = (this.prisma as any)?.fraudCheck?.create;
      if (!createFn) {
        // In unit/e2e tests PrismaService may be partially mocked without fraudCheck
        return null;
      }
      const rec = await (this.prisma as any).fraudCheck.create({
        data: {
          merchantId: context.merchantId,
          customerId: context.customerId,
          transactionId: transactionId || null,
          riskScore: Math.round(score.score),
          riskLevel: score.level,
          factors: score.factors,
          blocked: !!score.shouldBlock,
          metadata: {
            type: context.type,
            outletId: context.outletId || null,
            staffId: context.staffId || null,
          } as any,
        },
      });
      return rec;
    } catch (e) {
      this.logger.error('Ошибка записи FraudCheck:', e);
      return null;
    }
  }
}
