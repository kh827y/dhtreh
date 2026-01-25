import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { planConsume } from '../../loyalty/utils/lots.util';
import { ensureBaseTier } from '../../loyalty/utils/tier-defaults.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { MS_PER_DAY } from './portal-customers.types';

@Injectable()
export class PortalCustomersOperationsService {
  private readonly logger = new Logger(PortalCustomersOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private parseAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.round(num));
  }


  private async resolveEarnRateBps(
    merchantId: string,
    customerId: string,
  ): Promise<number> {
    await ensureBaseTier(this.prisma, merchantId).catch((err) => {
      logIgnoredError(
        err,
        'PortalCustomersOperationsService ensureBaseTier',
        this.logger,
        'debug',
        { merchantId },
      );
      return null;
    });
    const assignment = await this.prisma.loyaltyTierAssignment.findFirst({
      where: {
        merchantId,
        customerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      include: {
        tier: {
          select: {
            earnRateBps: true,
          },
        },
      },
    });
    if (assignment?.tier?.earnRateBps != null) {
      return Math.max(0, Math.floor(Number(assignment.tier.earnRateBps)));
    }

    const initialTier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, isInitial: true },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      select: { earnRateBps: true },
    });
    if (initialTier?.earnRateBps != null) {
      return Math.max(0, Math.floor(Number(initialTier.earnRateBps)));
    }
    return 0;
  }

  private async resolvePointsTtlDays(
    merchantId: string,
  ): Promise<number | null> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttl = settings?.pointsTtlDays;
    if (ttl === null || ttl === undefined) return null;
    const num = Number(ttl);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num);
  }

  private async consumeLotsForRedeem(
    tx: Prisma.TransactionClient,
    merchantId: string,
    customerId: string,
    amount: number,
    orderId: string | null,
  ) {
    if (!this.config.isEarnLotsEnabled()) return;
    if (amount <= 0) return;

    const lots = await tx.earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'asc' },
    });
    if (!lots.length) return;

    const updates = planConsume(
      lots.map((lot) => ({
        id: lot.id,
        points: lot.points,
        consumedPoints: lot.consumedPoints || 0,
        earnedAt: lot.earnedAt,
      })),
      amount,
    );

    for (const update of updates) {
      const current = lots.find((lot) => lot.id === update.id);
      if (!current) continue;
      await tx.earnLot.update({
        where: { id: update.id },
        data: {
          consumedPoints: (current.consumedPoints || 0) + update.deltaConsumed,
        },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.earnlot.consumed',
          payload: {
            merchantId,
            customerId,
            lotId: update.id,
            consumed: update.deltaConsumed,
            orderId,
            at: new Date().toISOString(),
          },
        },
      });
    }
  }

  async ensureOperationAllowed(
    merchantId: string,
    customerId: string,
    mode: 'earn' | 'redeem',
  ) {
    const profile = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
      select: {
        accrualsBlocked: true,
        redemptionsBlocked: true,
      },
    });
    if (!profile) throw new NotFoundException('Customer not found');
    if (mode === 'earn' && profile.accrualsBlocked) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    if (mode === 'redeem' && profile.redemptionsBlocked) {
      throw new BadRequestException('Списания заблокированы администратором');
    }
  }

  async accrueManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      purchaseAmount: number;
      points?: number | null;
      receiptNumber?: string | null;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    const purchaseAmount = this.parseAmount(payload.purchaseAmount);
    if (!purchaseAmount || purchaseAmount <= 0) {
      throw new BadRequestException('Сумма покупки должна быть больше 0');
    }

    let points =
      payload.points != null ? this.parseAmount(payload.points) : null;
    if (points == null) {
      const earnRate = await this.resolveEarnRateBps(merchantId, customerId);
      points = Math.floor((purchaseAmount * earnRate) / 10_000);
    }
    if (!points || points <= 0) {
      throw new BadRequestException(
        'Количество начисляемых баллов должно быть больше 0',
      );
    }
    await this.ensureOperationAllowed(merchantId, customerId, 'earn');
    const appliedPoints = points;

    const orderId = `manual_accrual:${randomUUID()}`;
    const rawComment = payload.comment?.trim() || null;
    if (rawComment && rawComment.length > 60) {
      throw new BadRequestException(
        'Комментарий не должен превышать 60 символов',
      );
    }
    const comment = rawComment;
    const receiptNumber = payload.receiptNumber?.trim() || null;
    const outletId = payload.outletId ?? null;
    const ttlDays = await this.resolvePointsTtlDays(merchantId);
    const expiresAt =
      ttlDays && ttlDays > 0
        ? new Date(Date.now() + ttlDays * MS_PER_DAY)
        : null;
    const metadata = {
      source: 'MANUAL_ACCRUAL',
      purchaseAmount,
      total: purchaseAmount,
      receiptNumber,
      comment,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: appliedPoints } },
        select: { balance: true },
      });

      if (this.config.isEarnLotsEnabled() && appliedPoints > 0) {
        await tx.earnLot.create({
          data: {
            merchantId,
            customerId,
            points: appliedPoints,
            consumedPoints: 0,
            earnedAt: new Date(),
            maturesAt: null,
            expiresAt,
            orderId,
            receiptId: null,
            outletId: outletId ?? null,
            staffId: staffId ?? null,
            status: 'ACTIVE',
          },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.CAMPAIGN,
          amount: appliedPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
        balance: updatedWallet.balance,
      };
    });

    return {
      ok: true,
      pointsIssued: appliedPoints,
      orderId,
      transactionId: result.transactionId,
      comment,
    };
  }

  async redeemManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      points: number;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    const points = this.parseAmount(payload.points);
    if (!points || points <= 0) {
      throw new BadRequestException(
        'Количество списываемых баллов должно быть больше 0',
      );
    }
    const redeemPoints = points;
    await this.ensureOperationAllowed(merchantId, customerId, 'redeem');

    const orderId = `manual_redeem:${randomUUID()}`;
    const metadata = {
      source: 'MANUAL_REDEEM',
      comment: payload.comment?.trim() || null,
    };
    const outletId = payload.outletId ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        throw new BadRequestException(
          'У клиента отсутствует кошелёк с баллами',
        );
      }
      const updated = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: redeemPoints } },
        data: { balance: { decrement: redeemPoints } },
      });
      if (!updated.count) {
        throw new BadRequestException('Недостаточно баллов на балансе клиента');
      }

      await this.consumeLotsForRedeem(
        tx,
        merchantId,
        customerId,
        redeemPoints,
        orderId,
      );

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.REDEEM,
          amount: -redeemPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
      };
    });

    return {
      ok: true,
      pointsRedeemed: redeemPoints,
      orderId,
      transactionId: result.transactionId,
    };
  }

  async issueComplimentary(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      points: number;
      expiresInDays?: number | null;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    const points = this.parseAmount(payload.points);
    if (!points || points <= 0) {
      throw new BadRequestException('Количество баллов должно быть больше 0');
    }
    await this.ensureOperationAllowed(merchantId, customerId, 'earn');
    const bonusPoints = points;

    const expiresInDays =
      payload.expiresInDays !== undefined && payload.expiresInDays !== null
        ? Math.max(0, Math.round(Number(payload.expiresInDays)))
        : null;
    const expiresAt =
      expiresInDays && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * MS_PER_DAY)
        : null;
    const orderId = `complimentary:${randomUUID()}`;
    const rawComment = payload.comment?.trim() || null;
    if (rawComment && rawComment.length > 60) {
      throw new BadRequestException(
        'Комментарий не должен превышать 60 символов',
      );
    }
    const comment = rawComment;
    const outletId = payload.outletId ?? null;
    const metadata = {
      source: 'COMPLIMENTARY',
      comment,
      expiresInDays,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: bonusPoints } },
        select: { balance: true },
      });

      if (this.config.isEarnLotsEnabled() && bonusPoints > 0) {
        await tx.earnLot.create({
          data: {
            merchantId,
            customerId,
            points: bonusPoints,
            consumedPoints: 0,
            earnedAt: new Date(),
            maturesAt: null,
            expiresAt,
            orderId,
            receiptId: null,
            outletId: outletId ?? null,
            staffId: staffId ?? null,
            status: 'ACTIVE',
          },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.CAMPAIGN,
          amount: bonusPoints,
          orderId,
          outletId: outletId ?? null,
          staffId: staffId ?? null,
          metadata,
        },
      });

      return {
        transactionId: transaction.id,
        balance: updatedWallet.balance,
      };
    });

    return {
      ok: true,
      pointsIssued: bonusPoints,
      orderId,
      transactionId: result.transactionId,
      comment,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }
}
