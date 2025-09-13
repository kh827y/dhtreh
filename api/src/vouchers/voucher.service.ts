import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import * as crypto from 'crypto';

export interface CreateVoucherDto {
  merchantId: string;
  type: 'GIFT_CARD' | 'VOUCHER' | 'COUPON';
  name: string;
  description?: string;
  value: number; // Сумма в баллах или процент скидки
  valueType: 'POINTS' | 'PERCENT' | 'FIXED_AMOUNT';
  quantity?: number; // Количество ваучеров (-1 для неограниченного)
  validFrom?: Date;
  validUntil?: Date;
  minPurchaseAmount?: number;
  maxUsesPerCustomer?: number;
  maxTotalUses?: number;
  applicableProducts?: string[];
  applicableCategories?: string[];
  metadata?: any;
}

export interface CreateGiftCardDto {
  merchantId: string;
  purchaserId: string;
  recipientPhone?: string;
  recipientEmail?: string;
  recipientName?: string;
  amount: number; // Номинал карты в баллах
  message?: string;
  validUntil?: Date;
  sendNotification?: boolean;
}

export interface RedeemVoucherDto {
  code: string;
  customerId: string;
  merchantId: string;
  purchaseAmount?: number;
  metadata?: any;
}

@Injectable()
export class VoucherService {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

  /**
   * Создать ваучер/купон
   */
  async createVoucher(dto: CreateVoucherDto) {
    const codes: string[] = [];
    const quantity = dto.quantity || 1;
    
    // Генерируем коды
    for (let i = 0; i < Math.min(quantity, 1000); i++) {
      const code = await this.generateVoucherCode(dto.merchantId, dto.type);
      codes.push(code);
    }

    // Создаем ваучер
    const voucher = await this.prisma.voucher.create({
      data: {
        merchantId: dto.merchantId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        value: dto.value,
        valueType: dto.valueType,
        quantity: dto.quantity || 1,
        remainingQuantity: dto.quantity || 1,
        validFrom: dto.validFrom || new Date(),
        validUntil: dto.validUntil,
        minPurchaseAmount: dto.minPurchaseAmount || 0,
        maxUsesPerCustomer: dto.maxUsesPerCustomer || 1,
        maxTotalUses: dto.maxTotalUses || dto.quantity || 1,
        applicableProducts: dto.applicableProducts,
        applicableCategories: dto.applicableCategories,
        metadata: dto.metadata,
        status: 'ACTIVE',
      },
    });

    // Создаем коды ваучеров
    const voucherCodes = await Promise.all(
      codes.map(code =>
        this.prisma.voucherCode.create({
          data: {
            voucherId: voucher.id,
            code,
            status: 'ACTIVE',
          },
        })
      )
    );

    return {
      voucher,
      codes: voucherCodes.map(vc => ({
        code: vc.code,
        qrCode: this.generateQrCode(dto.merchantId, vc.code),
      })),
    };
  }

  /**
   * Создать подарочную карту
   */
  async createGiftCard(dto: CreateGiftCardDto) {
    // Генерируем уникальный код
    const code = await this.generateVoucherCode(dto.merchantId, 'GIFT_CARD');
    
    // Создаем ваучер типа подарочная карта
    const giftCard = await this.prisma.voucher.create({
      data: {
        merchantId: dto.merchantId,
        type: 'GIFT_CARD',
        name: `Подарочная карта на ${dto.amount} баллов`,
        description: dto.message,
        value: dto.amount,
        valueType: 'POINTS',
        quantity: 1,
        remainingQuantity: 1,
        validFrom: new Date(),
        validUntil: dto.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 год
        maxUsesPerCustomer: 1,
        maxTotalUses: 1,
        status: 'ACTIVE',
        metadata: {
          purchaserId: dto.purchaserId,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          recipientEmail: dto.recipientEmail,
          message: dto.message,
        },
      },
    });

    // Создаем код карты
    const giftCardCode = await this.prisma.voucherCode.create({
      data: {
        voucherId: giftCard.id,
        code,
        status: 'ACTIVE',
      },
    });

    // Списываем баллы у покупателя
    await this.loyaltyService.redeem({
      customerId: dto.purchaserId,
      merchantId: dto.merchantId,
      amount: dto.amount,
      orderId: `gift_card_${giftCard.id}`,
    });

    // Отправляем уведомление получателю
    if (dto.sendNotification && (dto.recipientPhone || dto.recipientEmail)) {
      await this.sendGiftCardNotification(giftCard, code, dto);
    }

    return {
      id: giftCard.id,
      code,
      amount: dto.amount,
      validUntil: giftCard.validUntil,
      qrCode: this.generateQrCode(dto.merchantId, code),
      recipientName: dto.recipientName,
    };
  }

