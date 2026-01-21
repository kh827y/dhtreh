import { Prisma, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { planConsume, planRevoke, planUnconsume } from '../utils/lots.util';
import type {
  OptionalModelsClient,
  PrismaTx,
} from './loyalty-ops.types';

export class LoyaltyLotsService {
  constructor(private readonly prisma: PrismaService) {}

  async consumeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    const earnLot =
      (tx as OptionalModelsClient).earnLot ??
      (this.prisma as OptionalModelsClient).earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return; // в тестовых моках может отсутствовать
    const lots = await earnLot.findMany({
      where: { merchantId, customerId, status: 'ACTIVE' },
      orderBy: { earnedAt: 'asc' },
    });
    const updates = planConsume(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((item) => item.id === up.id);
      if (!lot) continue;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.consumed',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            consumed: up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  async unconsumeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    const earnLot =
      (tx as OptionalModelsClient).earnLot ??
      (this.prisma as OptionalModelsClient).earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({
      where: {
        merchantId,
        customerId,
        status: 'ACTIVE',
        consumedPoints: { gt: 0 },
      },
      orderBy: { earnedAt: 'desc' },
    });
    const updates = planUnconsume(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((item) => item.id === up.id);
      if (!lot) continue;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.unconsumed',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            unconsumed: -up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  async revokeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    const earnLot =
      (tx as OptionalModelsClient).earnLot ??
      (this.prisma as OptionalModelsClient).earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const where: Prisma.EarnLotWhereInput = {
      merchantId,
      customerId,
      status: 'ACTIVE',
    };
    if (ctx?.receiptId) {
      where.receiptId = ctx.receiptId;
    } else if (ctx?.orderId) {
      where.orderId = ctx.orderId;
    }
    const lots = await earnLot.findMany({
      where,
      orderBy: { earnedAt: 'desc' },
    });
    const updates = planRevoke(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((item) => item.id === up.id);
      if (!lot) continue;
      await earnLot.update({
        where: { id: up.id },
        data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.revoked',
          payload: {
            merchantId,
            customerId,
            lotId: up.id,
            revoked: up.deltaConsumed,
            orderId: ctx.orderId ?? null,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  async ensurePointsWallet(merchantId: string, customerId: string) {
    let wallet = await this.prisma.wallet.findFirst({
      where: { merchantId, customerId, type: WalletType.POINTS },
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 },
      });
    }
    return wallet;
  }
}
