import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Mode, QuoteDto } from './dto';
import { HoldStatus, TxnType, WalletType } from '@prisma/client';
import { v4 as uuid } from 'uuid';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  // Создаём клиента по факту, если не был создан ранее
  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (found) return found;
    return this.prisma.customer.create({ data: { id: customerId } });
  }

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    return {
      earnBps: s?.earnBps ?? 500,          // 5%
      redeemLimitBps: s?.redeemLimitBps ?? 5000, // 50%
    };
  }

  private async getPointsWallet(customerId: string, merchantId: string) {
    let wallet = await this.prisma.wallet.findFirst({
      where: { customerId, merchantId, type: WalletType.POINTS },
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
      });
    }
    return wallet;
  }

  // Сюда приходит dto.userToken уже как customerId (контроллер делает resolve)
  async quote(dto: QuoteDto & { userToken: string }) {
    const customer = await this.ensureCustomerId(dto.userToken);
    const { earnBps, redeemLimitBps } = await this.getSettings(dto.merchantId);
    const wallet = await this.getPointsWallet(customer.id, dto.merchantId);

    if (dto.mode === Mode.REDEEM) {
      const limit = Math.floor(dto.eligibleTotal * redeemLimitBps / 10000);
      const discountToApply = Math.min(wallet.balance, limit);
      const finalPayable = Math.max(0, Math.floor(dto.total - discountToApply));

      const hold = await this.prisma.hold.create({
        data: {
          id: uuid(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'REDEEM',
          redeemAmount: discountToApply,
          orderId: dto.orderId,
          total: Math.floor(dto.total),
          eligibleTotal: Math.floor(dto.eligibleTotal),
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
        id: uuid(),
        customerId: customer.id,
        merchantId: dto.merchantId,
        mode: 'EARN',
        earnPoints: points,
        orderId: dto.orderId,
        total: Math.floor(dto.total),
        eligibleTotal: Math.floor(dto.eligibleTotal),
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
    if (hold.status !== HoldStatus.PENDING) throw new ConflictException('Hold already finished');

    const wallet = await this.getPointsWallet(hold.customerId, hold.merchantId);

    return this.prisma.$transaction(async (tx) => {
      let appliedRedeem = 0;
      let appliedEarn = 0;

      if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
        const amount = Math.min(wallet.balance, hold.redeemAmount); // защита от гонок
        appliedRedeem = amount;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance - amount } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.REDEEM, amount: -amount, orderId }
        });
      }
      if (hold.mode === 'EARN' && hold.earnPoints > 0) {
        appliedEarn = hold.earnPoints;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance + hold.earnPoints } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.EARN, amount: hold.earnPoints, orderId }
        });
      }

      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.COMMITTED, orderId, receiptId: receiptNumber }
      });

      // Сохраним факт чека (для будущих частичных возвратов)
      await tx.receipt.upsert({
        where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } },
        update: {},
        create: {
          merchantId: hold.merchantId,
          customerId: hold.customerId,
          orderId,
          receiptNumber: receiptNumber ?? null,
          total: hold.total ?? 0,
          eligibleTotal: hold.eligibleTotal ?? (hold.total ?? 0),
          redeemApplied: appliedRedeem,
          earnApplied: appliedEarn,
        }
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

  /**
   * Частичный/полный REFUND.
   * Считаем долю возврата от eligibleTotal. Возвращаем долю списанных (redeemApplied),
   * и снимаем долю начисленных (earnApplied). Баланс может уйти в минус — это ожидаемо,
   * долг погасится будущими начислениями.
   */
  async refund(merchantId: string, orderId: string, refundTotal: number, refundEligibleTotal?: number) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
    if (!receipt) throw new BadRequestException('Receipt not found');

    const eligible = receipt.eligibleTotal > 0 ? receipt.eligibleTotal : receipt.total;
    const baseForShare = refundEligibleTotal != null ? refundEligibleTotal : refundTotal;
    const share = Math.min(1, Math.max(0, eligible > 0 ? baseForShare / eligible : 0));

    const pointsToRestore = Math.round(receipt.redeemApplied * share); // вернуть клиенту
    const pointsToRevoke  = Math.round(receipt.earnApplied   * share); // снять начисленные (МОЖЕТ УВЕСТИ В МИНУС)

    const wallet = await this.getPointsWallet(receipt.customerId, merchantId);

    return this.prisma.$transaction(async (tx) => {
      // + вернуть списанные (если были)
      if (pointsToRestore > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: (fresh!.balance + pointsToRestore) } });
        await tx.transaction.create({
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: pointsToRestore, orderId }
        });
      }

      // - снять начисленные (теперь БЕЗ ограничения по 0 — допускаем отрицательный баланс)
      if (pointsToRevoke > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        const newBalance = (fresh!.balance - pointsToRevoke); // может стать < 0
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.transaction.create({
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: -pointsToRevoke, orderId }
        });
      }

      return { ok: true, share, pointsRestored: pointsToRestore, pointsRevoked: pointsToRevoke };
    });
  }
}