  /**
   * Активировать ваучер/подарочную карту
   */
  async redeemVoucher(dto: RedeemVoucherDto) {
    // Находим код ваучера
    const voucherCode = await this.prisma.voucherCode.findFirst({
      where: {
        code: dto.code,
        status: 'ACTIVE',
      },
      include: {
        voucher: {
          include: {
            merchant: true,
          },
        },
        usages: {
          where: {
            customerId: dto.customerId,
          },
        },
      },
    });

    if (!voucherCode) {
      throw new BadRequestException('Недействительный код');
    }

    const voucher = voucherCode.voucher;

    // Проверяем мерчанта
    if (voucher.merchantId !== dto.merchantId) {
      throw new BadRequestException('Код не принадлежит этому магазину');
    }

    // Проверяем срок действия
    const now = new Date();
    if ((voucher.validFrom && voucher.validFrom > now) || (voucher.validUntil && voucher.validUntil < now)) {
      throw new BadRequestException('Срок действия кода истек или еще не начался');
    }

    // Проверяем статус ваучера
    if (voucher.status !== 'ACTIVE') {
      throw new BadRequestException('Ваучер неактивен');
    }

    // Проверяем количество использований
    if (voucher.remainingQuantity <= 0) {
      throw new BadRequestException('Все коды уже использованы');
    }

    // Проверяем лимит на клиента
    const customerUsages = voucherCode.usages.length;
    if (voucher.maxUsesPerCustomer != null && customerUsages >= voucher.maxUsesPerCustomer) {
      throw new BadRequestException(`Вы уже использовали этот код ${customerUsages} раз(а)`);
    }

    // Проверяем общий лимит использований
    const totalUsages = await this.prisma.voucherUsage.count({
      where: { voucherId: voucher.id },
    });
    if (voucher.maxTotalUses != null && totalUsages >= voucher.maxTotalUses) {
      throw new BadRequestException('Достигнут лимит использования кода');
    }

    // Проверяем минимальную сумму покупки
    if (dto.purchaseAmount && voucher.minPurchaseAmount != null && dto.purchaseAmount < voucher.minPurchaseAmount) {
      throw new BadRequestException(
        `Минимальная сумма покупки: ${voucher.minPurchaseAmount}`
      );
    }

    // Рассчитываем значение
    let rewardAmount = 0;
    let description = '';

    switch (voucher.valueType) {
      case 'POINTS':
        rewardAmount = voucher.value;
        description = `Начисление ${rewardAmount} баллов по коду ${dto.code}`;
        break;
      
      case 'PERCENT':
        if (!dto.purchaseAmount) {
          throw new BadRequestException('Требуется сумма покупки для процентной скидки');
        }
        rewardAmount = Math.floor(dto.purchaseAmount * voucher.value / 100);
        description = `Скидка ${voucher.value}% (${rewardAmount} баллов) по коду ${dto.code}`;
        break;
      
      case 'FIXED_AMOUNT':
        rewardAmount = voucher.value;
        description = `Скидка ${rewardAmount} руб по коду ${dto.code}`;
        break;
    }

    // Начисляем баллы или применяем скидку
    if (voucher.type === 'GIFT_CARD' || voucher.valueType === 'POINTS') {
      // Начисляем баллы
      await this.loyaltyService.earn({
        customerId: dto.customerId,
        merchantId: dto.merchantId,
        amount: rewardAmount,
        orderId: `voucher_${voucher.id}_${Date.now()}`,
      });
    }

    // Записываем использование
    await this.prisma.voucherUsage.create({
      data: {
        voucherId: voucher.id,
        codeId: voucherCode.id,
        customerId: dto.customerId,
        amount: rewardAmount,
        metadata: dto.metadata,
      },
    });

    // Обновляем количество
    await this.prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        remainingQuantity: { decrement: 1 },
        totalUsed: { increment: 1 },
      },
    });

    // Если это одноразовый код, деактивируем его
    if (voucher.maxUsesPerCustomer === 1) {
      await this.prisma.voucherCode.update({
        where: { id: voucherCode.id },
        data: { status: 'USED' },
      });
    }

    return {
      success: true,
      voucherId: voucher.id,
      voucherName: voucher.name,
      rewardType: voucher.valueType,
      rewardAmount,
      description,
    };
  }

  /**
   * Проверить ваучер
   */
  async checkVoucher(code: string, merchantId?: string) {
    const voucherCode = await this.prisma.voucherCode.findFirst({
      where: {
        code,
        status: 'ACTIVE',
      },
      include: {
        voucher: {
          include: {
            merchant: true,
          },
        },
      },
    });

    if (!voucherCode) {
      return {
        valid: false,
        message: 'Код не найден или уже использован',
      };
    }

    const voucher = voucherCode.voucher;

    if (merchantId && voucher.merchantId !== merchantId) {
      return {
        valid: false,
        message: 'Код не принадлежит этому магазину',
      };
    }

    const now = new Date();
    if (voucher.validFrom && voucher.validFrom > now) {
      return {
        valid: false,
        message: `Код будет активен с ${voucher.validFrom.toLocaleDateString('ru-RU')}`,
      };
    }

    if (voucher.validUntil && voucher.validUntil < now) {
      return {
        valid: false,
        message: 'Срок действия кода истек',
      };
    }

    if (voucher.status !== 'ACTIVE') {
      return {
        valid: false,
        message: 'Ваучер неактивен',
      };
    }

    if (voucher.remainingQuantity <= 0) {
      return {
        valid: false,
        message: 'Все коды уже использованы',
      };
    }

    return {
      valid: true,
      voucher: {
        id: voucher.id,
        name: voucher.name,
        description: voucher.description,
        type: voucher.type,
        value: voucher.value,
        valueType: voucher.valueType,
        minPurchaseAmount: voucher.minPurchaseAmount,
        validUntil: voucher.validUntil,
        merchantName: voucher.merchant.name,
      },
    };
  }

  /**
   * Получить список ваучеров мерчанта
   */
  async getVouchers(merchantId: string, status?: string) {
    const where: any = { merchantId };
    if (status) {
      where.status = status;
    }

    return this.prisma.voucher.findMany({
      where,
      include: {
        _count: {
          select: {
            codes: true,
            usages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить статистику ваучера
   */
  async getVoucherStats(voucherId: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        codes: true,
        usages: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (!voucher) {
      throw new NotFoundException('Ваучер не найден');
    }

    const stats = {
      voucher: {
        id: voucher.id,
        name: voucher.name,
        type: voucher.type,
        status: voucher.status,
        value: voucher.value,
        valueType: voucher.valueType,
      },
      codes: {
        total: voucher.codes.length,
        active: voucher.codes.filter(c => c.status === 'ACTIVE').length,
        used: voucher.codes.filter(c => c.status === 'USED').length,
      },
      usage: {
        total: voucher.usages.length,
        uniqueCustomers: new Set(voucher.usages.map(u => u.customerId)).size,
        totalValue: voucher.usages.reduce((sum, u) => sum + (u.amount || 0), 0),
      },
      performance: {
        conversionRate: voucher.codes.length > 0 
          ? (voucher.usages.length / voucher.codes.length) * 100 
          : 0,
        averageValue: voucher.usages.length > 0
          ? voucher.usages.reduce((sum, u) => sum + (u.amount || 0), 0) / voucher.usages.length
          : 0,
      },
      topUsers: this.getTopUsers(voucher.usages),
    };

    return stats;
  }

  /**
   * Получить историю использования ваучеров клиентом
   */
  async getCustomerVouchers(customerId: string, merchantId?: string) {
    const where: any = { customerId };
    if (merchantId) {
      where.voucher = { merchantId };
    }

    const usages = await this.prisma.voucherUsage.findMany({
      where,
      include: {
        voucher: true,
        code: true,
      },
      orderBy: { usedAt: 'desc' },
    });

    return usages.map(usage => ({
      id: usage.id,
      voucherName: usage.voucher.name,
      voucherType: usage.voucher.type,
      code: usage.code?.code || '',
      amount: usage.amount,
      usedAt: usage.usedAt,
    }));
  }

  /**
   * Массовая генерация промокодов
   */
  async generatePromoCodes(
    merchantId: string,
    voucherId: string,
    quantity: number
  ) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId, merchantId },
    });

    if (!voucher) {
      throw new NotFoundException('Ваучер не найден');
    }

    const codes: string[] = [];
    for (let i = 0; i < quantity; i++) {
      const code = await this.generateVoucherCode(merchantId, 'COUPON');
      codes.push(code);
    }

    const voucherCodes = await Promise.all(
      codes.map(code =>
        this.prisma.voucherCode.create({
          data: {
            voucherId,
            code,
            status: 'ACTIVE',
          },
        })
      )
    );

    // Обновляем количество
    await this.prisma.voucher.update({
      where: { id: voucherId },
      data: {
        quantity: { increment: quantity },
        remainingQuantity: { increment: quantity },
        maxTotalUses: { increment: quantity },
      },
    });

    return {
      voucherId,
      generated: voucherCodes.length,
      codes: voucherCodes.map(vc => vc.code),
    };
  }

  // Вспомогательные методы

  private async generateVoucherCode(merchantId: string, type: string): Promise<string> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    let prefix = '';
    switch (type) {
      case 'GIFT_CARD':
        prefix = 'GC';
        break;
      case 'VOUCHER':
        prefix = 'VC';
        break;
      case 'COUPON':
        prefix = merchant?.name.substring(0, 2).toUpperCase() || 'CP';
        break;
    }

    let code: string;
    let isUnique = false;

    while (!isUnique) {
      const random = crypto.randomBytes(4).toString('hex').toUpperCase();
      code = `${prefix}${random}`;
      
      const existing = await this.prisma.voucherCode.findFirst({
        where: { code },
      });
      
      isUnique = !existing;
    }

    return code!;
  }

  private generateQrCode(merchantId: string, code: string): string {
    const baseUrl = process.env.WEBSITE_URL || 'https://loyalty.com';
    const url = `${baseUrl}/voucher/${merchantId}/${code}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  }

  private async sendGiftCardNotification(giftCard: any, code: string, dto: CreateGiftCardDto) {
    // Здесь можно отправить SMS или email с кодом подарочной карты
    const message = `Вам подарили карту на ${dto.amount} баллов в ${giftCard.merchant?.name || 'магазине'}! 
Код: ${code}
${dto.message ? `Сообщение: ${dto.message}` : ''}
Действует до: ${giftCard.validUntil?.toLocaleDateString('ru-RU')}`;

    console.log('Gift card notification:', message);
    // Implement SMS/Email sending
  }

  private getTopUsers(usages: any[]): any[] {
    const userMap = new Map<string, { customerId: string; name: string; count: number; total: number }>();

    for (const usage of usages) {
      const key = usage.customerId;
      if (!userMap.has(key)) {
        userMap.set(key, {
          customerId: key,
          name: usage.customer?.name || 'Без имени',
          count: 0,
          total: 0,
        });
      }

      const user = userMap.get(key)!;
      user.count++;
      user.total += usage.amount || 0;
    }

    return Array.from(userMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  /**
   * Обновить ваучер
   */
  async updateVoucher(voucherId: string, dto: Partial<CreateVoucherDto>) {
    return this.prisma.voucher.update({
      where: { id: voucherId },
      data: dto,
    });
  }

  /**
   * Деактивировать ваучер
   */
  async deactivateVoucher(voucherId: string) {
    return this.prisma.voucher.update({
      where: { id: voucherId },
      data: { status: 'INACTIVE' },
    });
  }
}
