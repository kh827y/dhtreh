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

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    // дефолты на случай пустоты
    return {
      earnBps: s?.earnBps ?? 500,          // 5%
      redeemLimitBps: s?.redeemLimitBps ?? 5000, // 50%
    };
  }

  private async getPointsWallet(customerId: string, merchantId: string) {
    let wallet = await this.prisma.wallet.findFirst({
      where: { customerId, merchantId, type: 'POINTS' },
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { customerId, merchantId, type: 'POINTS', balance: 0 },
      });
    }
    return wallet;
  }

  async quote(dto: any /* QuoteDto после resolve */) {
    const customer = await this.ensureCustomerId(dto.userToken);
    const { earnBps, redeemLimitBps } = await this.getSettings(dto.merchantId);
    const wallet = await this.getPointsWallet(customer.id, dto.merchantId);
  
    if (dto.mode === 'redeem') {
      const limit = Math.floor(dto.eligibleTotal * redeemLimitBps / 10000); // bps → %
      const discountToApply = Math.min(wallet.balance, limit);
      const finalPayable = Math.max(0, Math.floor(dto.total - discountToApply));
  
      const hold = await this.prisma.hold.create({
        data: {
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'REDEEM',
          redeemAmount: discountToApply,
          orderId: dto.orderId,
          status: 'PENDING',
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
          : 'Недостаточно баллов для списания.',
      };
    }
  
    // EARN
    const points = Math.floor(dto.eligibleTotal * earnBps / 10000);
    const hold = await this.prisma.hold.create({
      data: {
        customerId: customer.id,
        merchantId: dto.merchantId,
        mode: 'EARN',
        earnPoints: points,
        orderId: dto.orderId,
        status: 'PENDING',
      }
    });
  
    return {
      canEarn: points > 0,
      pointsToEarn: points,
      holdId: hold.id,
      message: points > 0 ? `Начислим ${points} баллов после оплаты.` : 'Сумма слишком мала для начисления.',
    };
  }  

  async commit(holdId: string, orderId: string, receiptNumber?: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== 'PENDING') throw new ConflictException('Hold already finished');
  
    const wallet = await this.getPointsWallet(hold.customerId, hold.merchantId);
  
    return this.prisma.$transaction(async (tx) => {
      if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
        const amount = Math.min(wallet.balance, hold.redeemAmount);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance - amount } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: 'REDEEM', amount: -amount, orderId }
        });
      }
      if (hold.mode === 'EARN' && hold.earnPoints > 0) {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance + hold.earnPoints } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: 'EARN', amount: hold.earnPoints, orderId }
        });
      }
      await tx.hold.update({
        where: { id: hold.id },
        data: { status: 'COMMITTED', orderId, receiptId: receiptNumber }
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

  async balance(merchantId: string, customerId: string) {
    const wallet = await this.getPointsWallet(customerId, merchantId);
    return { merchantId, customerId, balance: wallet.balance };
  }  
}
