import { BadRequestException, ConflictException } from '@nestjs/common';
import { HoldMode, HoldStatus, Receipt } from '@prisma/client';
import { randomUUID } from 'crypto';
import { safeExecAsync } from '../../../shared/safe-exec';
import { LoyaltyOpsBase } from './loyalty-ops-base.service';
import type {
  IntegrationBonusParams,
  IntegrationBonusResult,
  PositionInput,
  ResolvedPosition,
} from './loyalty-ops.types';
import type { LoyaltyCommitService } from './loyalty-commit.service';

export class LoyaltyIntegrationService extends LoyaltyOpsBase {
  constructor(
    commitService: LoyaltyCommitService,
    ...args: ConstructorParameters<typeof LoyaltyOpsBase>
  ) {
    super(...args);
    this.commitService = commitService;
  }

  private readonly commitService: LoyaltyCommitService;

  async processIntegrationBonus(
    params: IntegrationBonusParams,
  ): Promise<IntegrationBonusResult> {
    const merchantId = String(params.merchantId || '').trim();
    const customerId = String(params.customerId || '').trim();
    const invoiceNum = String(params.invoiceNum || '').trim() || null;
    const idempotencyKey = String(params.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency_key required');
    }
    const orderId = idempotencyKey;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    const operationDate = params.operationDate ?? null;
    const paidBonus = this.sanitizeManualAmount(params.paidBonus);
    const bonusValue = this.sanitizeManualAmount(params.bonusValue);
    const manualRedeem = paidBonus != null;
    const manualEarn = bonusValue != null;
    const baseTotal = Math.max(0, Math.floor(Number(params.total ?? 0)));
    const rawItems = this.sanitizePositions(
      (params.items as PositionInput[]) ?? [],
    );
    await this.bestEffort(
      'integration-bonus: ensure merchant stub',
      async () => {
        await this.prisma.merchant.upsert({
          where: { id: merchantId },
          update: {},
          create: {
            id: merchantId,
            name: merchantId,
            initialName: merchantId,
          },
        });
      },
      'debug',
    );

    let existingReceipt: Receipt | null = null;
    existingReceipt = await safeExecAsync(
      () =>
        this.prisma.receipt.findUnique({
          where: { merchantId_orderId: { merchantId, orderId } },
        }),
      async () => null,
      this.logger,
      'integration-bonus: find existing receipt',
    );
    if (existingReceipt) {
      if (existingReceipt.customerId !== customerId) {
        throw new ConflictException(
          'Операция уже выполнена для другого клиента',
        );
      }
      const walletAfter = await this.balance(merchantId, customerId);
      return {
        orderId: existingReceipt.id,
        invoiceNum: existingReceipt.receiptNumber ?? invoiceNum ?? null,
        receiptId: existingReceipt.id,
        redeemApplied: existingReceipt.redeemApplied ?? 0,
        earnApplied: existingReceipt.earnApplied ?? 0,
        balanceBefore: null,
        balanceAfter: walletAfter.balance ?? 0,
        alreadyProcessed: true,
      };
    }

    const existingHold = await this.prisma.hold.findFirst({
      where: { merchantId, orderId, status: HoldStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (existingHold && existingHold.customerId !== customerId) {
      throw new ConflictException(
        'Операция уже выполняется для другого клиента',
      );
    }

    const wallet = await this.ensurePointsWallet(merchantId, customerId);
    const balanceBefore = wallet.balance ?? 0;

    if (manualRedeem || manualEarn) {
      if (paidBonus != null && paidBonus > balanceBefore) {
        throw new BadRequestException('Недостаточно бонусов для списания');
      }
      await this.checkManualIntegrationCaps({
        merchantId,
        customerId,
        redeemAmount: paidBonus ?? 0,
        earnAmount: bonusValue ?? 0,
        operationDate,
      });
    }

    const calc = await this.computeIntegrationCalc({
      merchantId,
      customerId,
      items: rawItems,
      outletId: params.outletId ?? null,
      operationDate,
      total: baseTotal,
      paidBonus,
      redeemMode: 'exact',
      allowAutoPromotions: false,
    });

    let holdId = existingHold?.id ?? null;
    let positionsForHold = calc.itemsForCalc.map((item) => ({
      ...item,
      earnPoints: item.earnPoints != null ? Math.max(0, item.earnPoints) : 0,
      redeemAmount:
        item.redeemAmount != null ? Math.max(0, item.redeemAmount) : 0,
    }));
    const redeemToSave = calc.appliedRedeem;
    let earnToSave = calc.earnedTotal;
    let manualRedeemOverride: number | null = manualRedeem
      ? redeemToSave
      : null;
    let manualEarnOverride: number | null = manualEarn ? earnToSave : null;

    if (manualEarn) {
      if (calc.accrualsBlocked && (bonusValue ?? 0) > 0) {
        throw new BadRequestException(
          'Начисления заблокированы администратором',
        );
      }
      if (
        calc.appliedRedeem > 0 &&
        !calc.allowSameReceipt &&
        (bonusValue ?? 0) > 0
      ) {
        throw new BadRequestException(
          'Нельзя одновременно начислять и списывать баллы в одном чеке.',
        );
      }
      if (positionsForHold.length) {
        const earnTarget = Math.max(0, Math.floor(Number(bonusValue ?? 0)));
        const earnWeights = positionsForHold.map((item) =>
          Math.max(
            1,
            Math.floor(
              Math.max(0, item.amount - Math.max(0, item.redeemAmount || 0)) *
                Math.max(1, item.promotionMultiplier || 1),
            ),
          ),
        );
        const earnShares = this.allocateByWeight(earnWeights, earnTarget);
        positionsForHold = positionsForHold.map((item, idx) => ({
          ...item,
          earnPoints: earnShares[idx] ?? 0,
        }));
        earnToSave = earnShares.reduce(
          (sum, value) => sum + Math.max(0, value),
          0,
        );
      } else {
        earnToSave = Math.max(0, Math.floor(Number(bonusValue ?? 0)));
      }
      manualEarnOverride = earnToSave;
    }

    const holdMode =
      redeemToSave && redeemToSave > 0 ? HoldMode.REDEEM : HoldMode.EARN;

    if (!holdId) {
      const hold = await this.prisma.hold.create({
        data: {
          id: randomUUID(),
          customerId,
          merchantId,
          mode: holdMode,
          redeemAmount: redeemToSave,
          earnPoints: earnToSave,
          orderId,
          total: calc.total,
          eligibleTotal: calc.eligibleAmount,
          status: HoldStatus.PENDING,
          outletId: params.outletId ?? null,
          staffId: params.staffId ?? null,
          deviceId: params.resolvedDeviceId ?? null,
          createdAt: operationDate ?? undefined,
        },
      });
      holdId = hold.id;
      if (positionsForHold.length) {
        await this.upsertHoldItems(
          this.prisma,
          holdId,
          merchantId,
          positionsForHold,
        );
      }
    } else {
      const holdExisting = existingHold!;
      const holdIdValue = holdId!;
      if (manualRedeemOverride == null) {
        manualRedeemOverride =
          holdExisting.redeemAmount != null
            ? Math.max(0, holdExisting.redeemAmount)
            : null;
      }
      if (manualEarnOverride == null) {
        manualEarnOverride =
          holdExisting.earnPoints != null
            ? Math.max(0, holdExisting.earnPoints)
            : null;
      }

      if ((manualRedeem || manualEarn) && positionsForHold.length) {
        await this.bestEffort(
          'integration-bonus: upsert hold items',
          async () => {
            await this.upsertHoldItems(
              this.prisma,
              holdIdValue,
              merchantId,
              positionsForHold,
            );
          },
          'debug',
        );
        await this.bestEffort(
          'integration-bonus: update hold totals',
          async () => {
            await this.prisma.hold.update({
              where: { id: holdIdValue },
              data: {
                total: calc.total,
                eligibleTotal: calc.eligibleAmount,
                outletId: params.outletId ?? null,
                staffId: params.staffId ?? null,
                deviceId: params.resolvedDeviceId ?? null,
                mode:
                  redeemToSave && redeemToSave > 0
                    ? HoldMode.REDEEM
                    : holdExisting.mode,
                redeemAmount: manualRedeem
                  ? redeemToSave
                  : holdExisting.redeemAmount,
                earnPoints: manualEarn ? earnToSave : holdExisting.earnPoints,
              },
            });
          },
          'debug',
        );
      }
    }

    if (manualRedeem && redeemToSave > balanceBefore) {
      throw new BadRequestException('Недостаточно бонусов для списания');
    }

    if (!holdId) {
      throw new BadRequestException('Не удалось подготовить hold');
    }
    const commitResult = await this.commitService.commit(
      holdId,
      orderId,
      invoiceNum || undefined,
      params.requestId ?? undefined,
      {
        operationDate,
        expectedMerchantId: merchantId,
        manualRedeemAmount:
          manualRedeem && manualRedeemOverride != null
            ? manualRedeemOverride
            : null,
        manualEarnPoints:
          manualEarn && manualEarnOverride != null ? manualEarnOverride : null,
        positions: manualRedeem || manualEarn ? undefined : rawItems,
      },
    );
    let receiptId: string | null = commitResult.receiptId ?? null;
    if (!receiptId) {
      const fallback = await safeExecAsync(
        () =>
          this.prisma.receipt.findUnique({
            where: { merchantId_orderId: { merchantId, orderId } },
            select: { id: true },
          }),
        async () => null,
        this.logger,
        'integration-bonus: load receipt after commit',
      );
      receiptId = fallback?.id ?? null;
    }
    if (!receiptId) {
      throw new BadRequestException('Не удалось зафиксировать операцию');
    }
    const walletAfter = await this.balance(merchantId, customerId);
    return {
      receiptId: receiptId,
      orderId: receiptId,
      invoiceNum: invoiceNum ?? null,
      redeemApplied: commitResult.redeemApplied ?? 0,
      earnApplied: commitResult.earnApplied ?? 0,
      balanceBefore,
      balanceAfter: walletAfter.balance ?? 0,
      alreadyProcessed: Boolean(commitResult.alreadyCommitted),
    };
  }
  protected async computeIntegrationCalc(params: {
    merchantId: string;
    customerId: string;
    items: PositionInput[];
    outletId?: string | null;
    operationDate?: Date | null;
    total?: number | null;
    paidBonus?: number | null;
    redeemMode: 'max' | 'exact';
    allowAutoPromotions?: boolean;
  }) {
    const normalized = this.sanitizePositions(params.items);
    const baseTotal = Math.max(0, Math.floor(Number(params.total ?? 0) || 0));
    const hasItems = normalized.length > 0;
    const operationDate = params.operationDate ?? new Date();

    let resolved: ResolvedPosition[];
    let total: number;
    let eligibleAmount: number;
    if (hasItems) {
      resolved = await this.resolvePositions(
        params.merchantId,
        normalized,
        params.customerId,
        { allowAutoPromotions: params.allowAutoPromotions },
      );
      const computed = this.computeTotalsFromPositions(0, resolved);
      total = computed.total;
      eligibleAmount = computed.eligibleAmount;
    } else if (baseTotal > 0) {
      resolved = [
        {
          productId: undefined,
          externalId: undefined,
          resolvedProductId: undefined,
          categoryId: undefined,
          name: undefined,
          qty: 1,
          price: baseTotal,
          basePrice: baseTotal,
          amount: baseTotal,
          accruePoints: true,
          allowEarnAndPay: true,
          promotionMultiplier: 1,
        } as ResolvedPosition,
      ];
      total = baseTotal;
      eligibleAmount = baseTotal;
    } else {
      throw new BadRequestException('items или total обязательны');
    }

    const context = await this.context.ensureCustomerContext(
      params.merchantId,
      params.customerId,
    );
    const accrualsBlocked = Boolean(context.accrualsBlocked);
    const redemptionsBlocked = Boolean(context.redemptionsBlocked);
    const [balanceResp, rates, settings, allowSameReceipt] = await Promise.all([
      this.balance(params.merchantId, params.customerId),
      this.getBaseRatesForCustomer(params.merchantId, params.customerId, {
        outletId: params.outletId,
        eligibleAmount,
      }),
      this.getSettings(params.merchantId),
      this.tiers.isAllowSameReceipt(params.merchantId),
    ]);
    const balance = balanceResp.balance ?? 0;
    const earnBps = rates.earnBps ?? 0;
    const redeemLimitBps = rates.redeemLimitBps ?? 0;
    const tierMinPayment = rates.tierMinPayment ?? null;

    const paidBonus =
      params.paidBonus != null
        ? Math.max(0, Math.floor(Number(params.paidBonus) || 0))
        : null;
    const redeemTarget =
      paidBonus != null ? paidBonus : params.redeemMode === 'exact' ? 0 : null;
    const amounts = resolved.map((item) => Math.max(0, item.amount || 0));
    const itemCaps = this.computeRedeemCaps(resolved);
    const capsTotal = itemCaps.reduce((sum, cap) => sum + cap, 0);

    let redeemAllowed = !redemptionsBlocked;
    if (redeemAllowed && settings.redeemCooldownSec > 0) {
      const last = await this.prisma.transaction.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: 'REDEEM',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const diffSec = Math.floor(
          (Date.now() - last.createdAt.getTime()) / 1000,
        );
        if (diffSec < settings.redeemCooldownSec) {
          redeemAllowed = false;
        }
      }
    }

    let dailyRedeemLeft: number | null = null;
    if (
      redeemAllowed &&
      settings.redeemDailyCap &&
      settings.redeemDailyCap > 0
    ) {
      const ts = operationDate.getTime();
      const since = new Date(ts - 24 * 60 * 60 * 1000);
      const until = new Date(ts);
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: 'REDEEM',
          createdAt: { gte: since, lte: until },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
      dailyRedeemLeft = Math.max(0, settings.redeemDailyCap - used);
      if (dailyRedeemLeft <= 0) redeemAllowed = false;
    }

    let maxRedeemTotal = 0;
    if (redeemAllowed) {
      const maxRedeemByLimit = Math.floor((total * redeemLimitBps) / 10000);
      const allowedByMinPayment =
        tierMinPayment != null
          ? Math.max(0, total - tierMinPayment)
          : Number.MAX_SAFE_INTEGER;
      maxRedeemTotal = Math.min(
        balance,
        maxRedeemByLimit,
        total,
        allowedByMinPayment,
        capsTotal,
        dailyRedeemLeft ?? Number.MAX_SAFE_INTEGER,
      );
      if (redeemTarget != null) {
        maxRedeemTotal = Math.min(maxRedeemTotal, redeemTarget);
      }
    }

    const redeemShares = this.allocateProRataWithCaps(
      amounts,
      itemCaps,
      maxRedeemTotal,
    );
    const appliedRedeem = redeemShares.reduce((sum, value) => sum + value, 0);
    const perItemMaxRedeem = redeemAllowed
      ? redeemTarget != null
        ? redeemShares
        : itemCaps
      : itemCaps.map(() => 0);
    const finalPayable = Math.max(0, total - appliedRedeem);

    let earnAllowed = !accrualsBlocked;
    if (earnAllowed && settings.earnCooldownSec > 0) {
      const last = await this.prisma.transaction.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: 'EARN',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const diffSec = Math.floor(
          (Date.now() - last.createdAt.getTime()) / 1000,
        );
        if (diffSec < settings.earnCooldownSec) {
          earnAllowed = false;
        }
      }
    }
    if (tierMinPayment != null) {
      const baseForMin = appliedRedeem > 0 ? finalPayable : total;
      if (baseForMin < tierMinPayment) earnAllowed = false;
    }
    if (appliedRedeem > 0 && !allowSameReceipt) earnAllowed = false;

    const itemsForCalc = resolved.map((item) => ({
      ...item,
      earnPoints: 0,
      redeemAmount: 0,
    }));
    let earnedTotal = this.applyEarnAndRedeemToItems(
      itemsForCalc,
      earnAllowed ? earnBps : 0,
      appliedRedeem,
      { allowEarn: earnAllowed },
    );

    if (earnAllowed && settings.earnDailyCap && settings.earnDailyCap > 0) {
      const ts = operationDate.getTime();
      const since = new Date(ts - 24 * 60 * 60 * 1000);
      const until = new Date(ts);
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: 'EARN',
          createdAt: { gte: since, lte: until },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
      const left = Math.max(0, settings.earnDailyCap - used);
      if (left <= 0) {
        itemsForCalc.forEach((item) => {
          item.earnPoints = 0;
        });
        earnedTotal = 0;
      } else if (earnedTotal > left) {
        const weights = itemsForCalc.map((item) =>
          Math.max(
            1,
            Math.floor(
              item.earnPoints != null && Number.isFinite(item.earnPoints)
                ? Math.max(0, item.earnPoints)
                : Math.max(0, item.amount || 0) *
                    Math.max(1, item.promotionMultiplier || 1),
            ),
          ),
        );
        const redistributed = this.allocateByWeight(weights, left);
        redistributed.forEach((value, idx) => {
          itemsForCalc[idx].earnPoints = value;
        });
        earnedTotal = left;
      }
    }

    return {
      itemsForCalc,
      perItemMaxRedeem,
      appliedRedeem,
      earnedTotal,
      finalPayable,
      total,
      eligibleAmount,
      hasItems,
      allowSameReceipt,
      accrualsBlocked,
      redemptionsBlocked,
    };
  }
  async calculateBonusPreview(params: {
    merchantId: string;
    customerId: string;
    userToken?: string | null;
    items: PositionInput[];
    outletId?: string | null;
    operationDate?: Date | null;
    total?: number | null;
    paidBonus?: number | null;
  }) {
    const calc = await this.computeIntegrationCalc({
      merchantId: params.merchantId,
      customerId: params.customerId,
      items: params.items,
      outletId: params.outletId,
      operationDate: params.operationDate,
      total: params.total,
      paidBonus: params.paidBonus,
      redeemMode: 'max',
      allowAutoPromotions: false,
    });

    const items = calc.itemsForCalc.map((item, idx) => {
      const qty = Math.max(0, Number(item.qty ?? 0));
      const price = Math.max(0, Number(item.price ?? 0));
      const itemMaxRedeem = calc.perItemMaxRedeem[idx] ?? 0;
      return {
        id_product:
          item.externalId ?? item.productId ?? item.resolvedProductId ?? null,
        name: item.name ?? null,
        price,
        quantity: qty,
        max_pay_bonus: itemMaxRedeem,
        earn_bonus: item.earnPoints ?? 0,
      };
    });

    return {
      items: calc.hasItems ? items : undefined,
      max_pay_bonus: calc.appliedRedeem,
      bonus_value: calc.earnedTotal,
      final_payable: calc.finalPayable,
    };
  }
}
