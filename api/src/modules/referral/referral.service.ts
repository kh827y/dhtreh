import { Injectable, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  ReferralProgram,
  TxnType,
  WalletType,
  LedgerAccount,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { EmailService } from '../notifications/email/email.service';
import * as crypto from 'crypto';

export interface CreateReferralProgramDto {
  merchantId: string;
  name: string;
  description?: string;
  referrerReward: number; // Баллы для приглашающего или процент при rewardType === 'PERCENT'
  refereeReward: number; // Баллы для приглашенного
  minPurchaseAmount?: number; // Минимальная сумма первой покупки
  maxReferrals?: number; // Максимум рефералов на человека
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  rewardTrigger?: 'first' | 'all';
  rewardType?: 'FIXED' | 'PERCENT';
  multiLevel?: boolean;
  levelRewards?: Array<{ level: number; enabled: boolean; reward: number }>;
  stackWithRegistration?: boolean;
  messageTemplate?: string;
  placeholders?: string[];
  shareMessage?: string; // текст сообщения для отправки (с плейсхолдерами)
}

type RewardTrigger = 'first' | 'all';
type RewardMode = 'FIXED' | 'PERCENT';

export interface ReferralProgramSettingsDto {
  enabled: boolean;
  rewardTrigger: RewardTrigger;
  rewardType: 'fixed' | 'percent';
  multiLevel: boolean;
  rewardValue: number;
  levels: Array<{ level: number; enabled: boolean; reward: number }>;
  friendReward: number;
  stackWithRegistration: boolean;
  message: string;
  placeholders?: string[];
  shareMessage?: string;
  minPurchaseAmount: number;
}

const REFERRAL_PLACEHOLDERS = [
  '{businessname}',
  '{bonusamount}',
  '{code}',
  '{link}',
] as const;

export interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalRewardsIssued: number;
  conversionRate: number;
  topReferrers: Array<{
    customerId: string;
    name: string;
    referralsCount: number;
    rewardsEarned: number;
  }>;
}

type ReferralWithProgram = Prisma.ReferralGetPayload<{
  include: { program: true };
}>;

type CustomerReferralRow = {
  id: string;
  code: string;
  status: string;
  refereeName?: string | null;
  refereePhone: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  completedAt: Date | null;
  reward: number;
};

