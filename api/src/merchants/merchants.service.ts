import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const s = merchant.settings ?? { earnBps: 500, redeemLimitBps: 5000 };
    return { merchantId, earnBps: s.earnBps, redeemLimitBps: s.redeemLimitBps };
  }

  async updateSettings(merchantId: string, earnBps: number, redeemLimitBps: number) {
    // убедимся, что мерчант есть
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId },
    });

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { earnBps, redeemLimitBps, updatedAt: new Date() },
      create: { merchantId, earnBps, redeemLimitBps },
    });
    return { merchantId, earnBps: updated.earnBps, redeemLimitBps: updated.redeemLimitBps };
  }
}
