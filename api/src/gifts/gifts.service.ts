import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { CreateGiftDto, UpdateGiftDto } from './dto';

@Injectable()
export class GiftsService {
  constructor(private prisma: PrismaService) {}

  async listGifts(merchantId: string) {
    const now = new Date();
    return this.prisma.gift.findMany({
      where: {
        merchantId,
        active: true,
        OR: [{ periodFrom: null }, { periodFrom: { lte: now } }],
        AND: [{ OR: [{ periodTo: null }, { periodTo: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGift(dto: CreateGiftDto) {
    if (dto.costPoints <= 0)
      throw new BadRequestException('costPoints must be > 0');
    await this.ensureMerchant(dto.merchantId);
    const data: any = {
      merchantId: dto.merchantId,
      title: dto.title,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      costPoints: dto.costPoints,
      active: dto.active ?? true,
      periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null,
      periodTo: dto.periodTo ? new Date(dto.periodTo) : null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
      inventory: dto.inventory ?? null,
    };
    return this.prisma.gift.create({ data });
  }

  async updateGift(giftId: string, dto: UpdateGiftDto) {
    const gift = await this.prisma.gift.findUnique({ where: { id: giftId } });
    if (!gift) throw new NotFoundException('Gift not found');
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.costPoints !== undefined) data.costPoints = dto.costPoints;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.periodFrom !== undefined)
      data.periodFrom = dto.periodFrom ? new Date(dto.periodFrom) : null;
    if (dto.periodTo !== undefined)
      data.periodTo = dto.periodTo ? new Date(dto.periodTo) : null;
    if (dto.perCustomerLimit !== undefined)
      data.perCustomerLimit = dto.perCustomerLimit;
    if (dto.inventory !== undefined) data.inventory = dto.inventory;
    return this.prisma.gift.update({ where: { id: giftId }, data });
  }

  async deactivateGift(giftId: string) {
    const gift = await this.prisma.gift.findUnique({ where: { id: giftId } });
    if (!gift) throw new NotFoundException('Gift not found');
    return this.prisma.gift.update({
      where: { id: giftId },
      data: { active: false },
    });
  }

  async redeemGift(merchantId: string, customerId: string, giftId: string) {
    const gift = await this.prisma.gift.findUnique({ where: { id: giftId } });
    if (!gift || gift.merchantId !== merchantId)
      throw new NotFoundException('Gift not found');
    const now = new Date();
    if (!gift.active) throw new BadRequestException('Gift is inactive');
    if (gift.periodFrom && gift.periodFrom > now)
      throw new BadRequestException('Gift is not yet available');
    if (gift.periodTo && gift.periodTo < now)
      throw new BadRequestException('Gift is expired');

    // Лимит на пользователя
    if (gift.perCustomerLimit != null) {
      const used = await this.prisma.giftRedemption.count({
        where: { merchantId, customerId, giftId, state: 'REDEEMED' },
      });
      if (used >= gift.perCustomerLimit)
        throw new BadRequestException('Per-customer limit reached');
    }

    // Инвентарь
    if (gift.inventory != null && gift.inventory <= 0)
      throw new BadRequestException('Gift is out of stock');

    // Баланс
    const wallet = await this.prisma.wallet.findFirst({
      where: { merchantId, customerId, type: 'POINTS' as any },
    });
    if (!wallet || (wallet.balance || 0) < gift.costPoints)
      throw new BadRequestException('Insufficient points');

    // Транзакция: списать баллы, записать redemption, уменьшить инвентарь
    const result = await this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if ((w!.balance || 0) < gift.costPoints)
        throw new BadRequestException('Insufficient points');
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: (w!.balance || 0) - gift.costPoints },
      });
      await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: 'REDEEM',
          amount: -gift.costPoints,
          orderId: `gift_${giftId}`,
        },
      });

      if (gift.inventory != null) {
        const fresh = await tx.gift.findUnique({ where: { id: giftId } });
        if (!fresh) throw new NotFoundException('Gift not found');
        if (fresh.inventory != null && fresh.inventory <= 0)
          throw new BadRequestException('Gift is out of stock');
        await tx.gift.update({
          where: { id: giftId },
          data: { inventory: (fresh.inventory || 0) - 1 },
        });
      }

      const code = this.randCode();
      const redemption = await tx.giftRedemption.create({
        data: {
          giftId,
          merchantId,
          customerId,
          code,
          state: 'REDEEMED',
          redeemedAt: new Date(),
        },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'gifts.redeemed',
          payload: {
            merchantId,
            customerId,
            giftId,
            code,
            at: new Date().toISOString(),
          } as any,
        },
      });
      return redemption;
    });

    return { ok: true, redemptionId: result.id, code: result.code };
  }

  private async ensureMerchant(merchantId: string) {
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: merchantId, initialName: merchantId },
      });
    } catch {}
  }

  private randCode() {
    const s =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return s
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 10)
      .toUpperCase();
  }
}
