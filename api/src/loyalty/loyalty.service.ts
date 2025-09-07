import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Mode, QuoteDto } from './dto';
import { HoldStatus, TxnType, WalletType } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const REDEEM_LIMIT_PCT = 0.5; // лимит списания 50%
const EARN_RATE = 0.05;       // начисление 5% (пример)

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  // MVP: userToken == customerId; позже сделаем QR/JWT
  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (found) return found;
    return this.prisma.customer.create({ data: { id: customerId } });
  }

  private async getPointsWallet(customerId: string) {
    let wallet = await this.prisma.wallet.findFirst({ where: { customerId, type: WalletType.POINTS } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { customerId, type: WalletType.POINTS, balance: 0 } });
    }
    return wallet;
  }

  async quote(dto: QuoteDto) {
    const customer = await this.ensureCustomerId(dto.userToken);
    const wallet = await this.getPointsWallet(customer.id);

    if (dto.mode === Mode.REDEEM) {
      // БЕЗ проверки "есть другие скидки" — списываем по лимиту
      const limit = Math.floor(dto.eligibleTotal * REDEEM_LIMIT_PCT);
      const discountToApply = Math.min(wallet.balance, limit);
      const finalPayable = Math.max(0, Math.floor(dto.total - discountToApply));

      const hold = await this.prisma.hold.create({
        data: {
          id: uuid(),
          customerId: customer.id,
          mode: 'REDEEM',
          redeemAmount: discountToApply,
          orderId: dto.orderId,
          status: 'PENDING'
        }
      });

      return {
        canRedeem: discountToApply > 0,
        discountToApply,
        pointsToBurn: discountToApply,
        finalPayable,
        holdId: hold.id,
        message: discountToApply > 0
          ? `Списываем ${discountToApply} ₽, к оплате ${finalPayable} ₽`
          : 'Недостаточно баллов для списания.'
      };
    }

    // EARN
    const points = Math.floor(dto.eligibleTotal * EARN_RATE);
    const hold = await this.prisma.hold.create({
      data: {
        id: uuid(),
        customerId: customer.id,
        mode: 'EARN',
        earnPoints: points,
        orderId: dto.orderId,
        status: 'PENDING'
      }
    });

    return {
      canEarn: points > 0,
      pointsToEarn: points,
      holdId: hold.id,
      message: points > 0
        ? `Начислим ${points} баллов после оплаты.`
        : 'Сумма слишком мала для начисления.'
    };
  }

  async commit(holdId: string, orderId: string, receiptNumber?: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== HoldStatus.PENDING) throw new ConflictException('Hold already finished');

    const wallet = await this.getPointsWallet(hold.customerId);

    return this.prisma.$transaction(async (tx) => {
      if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
        const amount = Math.min(wallet.balance, hold.redeemAmount); // защита от гонок
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance - amount } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, type: TxnType.REDEEM, amount: -amount, orderId }
        });
      }
      if (hold.mode === 'EARN' && hold.earnPoints > 0) {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance + hold.earnPoints } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, type: TxnType.EARN, amount: hold.earnPoints, orderId }
        });
      }
      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.COMMITTED, orderId, receiptId: receiptNumber }
      });
      return { ok: true };
    });
  }

  async cancel(holdId: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== HoldStatus.PENDING) throw new ConflictException('Hold already finished');
    await this.prisma.hold.update({ where: { id: holdId }, data: { status: HoldStatus.CANCELED } });
    return { ok: true };
  }

  async balance(customerId: string) {
    const wallet = await this.getPointsWallet(customerId);
    return { customerId, balance: wallet.balance };
  }  
}
