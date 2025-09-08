import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Mode, QuoteDto } from './dto';
import { HoldStatus, TxnType, WalletType } from '@prisma/client';
import { v4 as uuid } from 'uuid';

type QrMeta = { jti: string; iat: number; exp: number } | undefined;

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (found) return found;
    return this.prisma.customer.create({ data: { id: customerId } });
  }

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    return { earnBps: s?.earnBps ?? 500, redeemLimitBps: s?.redeemLimitBps ?? 5000 };
  }

  // ————— вспомогалки для идемпотентности по существующему hold —————
  private quoteFromExistingHold(mode: Mode, hold: any) {
    if (mode === Mode.REDEEM) {
      const discountToApply = hold.redeemAmount ?? 0;
      const total = hold.total ?? 0;
      const finalPayable = Math.max(0, total - discountToApply);
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
    const points = hold.earnPoints ?? 0;
    return {
      canEarn: points > 0,
      pointsToEarn: points,
      holdId: hold.id,
      message: points > 0 ? `Начислим ${points} баллов после оплаты.` : 'Сумма слишком мала для начисления.',
    };
  }

  // ————— основной расчёт — анти-replay вне транзакции + идемпотентность —————
  async quote(dto: QuoteDto & { userToken: string }, qr?: QrMeta) {
    const customer = await this.ensureCustomerId(dto.userToken);
    const { earnBps, redeemLimitBps } = await this.getSettings(dto.merchantId);

    // 0) если есть qr — сначала смотрим, не существует ли hold с таким qrJti
    if (qr) {
      const existing = await this.prisma.hold.findUnique({ where: { qrJti: qr.jti } });
      if (existing) {
        if (existing.status === HoldStatus.PENDING) {
          // идемпотентно отдадим тот же расчёт/holdId
          return this.quoteFromExistingHold(dto.mode, existing);
        }
        // уже зафиксирован или отменён — QR повторно использовать нельзя
        throw new BadRequestException('QR токен уже использован. Попросите клиента обновить QR.');
      }

      // 1) «помечаем» QR как использованный ВНЕ транзакции (чтобы метка не откатывалась)
      try {
        await this.prisma.qrNonce.create({
          data: {
            jti: qr.jti,
            customerId: customer.id,
            merchantId: dto.merchantId,
            issuedAt: new Date(qr.iat * 1000),
            expiresAt: new Date(qr.exp * 1000),
            usedAt: new Date(),
          },
        });
      } catch (e: any) {
        // гонка: пока мы шли сюда, кто-то другой успел использовать QR — проверим hold ещё раз
        const again = await this.prisma.hold.findUnique({ where: { qrJti: qr.jti } });
        if (again) {
          if (again.status === HoldStatus.PENDING) return this.quoteFromExistingHold(dto.mode, again);
          throw new BadRequestException('QR токен уже использован. Попросите клиента обновить QR.');
        }
        // иначе считаем, что QR использован
        throw new BadRequestException('QR токен уже использован. Попросите клиента обновить QR.');
      }
    }

    if (dto.mode === Mode.REDEEM) {
      // 2) дальше — обычный расчёт в транзакции и создание нового hold (уникальный qrJti не даст дубликат)
      return this.prisma.$transaction(async (tx) => {
        let wallet = await tx.wallet.findFirst({
          where: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS, balance: 0 },
          });
        }

        const limit = Math.floor(dto.eligibleTotal * redeemLimitBps / 10000);
        const discountToApply = Math.min(wallet.balance, limit);
        const finalPayable = Math.max(0, Math.floor(dto.total - discountToApply));

        const hold = await tx.hold.create({
          data: {
            id: uuid(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: discountToApply,
            orderId: dto.orderId,
            total: Math.floor(dto.total),
            eligibleTotal: Math.floor(dto.eligibleTotal),
            qrJti: qr?.jti ?? null,
            status: HoldStatus.PENDING,
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
      });
    }

    // ===== EARN =====
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }

      const points = Math.floor(dto.eligibleTotal * earnBps / 10000);

      const hold = await tx.hold.create({
        data: {
          id: uuid(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: Math.floor(dto.total),
          eligibleTotal: Math.floor(dto.eligibleTotal),
          qrJti: qr?.jti ?? null,
          status: HoldStatus.PENDING,
        }
      });

      return {
        canEarn: points > 0,
        pointsToEarn: points,
        holdId: hold.id,
        message: points > 0 ? `Начислим ${points} баллов после оплаты.` : 'Сумма слишком мала для начисления.',
      };
    });
  }

  async commit(holdId: string, orderId: string, receiptNumber?: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== HoldStatus.PENDING) throw new ConflictException('Hold already finished');

    const wallet = await this.prisma.wallet.findFirst({
      where: { customerId: hold.customerId, merchantId: hold.merchantId, type: WalletType.POINTS },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    return this.prisma.$transaction(async (tx) => {
      let appliedRedeem = 0;
      let appliedEarn = 0;

      if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        const amount = Math.min(fresh!.balance, hold.redeemAmount);
        appliedRedeem = amount;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance - amount } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.REDEEM, amount: -amount, orderId }
        });
      }
      if (hold.mode === 'EARN' && hold.earnPoints > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        appliedEarn = hold.earnPoints;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance + hold.earnPoints } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.EARN, amount: hold.earnPoints, orderId }
        });
      }

      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.COMMITTED, orderId, receiptId: receiptNumber }
      });

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
    const wallet = await this.prisma.wallet.findFirst({
      where: { customerId, merchantId, type: WalletType.POINTS },
    });
    return { merchantId, customerId, balance: wallet?.balance ?? 0 };
  }

  async refund(merchantId: string, orderId: string, refundTotal: number, refundEligibleTotal?: number) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
    if (!receipt) throw new BadRequestException('Receipt not found');

    const eligible = receipt.eligibleTotal > 0 ? receipt.eligibleTotal : receipt.total;
    const baseForShare = refundEligibleTotal != null ? refundEligibleTotal : refundTotal;
    const share = Math.min(1, Math.max(0, eligible > 0 ? baseForShare / eligible : 0));

    const pointsToRestore = Math.round(receipt.redeemApplied * share);
    const pointsToRevoke  = Math.round(receipt.earnApplied   * share);

    const wallet = await this.prisma.wallet.findFirst({
      where: { customerId: receipt.customerId, merchantId, type: WalletType.POINTS },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    return this.prisma.$transaction(async (tx) => {
      if (pointsToRestore > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: (fresh!.balance + pointsToRestore) } });
        await tx.transaction.create({
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: pointsToRestore, orderId }
        });
      }
      if (pointsToRevoke > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: (fresh!.balance - pointsToRevoke) } });
        await tx.transaction.create({
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: -pointsToRevoke, orderId }
        });
      }
      return { ok: true, share, pointsRestored: pointsToRestore, pointsRevoked: pointsToRevoke };
    });
  }

  async transactions(merchantId: string, customerId: string, limit = 20, before?: Date) {
    const items = await this.prisma.transaction.findMany({
      where: { merchantId, customerId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    const nextBefore = items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;
    return { items, nextBefore };
  }
}
