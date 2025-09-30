import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { EmailService } from '../notifications/email/email.service';
import * as crypto from 'crypto';

export interface CreateReferralProgramDto {
  merchantId: string;
  name: string;
  description?: string;
  referrerReward: number; // Баллы для приглашающего
  refereeReward: number;  // Баллы для приглашенного
  minPurchaseAmount?: number; // Минимальная сумма первой покупки
  maxReferrals?: number; // Максимум рефералов на человека
  expiryDays?: number; // Срок действия реферальной ссылки
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface CreateReferralDto {
  merchantId: string;
  referrerId: string; // ID приглашающего клиента
  refereePhone?: string;
  refereeEmail?: string;
  channel?: 'EMAIL' | 'LINK' | 'QR';
}

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
      throw new BadRequestException('У мерчанта уже есть активная реферальная программа');
    }

    return this.prisma.referralProgram.create({
      data: {
        merchantId: dto.merchantId,
        name: dto.name,
        description: dto.description,
        referrerReward: dto.referrerReward,
        refereeReward: dto.refereeReward,
        minPurchaseAmount: dto.minPurchaseAmount || 0,
        maxReferrals: dto.maxReferrals || 100,
        expiryDays: dto.expiryDays || 30,
        status: dto.status || 'ACTIVE',
      },
    });
  }

  /**
   * Создать реферальную ссылку/код
   */
  async createReferral(dto: CreateReferralDto) {
    // Получаем активную программу
    const program = await this.prisma.referralProgram.findFirst({
      where: {
        merchantId: dto.merchantId,
        status: 'ACTIVE',
      },
    });

    if (!program) {
      throw new BadRequestException('Реферальная программа не активна');
    }

    // Проверяем лимиты
    const existingReferrals = await this.prisma.referral.count({
      where: {
        referrerId: dto.referrerId,
        programId: program.id,
      },
    });

    if (program.maxReferrals != null && existingReferrals >= program.maxReferrals) {
      throw new BadRequestException(`Достигнут лимит рефералов (${program.maxReferrals})`);
    }

    // Генерируем уникальный код
    const referralCode = await this.generateReferralCode(dto.merchantId);
    
    // Вычисляем срок действия
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + program.expiryDays);

    // Создаем реферал
    const referral = await this.prisma.referral.create({
      data: {
        programId: program.id,
        referrerId: dto.referrerId,
        refereePhone: dto.refereePhone,
        refereeEmail: dto.refereeEmail,
        code: referralCode,
        status: 'PENDING',
        channel: dto.channel || 'LINK',
        expiresAt,
      },
      include: {
        referrer: true,
        program: {
          include: {
            merchant: true,
          },
        },
      },
    });

    // Отправляем приглашение
    if (dto.channel === 'EMAIL' && dto.refereeEmail) {
      await this.sendReferralEmail(referral);
    }

    return {
      id: referral.id,
      code: referralCode,
      link: this.generateReferralLink(dto.merchantId, referralCode),
      expiresAt,
    };
  }

  /**
   * Активировать реферальный код
   */
  async activateReferral(code: string, refereeId: string) {
    // Находим реферал по коду
    const referral = await this.prisma.referral.findFirst({
      where: {
        code,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        program: true,
      },
    });

    if (!referral) {
      throw new BadRequestException('Недействительный или истекший реферальный код');
    }

    // Проверяем, что это не самореферал
    if (referral.referrerId === refereeId) {
      throw new BadRequestException('Нельзя использовать свой собственный реферальный код');
    }

    // Проверяем, не был ли уже этот клиент приглашен
    const existingReferee = await this.prisma.referral.findFirst({
      where: {
        refereeId,
        programId: referral.programId,
      },
    });

    if (existingReferee) {
      throw new BadRequestException('Вы уже участвуете в реферальной программе');
    }

    // Обновляем реферал
    const updated = await this.prisma.referral.update({
      where: { id: referral.id },
      data: {
        refereeId,
        status: 'ACTIVATED',
        activatedAt: new Date(),
      },
    });

    // Начисляем приветственный бонус приглашенному
    if (referral.program.refereeReward > 0) {
      await this.loyaltyService.earn({
        customerId: refereeId,
        merchantId: referral.program.merchantId,
        amount: referral.program.refereeReward,
        orderId: `referral_welcome_${referral.id}`,
      });
    }

    return {
      success: true,
      message: `Добро пожаловать! Вам начислено ${referral.program.refereeReward} баллов`,
      referralId: updated.id,
    };
  }

  /**
   * Завершить реферал после первой покупки
   */
  async completeReferral(refereeId: string, merchantId: string, purchaseAmount: number) {
    // Находим активированный реферал
    const referral = await this.prisma.referral.findFirst({
      where: {
        refereeId,
        status: 'ACTIVATED',
        program: {
          merchantId,
          status: 'ACTIVE',
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
    if (purchaseAmount < referral.program.minPurchaseAmount) {
      return null; // Сумма покупки меньше минимальной
    }

    // Обновляем статус реферала
    await this.prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        purchaseAmount,
      },
    });

    // Начисляем бонус приглашающему
    if (referral.program.referrerReward > 0) {
      await this.loyaltyService.earn({
        customerId: referral.referrerId,
        merchantId,
        amount: referral.program.referrerReward,
        orderId: `referral_reward_${referral.id}`,
      });

      // Уведомляем приглашающего
      await this.notifyReferrerAboutCompletion(referral);
    }

    return {
      success: true,
      referralId: referral.id,
      rewardIssued: referral.program.referrerReward,
    };
  }

  /**
   * Получить статистику реферальной программы
   */
  async getReferralStats(merchantId: string, programId?: string): Promise<ReferralStats> {
    const where: any = {};
    
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
    const successfulReferrals = program.referrals.filter(r => r.status === 'COMPLETED').length;
    const pendingReferrals = program.referrals.filter(r => r.status === 'PENDING').length;
    
    const totalRewardsIssued = successfulReferrals * program.referrerReward + 
                              program.referrals.filter(r => r.status === 'ACTIVATED' || r.status === 'COMPLETED').length * program.refereeReward;
    
    const conversionRate = totalReferrals > 0 
      ? (successfulReferrals / totalReferrals) * 100 
      : 0;

    // Группируем по приглашающим
    const referrerMap = new Map<string, {
      customerId: string;
      name: string;
      referralsCount: number;
      rewardsEarned: number;
    }>();

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
        referrer.rewardsEarned += program.referrerReward;
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
      pending: referrals.filter(r => r.status === 'PENDING').length,
      activated: referrals.filter(r => r.status === 'ACTIVATED').length,
      completed: referrals.filter(r => r.status === 'COMPLETED').length,
      totalEarned: 0,
      referrals: [] as any[],
    };

    for (const referral of referrals) {
      if (referral.status === 'COMPLETED') {
        stats.totalEarned += referral.program.referrerReward;
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
        reward: referral.status === 'COMPLETED' ? referral.program.referrerReward : 0,
      });
    }

    return stats;
  }

  /**
   * Получить реферальную ссылку клиента
   */
  async getCustomerReferralLink(customerId: string, merchantId: string) {
    // Проверяем активную программу
    const program = await this.prisma.referralProgram.findFirst({
      where: {
        merchantId,
        status: 'ACTIVE',
      },
    });

    if (!program) {
      throw new BadRequestException('Реферальная программа не активна');
    }

    // Получаем или создаем персональный код
    let referralCode = await this.getPersonalReferralCode(customerId, program.id);
    
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
      link: this.generateReferralLink(merchantId, referralCode),
      qrCode: this.generateQrCodeUrl(merchantId, referralCode),
      program: {
        name: program.name,
        description: program.description,
        referrerReward: program.referrerReward,
        refereeReward: program.refereeReward,
      },
    };
  }

  // Вспомогательные методы

  private async generateReferralCode(merchantId: string): Promise<string> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    const prefix = merchant?.name.substring(0, 3).toUpperCase() || 'REF';
    let code: string;
    let isUnique = false;

    while (!isUnique) {
      const random = crypto.randomBytes(3).toString('hex').toUpperCase();
      code = `${prefix}${random}`;
      
      const existing = await this.prisma.referral.findFirst({
        where: { code },
      });
      
      const existingPersonal = await this.prisma.personalReferralCode.findFirst({
        where: { code },
      });
      
      isUnique = !existing && !existingPersonal;
    }

    return code!;
  }

  private generateReferralLink(merchantId: string, code: string): string {
    const baseUrl = this.configService.get('WEBSITE_URL') || 'https://loyalty.com';
    return `${baseUrl}/referral/${merchantId}/${code}`;
  }

  private generateQrCodeUrl(merchantId: string, code: string): string {
    const link = this.generateReferralLink(merchantId, code);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  }

  private async getPersonalReferralCode(customerId: string, programId: string): Promise<string | null> {
    const personal = await this.prisma.personalReferralCode.findFirst({
      where: {
        customerId,
        programId,
      },
    });

    return personal?.code || null;
  }

  private async sendReferralEmail(referral: any) {
    await this.emailService.sendEmail({
      to: referral.refereeEmail,
      subject: `Приглашение в программу лояльности ${referral.program.merchant.name}`,
      template: 'referral_invitation',
      data: {
        referrerName: referral.referrer.name || 'Ваш друг',
        merchantName: referral.program.merchant.name,
        refereeReward: referral.program.refereeReward,
        referralCode: referral.code,
        referralLink: this.generateReferralLink(referral.program.merchantId, referral.code),
      },
      merchantId: referral.program.merchantId,
    }).catch(console.error);
  }

  private async notifyReferrerAboutCompletion(referral: any) {
    const referrer = await this.prisma.customer.findUnique({
      where: { id: referral.referrerId },
    });

    if (!referrer) return;

    if (referrer.email) {
      await this.emailService.sendEmail({
        to: referrer.email,
        subject: 'Бонус за приглашение друга начислен!',
        template: 'referral_completed',
        data: {
          customerName: referrer.name || 'Уважаемый клиент',
          reward: referral.program.referrerReward,
        },
        merchantId: referral.program.merchantId,
        customerId: referrer.id,
      }).catch(console.error);
    }
  }

  private configService = {
    get: (key: string) => process.env[key],
  };

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

  /**
   * Обновить программу
   */
  async updateProgram(programId: string, dto: Partial<CreateReferralProgramDto>) {
    return this.prisma.referralProgram.update({
      where: { id: programId },
      data: dto,
    });
  }

  /**
   * Проверить реферальный код
   */
  async checkReferralCode(code: string) {
    const referral = await this.prisma.referral.findFirst({
      where: {
        code,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        program: {
          include: {
            merchant: true,
          },
        },
      },
    });

    if (!referral) {
      // Проверяем персональный код
      const personal = await this.prisma.personalReferralCode.findFirst({
        where: { code },
        include: {
          program: {
            include: {
              merchant: true,
            },
          },
        },
      });

      if (!personal || !personal.program || personal.program.status !== 'ACTIVE') {
        return {
          valid: false,
          message: 'Недействительный или истекший код',
        };
      }

      const prog = personal.program;
      return {
        valid: true,
        merchantId: prog.merchantId,
        merchantName: prog.merchant.name,
        refereeReward: prog.refereeReward,
        description: prog.description,
      };
    }

    return {
      valid: true,
      merchantId: referral.program.merchantId,
      merchantName: referral.program.merchant.name,
      refereeReward: referral.program.refereeReward,
      description: referral.program.description,
    };
  }
}
