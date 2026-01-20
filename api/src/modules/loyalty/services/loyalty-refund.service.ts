import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  HoldStatus,
  LedgerAccount,
  Prisma,
  Receipt,
  TxnType,
  WalletType,
} from '@prisma/client';
import { LoyaltyOpsBase } from './loyalty-ops-base.service';

export class LoyaltyRefundService extends LoyaltyOpsBase {
  async cancel(holdId: string, merchantId?: string | null) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    const expectedMerchantId =
      typeof merchantId === 'string' ? merchantId.trim() : '';
    if (expectedMerchantId && hold.merchantId !== expectedMerchantId) {
      throw new ForbiddenException('Hold belongs to another merchant');
    }
    if (hold.status !== HoldStatus.PENDING)
      throw new ConflictException('Hold already finished');
    const qrJti = hold.qrJti ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.hold.update({
        where: { id: holdId },
        data: { status: HoldStatus.CANCELED, qrJti: null },
      });
      if (qrJti) {
        try {
          if (/^\d{9}$/.test(qrJti)) {
            await tx.qrNonce.updateMany({
              where: { jti: qrJti },
              data: { usedAt: null },
            });
          } else {
            await tx.qrNonce.delete({ where: { jti: qrJti } });
          }
        } catch {
          /* ignore */
        }
      }
    });
    return { ok: true };
  }
  async refund(params: {
    merchantId: string;
    invoiceNum?: string | null;
    orderId?: string | null;
    requestId?: string | null;
    deviceId?: string | null;
    operationDate?: Date | null;
  }) {
    const merchantId = String(params.merchantId || '').trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    const invoiceNum = String(params.invoiceNum || '').trim();
    const orderIdRaw = String(params.orderId || '').trim();
    if (!invoiceNum && !orderIdRaw) {
      throw new BadRequestException('invoiceNum or orderId required');
    }
    let receipt: Receipt | null = null;
    if (orderIdRaw) {
      receipt = await this.prisma.receipt.findFirst({
        where: { merchantId, id: orderIdRaw },
      });
    }
    if (!receipt && invoiceNum) {
      receipt = await this.prisma.receipt.findFirst({
        where: { merchantId, orderId: invoiceNum },
      });
    }
    if (!receipt) throw new BadRequestException('Receipt not found');

    const operationDateObj = params.operationDate ?? new Date();
    const deviceCtx = await this.context.resolveDeviceContext(
      merchantId,
      params.deviceId ?? null,
      receipt.outletId ?? null,
    );
    const refundOutletId = receipt.outletId ?? deviceCtx?.outletId ?? null;
    const refundDeviceId = deviceCtx?.id ?? receipt.deviceId ?? null;

    const pointsToRestore = Math.max(0, Math.round(receipt.redeemApplied || 0));
    const refundMeta = {
      receiptId: receipt.id,
    } as Prisma.JsonObject;

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: receipt.customerId,
        merchantId,
        type: WalletType.POINTS,
      },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    const merchantContext = await this.context.ensureCustomerContext(
      merchantId,
      receipt.customerId,
    );

    const existingRefunds = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        orderId: receipt.orderId,
        type: TxnType.REFUND,
        canceledAt: null,
      },
    });
    const matchingRefunds = existingRefunds.filter((tx) => {
      try {
        const meta =
          tx.metadata &&
          typeof tx.metadata === 'object' &&
          !Array.isArray(tx.metadata)
            ? (tx.metadata as Record<string, unknown>)
            : null;
        const receiptMatch =
          !receipt.id ||
          !meta ||
          !meta.receiptId ||
          meta.receiptId === receipt.id;
        return receiptMatch;
      } catch {
        return false;
      }
    });
    if (matchingRefunds.length > 0) {
      const pointsRestored = matchingRefunds
        .filter((tx) => tx.amount > 0)
        .reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
      const pointsRevoked = matchingRefunds
        .filter((tx) => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.max(0, -tx.amount), 0);
      return {
        ok: true,
        share: 1,
        pointsRestored,
        pointsRevoked,
        customerId: merchantContext.customerId,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const lockReceipt = await tx.receipt.updateMany({
        where: { id: receipt.id, canceledAt: null },
        data: { canceledAt: operationDateObj },
      });
      if (lockReceipt.count === 0) {
        const existing = await tx.transaction.findMany({
          where: {
            merchantId,
            orderId: receipt.orderId,
            type: TxnType.REFUND,
            canceledAt: null,
          },
        });
        const matching = existing.filter((tx) => {
          try {
            const meta =
              tx.metadata &&
              typeof tx.metadata === 'object' &&
              !Array.isArray(tx.metadata)
                ? (tx.metadata as Record<string, unknown>)
                : null;
            const receiptMatch =
              !receipt.id ||
              !meta ||
              !meta.receiptId ||
              meta.receiptId === receipt.id;
            return receiptMatch;
          } catch {
            return false;
          }
        });
        if (matching.length > 0) {
          const pointsRestored = matching
            .filter((tx) => tx.amount > 0)
            .reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
          const pointsRevoked = matching
            .filter((tx) => tx.amount < 0)
            .reduce((sum, tx) => sum + Math.max(0, -tx.amount), 0);
          return {
            ok: true,
            share: 1,
            pointsRestored,
            pointsRevoked,
            customerId: merchantContext.customerId,
          };
        }
        return {
          ok: true,
          share: 1,
          pointsRestored: 0,
          pointsRevoked: 0,
          customerId: merchantContext.customerId,
        };
      }
      let pointsToRevoke = 0;
      if (receipt.orderId) {
        const earnTxs = await tx.transaction.findMany({
          where: {
            merchantId,
            orderId: receipt.orderId,
            type: TxnType.EARN,
            canceledAt: null,
          },
          select: { amount: true },
        });
        pointsToRevoke = earnTxs.reduce(
          (sum, tx) => sum + Math.max(0, Number(tx.amount || 0)),
          0,
        );
      }
      pointsToRevoke = Math.max(0, Math.round(pointsToRevoke));
      if (this.config.isEarnLotsEnabled() && receipt.orderId) {
        const pendingLots = await tx.earnLot.findMany({
          where: {
            merchantId,
            customerId: receipt.customerId,
            orderId: receipt.orderId,
            status: 'PENDING',
          },
          select: {
            id: true,
            points: true,
            consumedPoints: true,
            maturesAt: true,
          },
        });
        for (const lot of pendingLots) {
          const points = Math.max(0, Number(lot.points || 0));
          const consumed = Math.max(0, Number(lot.consumedPoints || 0));
          const nextConsumed = Math.max(consumed, points);
          await tx.earnLot.update({
            where: { id: lot.id },
            data: {
              consumedPoints: nextConsumed,
              status: 'ACTIVE',
              earnedAt: lot.maturesAt ?? operationDateObj,
            },
          });
        }
      }
      if (pointsToRestore > 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: pointsToRestore } },
        });
        await tx.transaction.create({
          data: {
            customerId: receipt.customerId,
            merchantId,
            type: TxnType.REFUND,
            amount: pointsToRestore,
            orderId: receipt.orderId,
            outletId: refundOutletId,
            staffId: receipt.staffId,
            deviceId: refundDeviceId,
            metadata: refundMeta,
            createdAt: operationDateObj,
          },
        });
        if (this.config.isEarnLotsEnabled()) {
          await this.unconsumeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRestore,
            { orderId: receipt.orderId },
          );
        }
        if (this.config.isLedgerEnabled()) {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId: receipt.customerId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount: pointsToRestore,
              orderId: receipt.orderId,
              outletId: refundOutletId,
              staffId: receipt.staffId ?? null,
              deviceId: refundDeviceId,
              meta: { mode: 'REFUND', kind: 'restore' },
              createdAt: operationDateObj,
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', {
            type: 'refund_restore',
          });
        }
      }
      if (pointsToRevoke > 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: pointsToRevoke } },
        });
        await tx.transaction.create({
          data: {
            customerId: receipt.customerId,
            merchantId,
            type: TxnType.REFUND,
            amount: -pointsToRevoke,
            orderId: receipt.orderId,
            outletId: refundOutletId,
            staffId: receipt.staffId,
            deviceId: refundDeviceId,
            metadata: refundMeta,
            createdAt: operationDateObj,
          },
        });
        if (this.config.isEarnLotsEnabled()) {
          await this.revokeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRevoke,
            { orderId: receipt.orderId, receiptId: receipt.id },
          );
        }
        if (this.config.isLedgerEnabled()) {
          await tx.ledgerEntry.create({
            data: {
              merchantId,
              customerId: receipt.customerId,
              debit: LedgerAccount.CUSTOMER_BALANCE,
              credit: LedgerAccount.MERCHANT_LIABILITY,
              amount: pointsToRevoke,
              orderId: receipt.orderId,
              outletId: refundOutletId,
              staffId: receipt.staffId ?? null,
              deviceId: refundDeviceId,
              meta: { mode: 'REFUND', kind: 'revoke' },
              createdAt: operationDateObj,
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', {
            type: 'refund_revoke',
          });
        }
      }

      const refundPayload: Record<string, unknown> = {
        schemaVersion: 1,
        orderId: receipt.orderId,
        customerId: receipt.customerId,
        merchantId,
        share: 1,
        pointsRestored: pointsToRestore,
        pointsRevoked: pointsToRevoke,
        createdAt: operationDateObj.toISOString(),
        outletId: refundOutletId,
        staffId: receipt.staffId ?? null,
        deviceId: refundDeviceId,
        requestId: params.requestId ?? null,
      };
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.refund',
          createdAt: operationDateObj,
          payload: refundPayload as Prisma.InputJsonValue,
        },
      });
      await this.bestEffort(
        'refund: rollback referral rewards',
        async () => {
          await this.rollbackReferralRewards(tx, {
            merchantId,
            receipt: {
              id: receipt.id,
              orderId: receipt.orderId,
              customerId: receipt.customerId,
              outletId: refundOutletId,
              staffId: receipt.staffId ?? null,
            },
          });
        },
        'warn',
      );
      await this.bestEffort(
        'refund: record staff motivation',
        async () => {
          await this.staffMotivation.recordRefund(tx, {
            merchantId,
            orderId: receipt.orderId,
            eventAt: operationDateObj,
            share: 1,
          });
        },
        'debug',
      );
      await this.bestEffort(
        'refund: recompute tier progress',
        async () => {
          await this.tiers.recomputeTierProgress(tx, {
            merchantId,
            customerId: receipt.customerId,
          });
        },
        'debug',
      );
      return {
        ok: true,
        share: 1,
        pointsRestored: pointsToRestore,
        pointsRevoked: pointsToRevoke,
        customerId: merchantContext.customerId,
      };
    });
  }
}