@Injectable()
export class ReferralService {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
    private emailService: EmailService,
  ) {}

  /**
   * Создать реферальную программу
   */
  async createReferralProgram(dto: CreateReferralProgramDto) {
    // Проверяем, нет ли уже активной программы
    const existing = await this.prisma.referralProgram.findFirst({
      where: {
        merchantId: dto.merchantId,
        status: 'ACTIVE',
      },
    });

    if (existing) {
      throw new BadRequestException(
        'У мерчанта уже есть активная реферальная программа',
      );
    }

    const rewardType: RewardMode =
      dto.rewardType === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const rewardTrigger: RewardTrigger =
      dto.rewardTrigger === 'all' ? 'all' : 'first';
    const multiLevel = Boolean(dto.multiLevel);
    const baseReward = this.normalizeBaseReward(
      dto.referrerReward ?? 0,
      rewardType,
      multiLevel,
    );
    const levels = this.normalizeLevels(
      dto.levelRewards,
      multiLevel,
      rewardType,
      baseReward,
    );
    const levelRewardsJson = multiLevel ? levels : Prisma.JsonNull;
    const referrerReward = multiLevel
      ? (levels.find((level) => level.level === 1)?.reward ?? 0)
      : baseReward;

    return this.prisma.referralProgram.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        description: dto.description,
        referrerReward,
        refereeReward: this.roundTwo(dto.refereeReward ?? 0),
        minPurchaseAmount: dto.minPurchaseAmount || 0,
        maxReferrals: dto.maxReferrals || 100,
        status: dto.status || 'ACTIVE',
        isActive: (dto.status || 'ACTIVE') === 'ACTIVE',
        rewardTrigger,
        rewardType,
        multiLevel,
        levelRewards: levelRewardsJson,
        stackWithRegistration: Boolean(dto.stackWithRegistration),
        messageTemplate: this.normalizeMessageTemplate(dto.messageTemplate),
        placeholders: this.normalizePlaceholders(dto.placeholders),
        // Используем колонку shareButtonText для хранения шаблона сообщения для отправки
        shareButtonText: this.normalizeShareMessage(dto.shareMessage),
      },
    });
  }

  async resolveCustomerId(
    identifier: string,
    merchantId?: string,
  ): Promise<string> {
    // Customer теперь per-merchant модель
    const raw = typeof identifier === 'string' ? identifier.trim() : '';
    if (!raw) {
      throw new BadRequestException('customer identifier required');
    }

    const customer = await this.prisma.customer
      .findUnique({ where: { id: raw } })
      .catch(() => null);
    if (customer) {
      if (merchantId && customer.merchantId !== merchantId) {
        throw new BadRequestException('merchant mismatch for customer');
      }
      return customer.id;
    }

    throw new BadRequestException('customer not found');
  }

  /**
   * [Удалено] Создание одноразовых инвайтов упразднено. Доступны только персональные коды.
   */

  /**
   * Активировать реферальный код
   */
  async activateReferral(code: string, refereeId: string) {
    // ТОЛЬКО персональные коды
    const personal = await this.prisma.personalReferralCode.findFirst({
      where: { code },
    });
    if (!personal) {
      throw new BadRequestException(
        'Недействительный или истекший реферальный код',
      );
    }
    if (personal.customerId === refereeId) {
      throw new BadRequestException(
        'Нельзя использовать свой собственный реферальный код',
      );
    }
    const programId = personal.programId ?? null;
    if (!programId) {
      throw new BadRequestException('Реферальная программа не активна');
    }
    const program = await this.prisma.referralProgram.findFirst({
      where: { id: programId, status: 'ACTIVE' },
    });
    if (!program) {
      throw new BadRequestException('Реферальная программа не активна');
    }
    if (personal.merchantId && personal.merchantId !== program.merchantId) {
      throw new BadRequestException('Реферальная программа не активна');
    }
    const referee = await this.prisma.customer.findFirst({
      where: { id: refereeId, merchantId: program.merchantId },
    });
    if (!referee) {
      throw new BadRequestException('Клиент не найден');
    }
    const existingReferee = await this.prisma.referral.findFirst({
      where: { refereeId, programId },
    });
    if (existingReferee) {
      throw new BadRequestException(
        'Вы уже участвуете в реферальной программе',
      );
    }
    const created = await this.prisma.referral.create({
      data: {
        programId,
        referrerId: personal.customerId,
        refereeId,
        code,
        status: 'ACTIVATED',
        channel: 'LINK',
        activatedAt: new Date(),
      },
    });
    if ((program.refereeReward ?? 0) > 0) {
      const amount = this.roundTwo(program.refereeReward ?? 0);
      await this.prisma.$transaction(async (tx) => {
        let wallet = await tx.wallet.findFirst({
          where: {
            customerId: refereeId,
            merchantId: program.merchantId,
            type: WalletType.POINTS,
          },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              customerId: refereeId,
              merchantId: program.merchantId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });
        }
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        await tx.transaction.create({
          data: {
            customerId: refereeId,
            merchantId: program.merchantId,
            type: TxnType.REFERRAL,
            amount,
            orderId: `referral_welcome_${created.id}`,
            outletId: null,
            staffId: null,
          },
        });
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({
            data: {
              merchantId: program.merchantId,
              customerId: refereeId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount,
              orderId: `referral_welcome_${created.id}`,
              outletId: null,
              staffId: null,
              meta: { mode: 'REFERRAL', welcome: true },
            },
          });
        }
      });
    }
    return {
      success: true,
      message: `Добро пожаловать! Вам начислено ${this.roundTwo(program.refereeReward ?? 0)} баллов`,
      referralId: created.id,
    };
  }

  /**
   * Завершить реферал после первой покупки
   */
  async completeReferral(
    refereeId: string,
    merchantId: string,
    purchaseAmount: number,
  ) {
    // Находим активированный реферал
    const referral = await this.prisma.referral.findFirst({
      where: {
        refereeId,
        status: 'ACTIVATED',
        program: {
          merchantId,
          status: 'ACTIVE',
          isActive: true,
        },
      },
      include: {
        program: true,
      },
    });

    if (!referral) {
      return null; // Нет активного реферала
    }

    // Проверяем минимальную сумму покупки
    const normalizedAmount = Number(purchaseAmount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return null;
    }
    if (normalizedAmount < referral.program.minPurchaseAmount) {
      return null; // Сумма покупки меньше минимальной
    }

    // Обновляем статус реферала
    const rewardAmount = this.computeReferrerReward(
      referral.program,
      normalizedAmount,
    );

    await this.prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        purchaseAmount: normalizedAmount,
      },
    });

    // Начисляем бонус приглашающему (как REFERRAL)
    if (rewardAmount > 0) {
      await this.prisma.$transaction(async (tx) => {
        let wallet = await tx.wallet.findFirst({
          where: {
            customerId: referral.referrerId,
            merchantId,
            type: WalletType.POINTS,
          },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              customerId: referral.referrerId,
              merchantId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });
        }
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: rewardAmount } },
        });
        await tx.transaction.create({
          data: {
            customerId: referral.referrerId,
            merchantId,
            type: TxnType.REFERRAL,
            amount: rewardAmount,
            orderId: `referral_reward_${referral.id}`,
            outletId: null,
            staffId: null,
          },
        });
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId: referral.referrerId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount: rewardAmount,
              orderId: `referral_reward_${referral.id}`,
              outletId: null,
              staffId: null,
              meta: { mode: 'REFERRAL', level: 1 },
            },
          });
        }
      });

      // Уведомляем приглашающего
      await this.notifyReferrerAboutCompletion(referral, rewardAmount);
    }

    return {
      success: true,
      referralId: referral.id,
      rewardIssued: rewardAmount,
    };
  }

  /**
   * Получить статистику реферальной программы
   */
  async getReferralStats(
    merchantId: string,
    programId?: string,
  ): Promise<ReferralStats> {
    const where: Prisma.ReferralProgramWhereInput = {};

    if (programId) {
      where.id = programId;
    } else {
      where.merchantId = merchantId;
      where.status = 'ACTIVE';
    }

    const program = await this.prisma.referralProgram.findFirst({
      where,
      include: {
        referrals: {
          include: {
            referrer: true,
          },
        },
      },
    });

    if (!program) {
      throw new BadRequestException('Реферальная программа не найдена');
    }

    const totalReferrals = program.referrals.length;
    const successfulReferrals = program.referrals.filter(
      (r) => r.status === 'COMPLETED',
    ).length;
    const pendingReferrals = program.referrals.filter(
      (r) => r.status === 'PENDING',
    ).length;
    const friendReward = this.roundTwo(program.refereeReward ?? 0);
    const baseProgram = program as unknown as ReferralProgram;

    let totalRewardsIssued = 0;
    for (const referral of program.referrals) {
      if (referral.status === 'COMPLETED') {
        totalRewardsIssued += friendReward;
        totalRewardsIssued += this.computeReferrerReward(
          baseProgram,
          referral.purchaseAmount ?? undefined,
        );
      } else if (referral.status === 'ACTIVATED') {
        totalRewardsIssued += friendReward;
      }
    }

    const conversionRate =
      totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0;

    // Группируем по приглашающим
    const referrerMap = new Map<
      string,
      {
        customerId: string;
        name: string;
        referralsCount: number;
        rewardsEarned: number;
      }
    >();

    for (const referral of program.referrals) {
      const referrerId = referral.referrerId;

      if (!referrerMap.has(referrerId)) {
        referrerMap.set(referrerId, {
          customerId: referrerId,
          name: referral.referrer.name || 'Без имени',
          referralsCount: 0,
          rewardsEarned: 0,
        });
      }

      const referrer = referrerMap.get(referrerId)!;
      referrer.referralsCount++;

      if (referral.status === 'COMPLETED') {
        referrer.rewardsEarned += this.computeReferrerReward(
          baseProgram,
          referral.purchaseAmount ?? undefined,
        );
      }
    }

    const topReferrers = Array.from(referrerMap.values())
      .sort((a, b) => b.referralsCount - a.referralsCount)
      .slice(0, 10);

    return {
      totalReferrals,
      successfulReferrals,
      pendingReferrals,
      totalRewardsIssued,
      conversionRate: Math.round(conversionRate * 10) / 10,
      topReferrers,
    };
  }

  /**
   * Получить рефералы клиента
   */
  async getCustomerReferrals(customerId: string, merchantId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: {
        referrerId: customerId,
        program: {
          merchantId,
        },
      },
      include: {
        referee: true,
        program: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const stats = {
      total: referrals.length,
      pending: referrals.filter((r) => r.status === 'PENDING').length,
      activated: referrals.filter((r) => r.status === 'ACTIVATED').length,
      completed: referrals.filter((r) => r.status === 'COMPLETED').length,
      totalEarned: 0,
      referrals: [] as CustomerReferralRow[],
    };

    for (const referral of referrals) {
      const programData = referral.program as unknown as ReferralProgram;
      let reward = 0;
      if (referral.status === 'COMPLETED') {
        reward = this.computeReferrerReward(
          programData,
          referral.purchaseAmount ?? undefined,
        );
        stats.totalEarned += reward;
      }

      stats.referrals.push({
        id: referral.id,
        code: referral.code,
        status: referral.status,
        refereeName: referral.referee?.name,
        refereePhone: referral.refereePhone,
        createdAt: referral.createdAt,
        activatedAt: referral.activatedAt,
        completedAt: referral.completedAt,
        reward,
      });
    }

    return stats;
  }

  /**
   * Получить реферальную ссылку клиента
   */
  async getCustomerReferralLink(customerId: string, merchantId: string) {
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    // Проверяем активную программу
    const program = await this.prisma.referralProgram.findFirst({
      where: {
        merchantId,
        OR: [{ status: 'ACTIVE' }, { isActive: true }],
      },
      include: {
        merchant: { select: { name: true } },
      },
    });

    if (!program) {
      throw new BadRequestException('Реферальная программа не активна');
    }

    // Получаем или создаем персональный код
    let referralCode = await this.getPersonalReferralCode(
      customerId,
      program.id,
    );

    if (!referralCode) {
      referralCode = await this.generateReferralCode(merchantId);

      // Сохраняем персональный код
      await this.prisma.personalReferralCode.create({
        data: {
          customerId,
          programId: program.id,
          merchantId: program.merchantId,
          code: referralCode,
        },
      });
    }

    return {
      code: referralCode,
      link: await this.generateReferralLink(merchantId, referralCode),
      qrCode: await this.generateQrCodeUrl(merchantId, referralCode),
      program: {
        id: program.id,
        name: program.name,
        description: program.description,
        rewardType: program.rewardType,
        referrerReward: this.roundTwo(program.referrerReward ?? 0),
        refereeReward: this.roundTwo(program.refereeReward ?? 0),
        merchantName: program.merchant?.name || '',
        messageTemplate: this.normalizeMessageTemplate(program.messageTemplate),
        placeholders: this.normalizePlaceholders(program.placeholders),
        shareMessageTemplate: this.normalizeShareMessage(
          program.shareButtonText,
        ),
      },
    };
  }

  // Вспомогательные методы

  private async generateReferralCode(_merchantId: string): Promise<string> {
    const prefix = crypto.randomBytes(3).toString('hex').toUpperCase();
    let code: string;
    let isUnique = false;

    while (!isUnique) {
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      code = `${prefix}${random}`;

      const existing = await this.prisma.referral.findFirst({
        where: { code },
      });

      const existingPersonal = await this.prisma.personalReferralCode.findFirst(
        {
          where: { code },
        },
      );

      isUnique = !existing && !existingPersonal;
    }

    return code!;
  }

  private async generateReferralLink(
    merchantId: string,
    code: string,
  ): Promise<string> {
    // Use Telegram Mini App deep link with plain startapp ref_ code if bot is configured
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const username = settings?.telegramBotUsername || null;
    if (username) {
      const uname = username.startsWith('@') ? username.slice(1) : username;
      const startParam = `ref_${code}`;
      return `https://t.me/${uname}/?startapp=${encodeURIComponent(startParam)}`;
    }
    // Fallback to website link if Telegram Mini App is not configured
    const baseUrl =
      this.configService.get('WEBSITE_URL') || 'https://loyalty.com';
    return `${baseUrl.replace(/\/$/, '')}/referral/${merchantId}/${code}`;
  }

  private async generateQrCodeUrl(
    merchantId: string,
    code: string,
  ): Promise<string> {
    const link = await this.generateReferralLink(merchantId, code);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  }

  private async getPersonalReferralCode(
    customerId: string,
    programId: string,
  ): Promise<string | null> {
    const personal = await this.prisma.personalReferralCode.findFirst({
      where: {
        customerId,
        programId,
      },
    });

    return personal?.code || null;
  }

  // sendReferralEmail() — удалено вместе с одноразовыми инвайтами

  private async notifyReferrerAboutCompletion(
    referral: ReferralWithProgram,
    reward: number,
  ) {
    const referrer = await this.prisma.customer.findUnique({
      where: { id: referral.referrerId },
    });

    if (!referrer) return;

    if (referrer.email) {
      await this.emailService
        .sendEmail({
          to: referrer.email,
          subject: 'Бонус за приглашение друга начислен!',
          template: 'referral_completed',
          data: {
            customerName: referrer.name || 'Уважаемый клиент',
            reward,
          },
          merchantId: referral.program.merchantId,
          customerId: referrer.id,
        })
        .catch(console.error);
    }
  }

  private configService = {
    get: (key: string) => process.env[key],
  };

  private roundTwo(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  private normalizePlaceholders(input?: unknown): string[] {
    const set = new Set<string>();
    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item !== 'string') continue;
        const normalized = item.trim().toLowerCase();
        const original = REFERRAL_PLACEHOLDERS.find((p) => p === normalized);
        if (original) set.add(original);
      }
    }
    if (!set.size) {
      REFERRAL_PLACEHOLDERS.forEach((placeholder) => set.add(placeholder));
    }
    return Array.from(set);
  }

  private normalizeMessageTemplate(message?: string | null) {
    const fallback =
      'Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или вашим кодом {code}.';
    if (typeof message !== 'string') return fallback;
    const trimmed = message.trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, 300);
  }

  private normalizeShareMessage(text?: string | null) {
    const fallback =
      'Переходите по ссылке {link} и получите {bonusamount} бонусов на баланс в программе лояльности {businessname}';
    if (typeof text !== 'string') return fallback;
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, 300);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private normalizeLevels(
    levels: unknown,
    multiLevel: boolean,
    rewardType: RewardMode,
    baseReward: number,
  ): Array<{ level: number; enabled: boolean; reward: number }> {
    const source = Array.isArray(levels) ? levels : [];
    const normalized: Array<{
      level: number;
      enabled: boolean;
      reward: number;
    }> = [];
    for (let level = 1; level <= 5; level += 1) {
      const found =
        this.asRecord(
          source.find((item) => Number(this.asRecord(item)?.level) === level),
        ) ?? {};
      const mandatory = level <= 2;
      const enabled = multiLevel
        ? mandatory
          ? true
          : Boolean(found.enabled)
        : false;
      const raw = multiLevel
        ? Number(found.reward ?? (level === 1 ? baseReward : 0))
        : 0;
      let reward = Number.isFinite(raw) ? raw : 0;
      if (reward < 0) reward = 0;
      if (rewardType === 'PERCENT' && reward > 100) reward = 100;
      normalized.push({ level, enabled, reward: this.roundTwo(reward) });
    }
    return normalized;
  }

  private normalizeBaseReward(
    value: number,
    rewardType: RewardMode,
    multiLevel: boolean,
  ) {
    let reward = Number.isFinite(value) ? value : 0;
    if (reward < 0) reward = 0;
    if (!multiLevel && rewardType === 'PERCENT' && reward > 100) reward = 100;
    return this.roundTwo(reward);
  }

  private computeReferrerReward(
    program: ReferralProgram,
    purchaseAmount?: number,
  ) {
    const base = this.roundTwo(program.referrerReward ?? 0);
    if (program.rewardType === 'PERCENT') {
      const amount =
        typeof purchaseAmount === 'number' && Number.isFinite(purchaseAmount)
          ? purchaseAmount
          : 0;
      if (amount <= 0 || base <= 0) return 0;
      return this.roundTwo((amount * base) / 100);
    }
    return base;
  }

  private mapProgramToSettings(
    program: ReferralProgram & { merchant?: { name: string } | null },
  ) {
    const rewardMode: RewardMode =
      program.rewardType === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const rewardTrigger: RewardTrigger =
      program.rewardTrigger === 'all' ? 'all' : 'first';
    const baseReward = this.roundTwo(program.referrerReward ?? 0);
    const levels = this.normalizeLevels(
      program.levelRewards,
      program.multiLevel ?? false,
      rewardMode,
      baseReward,
    );
    return {
      programId: program.id,
      enabled: program.status === 'ACTIVE' && program.isActive !== false,
      rewardTrigger,
      rewardType: rewardMode === 'PERCENT' ? 'percent' : 'fixed',
      multiLevel: Boolean(program.multiLevel),
      rewardValue: baseReward,
      levels,
      friendReward: this.roundTwo(program.refereeReward ?? 0),
      stackWithRegistration: Boolean(program.stackWithRegistration),
      message: this.normalizeMessageTemplate(program.messageTemplate),
      placeholders: this.normalizePlaceholders(program.placeholders),
      merchantName: program.merchant?.name || '',
      shareMessageTemplate: this.normalizeShareMessage(program.shareButtonText),
      minPurchaseAmount: Math.max(
        0,
        Math.round(program.minPurchaseAmount ?? 0),
      ),
    };
  }

  /**
   * Получить активную программу
   */
  async getActiveProgram(merchantId: string) {
    return this.prisma.referralProgram.findFirst({
      where: {
        merchantId,
        status: 'ACTIVE',
      },
    });
  }

  async getProgramSettingsForMerchant(merchantId: string) {
    const program = await this.prisma.referralProgram.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: { merchant: { select: { name: true } } },
    });

    if (!program) {
      return {
        programId: null,
        enabled: false,
        rewardTrigger: 'first' as RewardTrigger,
        rewardType: 'fixed',
        multiLevel: false,
        rewardValue: 300,
        levels: this.normalizeLevels([], false, 'FIXED', 300),
        friendReward: 0,
        stackWithRegistration: false,
        message: this.normalizeMessageTemplate(null),
        placeholders: this.normalizePlaceholders(null),
        merchantName: '',
        shareMessageTemplate: this.normalizeShareMessage(null),
        minPurchaseAmount: 0,
      };
    }

    return this.mapProgramToSettings(program);
  }

  async updateProgramSettingsFromPortal(
    merchantId: string,
    payload: ReferralProgramSettingsDto,
  ) {
    const existing = await this.prisma.referralProgram.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });

    const rewardType: RewardMode =
      payload.rewardType === 'percent' ? 'PERCENT' : 'FIXED';
    const rewardTrigger: RewardTrigger =
      payload.rewardTrigger === 'all' ? 'all' : 'first';
    const multiLevel = Boolean(payload.multiLevel);
    const normalizedLevels = this.normalizeLevels(
      payload.levels,
      multiLevel,
      rewardType,
      payload.rewardValue,
    );
    const baseReward = multiLevel
      ? (normalizedLevels.find((level) => level.level === 1)?.reward ?? 0)
      : this.normalizeBaseReward(payload.rewardValue, rewardType, multiLevel);
    const friendReward = this.roundTwo(payload.friendReward);
    const status = payload.enabled ? 'ACTIVE' : 'PAUSED';
    const minPurchaseAmount = Math.max(
      0,
      Math.round(payload.minPurchaseAmount ?? 0),
    );

    const normalizedPlaceholders = this.normalizePlaceholders(
      payload.placeholders ?? existing?.placeholders ?? null,
    );

    const data = {
      rewardTrigger,
      rewardType,
      multiLevel,
      levelRewards: multiLevel ? normalizedLevels : Prisma.JsonNull,
      referrerReward: this.roundTwo(baseReward),
      refereeReward: friendReward,
      stackWithRegistration: payload.stackWithRegistration,
      messageTemplate: this.normalizeMessageTemplate(payload.message),
      placeholders: normalizedPlaceholders,
      // сохраняем шаблон сообщения для отправки
      shareButtonText: this.normalizeShareMessage(payload.shareMessage),
      status,
      isActive: payload.enabled,
      minPurchaseAmount,
    } satisfies Prisma.ReferralProgramUpdateInput;

    if (existing) {
      await this.prisma.referralProgram.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.referralProgram.create({
        data: {
          merchantId,
          name: 'Реферальная программа',
          description: null,
          maxReferrals: 100,
          ...data,
        },
      });
    }

    return this.getProgramSettingsForMerchant(merchantId);
  }

  /**
   * Обновить программу
   */
  async updateProgram(
    programId: string,
    dto: Partial<CreateReferralProgramDto>,
  ) {
    const existing = await this.prisma.referralProgram.findUnique({
      where: { id: programId },
    });
    if (!existing) {
      throw new BadRequestException('Реферальная программа не найдена');
    }

    const rewardType: RewardMode = dto.rewardType
      ? dto.rewardType === 'PERCENT'
        ? 'PERCENT'
        : 'FIXED'
      : existing.rewardType === 'PERCENT'
        ? 'PERCENT'
        : 'FIXED';
    const rewardTrigger: RewardTrigger =
      dto.rewardTrigger === 'all'
        ? 'all'
        : existing.rewardTrigger === 'all'
          ? 'all'
          : 'first';
    const multiLevel =
      dto.multiLevel !== undefined ? dto.multiLevel : existing.multiLevel;
    const baseRewardInput =
      dto.referrerReward !== undefined
        ? dto.referrerReward
        : existing.referrerReward;
    const normalizedLevels = this.normalizeLevels(
      dto.levelRewards !== undefined ? dto.levelRewards : existing.levelRewards,
      multiLevel,
      rewardType,
      baseRewardInput ?? 0,
    );
    const referrerReward = multiLevel
      ? (normalizedLevels.find((level) => level.level === 1)?.reward ?? 0)
      : this.normalizeBaseReward(baseRewardInput ?? 0, rewardType, multiLevel);
    const refereeReward =
      dto.refereeReward !== undefined
        ? dto.refereeReward
        : existing.refereeReward;
    const status = dto.status ?? existing.status;
    const messageTemplate = dto.messageTemplate ?? existing.messageTemplate;
    const placeholders = dto.placeholders ?? existing.placeholders;
    const shareMessage =
      // поддержка поля в DTO, если придёт из контроллера
      dto.shareMessage !== undefined
        ? dto.shareMessage
        : existing.shareButtonText;

    return this.prisma.referralProgram.update({
      where: { id: programId },
      data: {
        name: dto.name ?? existing.name,
        description: dto.description ?? existing.description ?? null,
        referrerReward,
        refereeReward: this.roundTwo(refereeReward ?? 0),
        minPurchaseAmount: dto.minPurchaseAmount ?? existing.minPurchaseAmount,
        maxReferrals: dto.maxReferrals ?? existing.maxReferrals,
        status,
        isActive: status === 'ACTIVE',
        rewardTrigger,
        rewardType,
        multiLevel,
        levelRewards: multiLevel ? normalizedLevels : Prisma.JsonNull,
        stackWithRegistration:
          dto.stackWithRegistration ?? existing.stackWithRegistration,
        messageTemplate: this.normalizeMessageTemplate(messageTemplate),
        placeholders: this.normalizePlaceholders(placeholders),
        // сохраняем шаблон сообщения для отправки
        shareButtonText: this.normalizeShareMessage(shareMessage),
      },
    });
  }

  // checkReferralCode() — удалено, используйте только персональные коды
}
