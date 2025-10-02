import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { PromoCodesService, type PromoCodeApplyResult } from '../promocodes/promocodes.service';
import { Mode, QuoteDto } from './dto';
import { computeLevelState, parseLevelsConfig, resolveLevelBenefits } from './levels.util';
import { HoldStatus, TxnType, WalletType, LedgerAccount, HoldMode, DeviceType } from '@prisma/client';
import { randomUUID } from 'crypto';

type QrMeta = { jti: string; iat: number; exp: number } | undefined;

@Injectable()
export class LoyaltyService {
  // Simple wrappers for modules that directly earn/redeem points without QR/holds
  async earn(params: { customerId: string; merchantId: string; amount: number; orderId?: string }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    // Ensure entities exist
    await this.ensureCustomerId(customerId);
    try { await this.prisma.merchant.upsert({ where: { id: merchantId }, update: {}, create: { id: merchantId, name: merchantId } }); } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({ where: { customerId, merchantId, type: WalletType.POINTS } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 } });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance + amount } });
      const txn = await tx.transaction.create({
        data: { customerId, merchantId, type: TxnType.EARN, amount, orderId },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  async redeem(params: { customerId: string; merchantId: string; amount: number; orderId?: string }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    await this.ensureCustomerId(customerId);
    try { await this.prisma.merchant.upsert({ where: { id: merchantId }, update: {}, create: { id: merchantId, name: merchantId } }); } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({ where: { customerId, merchantId, type: WalletType.POINTS } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 } });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if ((fresh!.balance) < amount) throw new BadRequestException('Insufficient points');
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance - amount } });
      const txn = await tx.transaction.create({
        data: { customerId, merchantId, type: TxnType.REDEEM, amount: -amount, orderId },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  async applyPromoCode(params: { merchantId?: string; customerId?: string; code?: string }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const code = String(params?.code || '').trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!code) throw new BadRequestException('code required');

    await this.ensureCustomerId(customerId);
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new BadRequestException('merchant not found');

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({ where: { customerId, merchantId, type: WalletType.POINTS } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 } });
      }

      const promo = await this.promoCodes.findActiveByCode(merchantId, code);
      if (!promo) {
        throw new BadRequestException('Промокод недоступен');
      }

      const result = await this.promoCodes.apply(tx, {
        promoCodeId: promo.id,
        merchantId,
        customerId,
        staffId: null,
        outletId: null,
        orderId: null,
      });
      if (!result) {
        throw new BadRequestException('Промокод недоступен');
      }

      const points = Math.max(0, Math.floor(Number(result.pointsIssued || 0)));
      const promoExpireDays = result.pointsExpireInDays ?? null;
      const expiresAt = promoExpireDays ? new Date(Date.now() + promoExpireDays * 24 * 60 * 60 * 1000) : null;

      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const currentBalance = fresh?.balance ?? 0;
      let balance = currentBalance;
      if (points > 0) {
        balance = currentBalance + points;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
      }

      await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.EARN,
          amount: points,
          orderId: null,
          outletId: null,
          staffId: null,
        },
      });

      if (process.env.LEDGER_FEATURE === '1' && points > 0) {
        await tx.ledgerEntry.create({
          data: {
            merchantId,
            customerId,
            debit: LedgerAccount.MERCHANT_LIABILITY,
            credit: LedgerAccount.CUSTOMER_BALANCE,
            amount: points,
            orderId: null,
            receiptId: null,
            outletId: null,
            staffId: null,
            meta: { mode: 'PROMOCODE', promoCodeId: result.promoCode.id },
          },
        });
        this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
        this.metrics.inc('loyalty_ledger_amount_total', { type: 'earn' }, points);
      }

      if (process.env.EARN_LOTS_FEATURE === '1' && points > 0) {
        const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
        if (earnLot?.create) {
          await earnLot.create({
            data: {
              merchantId,
              customerId,
              points,
              consumedPoints: 0,
              earnedAt: new Date(),
              maturesAt: null,
              expiresAt,
              orderId: null,
              receiptId: null,
              outletId: null,
              staffId: null,
              status: 'ACTIVE',
            },
          });
        }
      }

      const messageParts: string[] = [];
      if (points > 0) messageParts.push(`Начислено ${points} баллов`);
      if (promoExpireDays) messageParts.push(`Бонус активен ${promoExpireDays} дн.`);
      if (result.promoCode.assignTierId) messageParts.push('Уровень обновлён');
      const message = messageParts.join('. ');

      return {
        ok: true,
        promoCodeId: result.promoCode.id,
        code: result.promoCode.code,
        pointsIssued: points,
        pointsExpireInDays: promoExpireDays,
        pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
        balance,
        tierAssigned: result.promoCode.assignTierId ?? null,
        message: message || 'Промокод активирован',
      };
    });
  }
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private promoCodes: PromoCodesService,
  ) {}

  // ===== Earn Lots helpers (optional feature) =====
  private async consumeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return; // в тестовых моках может отсутствовать
    const lots = await earnLot.findMany({ where: { merchantId, customerId }, orderBy: { earnedAt: 'asc' } });
    const updates = require('./lots.util').planConsume(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.consumed', payload: { merchantId, customerId, lotId: up.id, consumed: up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  private async unconsumeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({ where: { merchantId, customerId, consumedPoints: { gt: 0 } }, orderBy: { earnedAt: 'desc' } });
    const updates = require('./lots.util').planUnconsume(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.unconsumed', payload: { merchantId, customerId, lotId: up.id, unconsumed: -up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  private async revokeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({ where: { merchantId, customerId }, orderBy: { earnedAt: 'desc' } });
    const updates = require('./lots.util').planRevoke(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.revoked', payload: { merchantId, customerId, lotId: up.id, revoked: up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  // ====== Кеш правил ======
  private rulesCache = new Map<string, { updatedAt: string; baseEarnBps: number; baseRedeemLimitBps: number; fn: (args: { channel: 'VIRTUAL'|'PC_POS'|'SMART'; weekday: number; eligibleTotal: number; category?: string }) => { earnBps: number; redeemLimitBps: number } }>();

  private compileRules(merchantId: string, outletId: string | null, base: { earnBps: number; redeemLimitBps: number }, rulesJson: any, updatedAt: Date | null | undefined) {
    const key = `${merchantId}:${outletId ?? '-'}`;
    const stamp = updatedAt ? updatedAt.toISOString() : '0';
    const cached = this.rulesCache.get(key);
    if (cached && cached.updatedAt === stamp && cached.baseEarnBps === base.earnBps && cached.baseRedeemLimitBps === base.redeemLimitBps) return cached.fn;
    let fn = (args: { channel: 'VIRTUAL'|'PC_POS'|'SMART'; weekday: number; eligibleTotal: number; category?: string }) => ({ earnBps: base.earnBps, redeemLimitBps: base.redeemLimitBps });
    // Support both array root and object with { rules: [...] }
    const rulesArr: any[] | null = Array.isArray(rulesJson)
      ? (rulesJson as any[])
      : (rulesJson && Array.isArray((rulesJson as any).rules) ? (rulesJson as any).rules : null);
    if (Array.isArray(rulesArr)) {
      const rules = rulesArr as any[];
      fn = (args) => {
        let earnBps = base.earnBps;
        let redeemLimitBps = base.redeemLimitBps;
        const wd = args.weekday;
        for (const item of rules) {
          try {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
            const cond = (item as any).if ?? {};
            if (Array.isArray(cond.channelIn) && !cond.channelIn.includes(args.channel)) continue;
            if (Array.isArray(cond.weekdayIn) && !cond.weekdayIn.includes(wd)) continue;
            if (cond.minEligible != null && args.eligibleTotal < Number(cond.minEligible)) continue;
            if (Array.isArray(cond.categoryIn) && !cond.categoryIn.includes(args.category)) continue;
            const then = (item as any).then ?? {};
            if (then.earnBps != null) earnBps = Number(then.earnBps);
            if (then.redeemLimitBps != null) redeemLimitBps = Number(then.redeemLimitBps);
          } catch {}
        }
        return { earnBps, redeemLimitBps };
      };
    }
    this.rulesCache.set(key, { updatedAt: stamp, baseEarnBps: base.earnBps, baseRedeemLimitBps: base.redeemLimitBps, fn });
    return fn;
  }

  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (found) return found;
    return this.prisma.customer.create({ data: { id: customerId } });
  }

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({ where: { merchantId } });
    return {
      earnBps: s?.earnBps ?? 500,
      redeemLimitBps: s?.redeemLimitBps ?? 5000,
      redeemCooldownSec: s?.redeemCooldownSec ?? 0,
      earnCooldownSec: s?.earnCooldownSec ?? 0,
      redeemDailyCap: s?.redeemDailyCap ?? null,
      earnDailyCap: s?.earnDailyCap ?? null,
      rulesJson: s?.rulesJson ?? null,
      updatedAt: s?.updatedAt ?? null,
    };
  }

  private normalizeChannel(raw: DeviceType | null | undefined): 'VIRTUAL'|'PC_POS'|'SMART' {
    if (!raw) return 'VIRTUAL';
    if (raw === DeviceType.SMART) return 'SMART';
    if (raw === DeviceType.PC_POS) return 'PC_POS';
    return 'VIRTUAL';
  }

  private async resolveOutletContext(merchantId: string, input: { outletId?: string | null }) {
    const { outletId } = input;
    let outlet: { id: string; posType: DeviceType | null } | null = null;
    if (outletId) {
      try {
        outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, merchantId }, select: { id: true, posType: true } });
      } catch {}
    }
    const channel = this.normalizeChannel(outlet?.posType ?? null);
    return { outletId: outlet?.id ?? null, channel };
  }

  // ===== Levels integration (Wave 2) =====
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
    // Ensure the merchant exists to satisfy FK constraints for wallet/holds
    try {
      await this.prisma.merchant.upsert({ where: { id: dto.merchantId }, update: {}, create: { id: dto.merchantId, name: dto.merchantId } });
    } catch {}
    const { redeemCooldownSec, earnCooldownSec, redeemDailyCap, earnDailyCap, rulesJson, earnBps: baseEarnBps, redeemLimitBps: baseRedeemLimitBps, updatedAt } = await this.getSettings(dto.merchantId);
    const rulesConfig = rulesJson && typeof rulesJson === 'object' ? (rulesJson as Record<string, any>) : {};
    const disallowSameReceipt = Boolean(rulesConfig.disallowEarnRedeemSameReceipt);

    const outletCtx = await this.resolveOutletContext(dto.merchantId, { outletId: dto.outletId ?? null });
    const channel = outletCtx.channel;
    const effectiveOutletId = outletCtx.outletId ?? null;

    // Нормализуем суммы (защита от отрицательных/NaN)
    const sanitizedTotal = Math.max(0, Math.floor(Number((dto as any).total ?? 0)));
    const sanitizedEligibleTotal = Math.max(0, Math.floor(Number((dto as any).eligibleTotal ?? 0)));
    // применяем правила для earnBps/redeemLimitBps (с кешом)
    const wd = new Date().getDay();
    const rulesFn = this.compileRules(dto.merchantId, effectiveOutletId, { earnBps: baseEarnBps, redeemLimitBps: baseRedeemLimitBps }, rulesJson, updatedAt);
    let { earnBps, redeemLimitBps } = rulesFn({ channel, weekday: wd, eligibleTotal: sanitizedEligibleTotal, category: dto.category });
    // Apply level-based bonuses (if configured)
    try {
      const cfg = parseLevelsConfig(rulesJson);
      const state = await computeLevelState({
        prisma: this.prisma,
        metrics: this.metrics,
        merchantId: dto.merchantId,
        customerId: customer.id,
        config: cfg,
      });
      const bonus = resolveLevelBenefits(rulesJson, state.current.name);
      earnBps = Math.max(0, earnBps + bonus.earnBpsBonus);
      redeemLimitBps = Math.max(0, redeemLimitBps + bonus.redeemLimitBpsBonus);
    } catch {}

    // 0) если есть qr — сначала смотрим, не существует ли hold с таким qrJti
    if (qr) {
      const existing = await this.prisma.hold.findUnique({ where: { qrJti: qr.jti } });
      if (existing) {
        if (existing.status === HoldStatus.PENDING) {
          if (effectiveOutletId && existing.outletId !== effectiveOutletId) {
            try {
              await this.prisma.hold.update({ where: { id: existing.id }, data: { outletId: effectiveOutletId } });
              (existing as any).outletId = effectiveOutletId;
            } catch {}
          }
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
          if (again.status === HoldStatus.PENDING) {
            if (effectiveOutletId && again.outletId !== effectiveOutletId) {
              try {
                await this.prisma.hold.update({ where: { id: again.id }, data: { outletId: effectiveOutletId } });
                (again as any).outletId = effectiveOutletId;
              } catch {}
            }
            return this.quoteFromExistingHold(dto.mode, again);
          }
          throw new BadRequestException('QR токен уже использован. Попросите клиента обновить QR.');
        }
        // иначе считаем, что QR использован
        throw new BadRequestException('QR токен уже использован. Попросите клиента обновить QR.');
      }
    }

    const modeUpper = String(dto.mode).toUpperCase();
    if (modeUpper === 'REDEEM') {
      if (disallowSameReceipt && dto.orderId) {
        const [existingEarnHold, existingReceipt] = await Promise.all([
          this.prisma.hold.findFirst({
            where: {
              merchantId: dto.merchantId,
              customerId: customer.id,
              orderId: dto.orderId,
              status: HoldStatus.PENDING,
              mode: 'EARN' as HoldMode,
            },
          }),
          this.prisma.receipt.findUnique({
            where: { merchantId_orderId: { merchantId: dto.merchantId, orderId: dto.orderId } },
          }).catch(() => null),
        ]);
        if (existingEarnHold || (existingReceipt && Math.max(0, existingReceipt.earnApplied || 0) > 0)) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message: 'Нельзя одновременно начислять и списывать баллы в одном чеке.',
          };
        }
      }
      // антифрод: кулдаун и дневной лимит списаний
      if (redeemCooldownSec && redeemCooldownSec > 0) {
        const last = await this.prisma.transaction.findFirst({
          where: { merchantId: dto.merchantId, customerId: customer.id, type: 'REDEEM' },
          orderBy: { createdAt: 'desc' },
        });
        if (last) {
          const diffSec = Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
          if (diffSec < redeemCooldownSec) {
            const wait = redeemCooldownSec - diffSec;
            return { canRedeem: false, discountToApply: 0, pointsToBurn: 0, finalPayable: sanitizedTotal, holdId: undefined, message: `Кулдаун на списание: подождите ${wait} сек.` };
          }
        }
      }
      let dailyRedeemLeft: number | null = null;
      if (redeemDailyCap && redeemDailyCap > 0) {
        const since = new Date(Date.now() - 24*60*60*1000);
        const txns = await this.prisma.transaction.findMany({ where: { merchantId: dto.merchantId, customerId: customer.id, type: 'REDEEM', createdAt: { gte: since } } });
        const used = txns.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
        dailyRedeemLeft = Math.max(0, redeemDailyCap - used);
        if (dailyRedeemLeft <= 0) {
          return { canRedeem: false, discountToApply: 0, pointsToBurn: 0, finalPayable: sanitizedTotal, holdId: undefined, message: 'Дневной лимит списаний исчерпан.' };
        }
      }
      // Проверка: если указан orderId, учитываем уже применённое списание по этому заказу
      let priorRedeemApplied = 0;
      if (dto.orderId) {
        try {
          const rcp = await this.prisma.receipt.findUnique({ where: { merchantId_orderId: { merchantId: dto.merchantId, orderId: dto.orderId } } });
          if (rcp) priorRedeemApplied = Math.max(0, rcp.redeemApplied || 0);
        } catch {}
      }

      // 2) дальше — обычный расчёт в транзакции и создание нового hold (уникальный qrJti не даст дубликат)
      return this.prisma.$transaction(async (tx) => {
        // Ensure merchant exists within the same transaction/connection (FK safety)
        try { await tx.merchant.upsert({ where: { id: dto.merchantId }, update: {}, create: { id: dto.merchantId, name: dto.merchantId } }); } catch {}
        let wallet = await tx.wallet.findFirst({
          where: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS, balance: 0 },
          });
        }

        const limit = Math.floor(sanitizedEligibleTotal * redeemLimitBps / 10000);
        // Учитываем уже применённое списание по этому заказу: нельзя превысить лимит
        const remainingByOrder = Math.max(0, limit - priorRedeemApplied);
        if (dto.orderId && remainingByOrder <= 0) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message: 'По этому заказу уже списаны максимальные баллы.'
          } as any;
        }
        const capLeft = dailyRedeemLeft != null ? dailyRedeemLeft : Number.MAX_SAFE_INTEGER;
        const discountToApply = Math.min(wallet.balance, remainingByOrder || limit, capLeft);
        const finalPayable = Math.max(0, sanitizedTotal - discountToApply);

        const hold = await tx.hold.create({
          data: {
            id: randomUUID(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: discountToApply,
            orderId: dto.orderId,
            total: sanitizedTotal,
            eligibleTotal: sanitizedEligibleTotal,
            qrJti: qr?.jti ?? null,
            expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
            status: HoldStatus.PENDING,
            outletId: effectiveOutletId,
            staffId: dto.staffId ?? null,
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
    if (disallowSameReceipt && dto.orderId) {
      const [existingRedeemHold, existingReceipt] = await Promise.all([
        this.prisma.hold.findFirst({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            orderId: dto.orderId,
            status: HoldStatus.PENDING,
            mode: 'REDEEM' as HoldMode,
          },
        }),
        this.prisma.receipt.findUnique({
          where: { merchantId_orderId: { merchantId: dto.merchantId, orderId: dto.orderId } },
        }).catch(() => null),
      ]);
      if (existingRedeemHold || (existingReceipt && Math.max(0, existingReceipt.redeemApplied || 0) > 0)) {
        return {
          canEarn: false,
          pointsToEarn: 0,
          holdId: undefined,
          message: 'Нельзя одновременно начислять и списывать баллы в одном чеке.',
        };
      }
    }
    // антифрод: кулдаун и дневной лимит начислений
    if (earnCooldownSec && earnCooldownSec > 0) {
      const last = await this.prisma.transaction.findFirst({
        where: { merchantId: dto.merchantId, customerId: customer.id, type: 'EARN' },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const diffSec = Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
        if (diffSec < earnCooldownSec) {
          const wait = earnCooldownSec - diffSec;
          return { canEarn: false, pointsToEarn: 0, holdId: undefined, message: `Кулдаун на начисление: подождите ${wait} сек.` };
        }
      }
    }
    let dailyEarnLeft: number | null = null;
    if (earnDailyCap && earnDailyCap > 0) {
      const since = new Date(Date.now() - 24*60*60*1000);
      const txns = await this.prisma.transaction.findMany({ where: { merchantId: dto.merchantId, customerId: customer.id, type: 'EARN', createdAt: { gte: since } } });
      const used = txns.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
      dailyEarnLeft = Math.max(0, earnDailyCap - used);
      if (dailyEarnLeft <= 0) {
        return { canEarn: false, pointsToEarn: 0, holdId: undefined, message: 'Дневной лимит начислений исчерпан.' };
      }
    }
    return this.prisma.$transaction(async (tx) => {
      // Ensure merchant exists within the same transaction/connection (FK safety)
      try { await tx.merchant.upsert({ where: { id: dto.merchantId }, update: {}, create: { id: dto.merchantId, name: dto.merchantId } }); } catch {}
      let wallet = await tx.wallet.findFirst({
        where: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }

      let points = Math.floor(sanitizedEligibleTotal * earnBps / 10000);
      if (dailyEarnLeft != null) points = Math.min(points, dailyEarnLeft);
      if (points < 0) points = 0;

      const hold = await tx.hold.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: sanitizedTotal,
          eligibleTotal: sanitizedEligibleTotal,
          qrJti: qr?.jti ?? null,
          expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
          status: HoldStatus.PENDING,
          outletId: effectiveOutletId,
          staffId: dto.staffId ?? null,
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

  async commit(
    holdId: string,
    orderId: string,
    receiptNumber?: string,
    requestId?: string,
    opts?: { promoCode?: { promoCodeId: string; code?: string | null } },
  ) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Hold expired. Обновите QR в мини-аппе и повторите.');
    }
    if (hold.status !== HoldStatus.PENDING) {
      // Идемпотентность: если чек уже есть по этому заказу — возвращаем успех
      const existing = await this.prisma.receipt.findUnique({ where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } } });
      if (existing) {
        return { ok: true, alreadyCommitted: true, receiptId: existing.id, redeemApplied: existing.redeemApplied, earnApplied: existing.earnApplied };
      }
      throw new ConflictException('Hold already finished');
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: { customerId: hold.customerId, merchantId: hold.merchantId, type: WalletType.POINTS },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Идемпотентность: если чек уже есть — ничего не делаем
        const existing = await tx.receipt.findUnique({ where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } } });
        if (existing) {
          return { ok: true, alreadyCommitted: true, receiptId: existing.id, redeemApplied: existing.redeemApplied, earnApplied: existing.earnApplied };
        }

        // Накапливаем применённые суммы для чека
        let appliedRedeem = 0;
        let appliedEarn = 0;
        let promoResult: PromoCodeApplyResult | null = null;
        if (opts?.promoCode && hold.customerId) {
          promoResult = await this.promoCodes.apply(tx, {
            promoCodeId: opts.promoCode.promoCodeId,
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            staffId: hold.staffId ?? null,
            outletId: hold.outletId ?? null,
            orderId,
          });
          if (!promoResult) {
            throw new BadRequestException('Промокод недоступен');
          }
        }

        // REDEEM
        if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
          const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
          const amount = Math.min(fresh!.balance, hold.redeemAmount);
          appliedRedeem = amount;
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance - amount } });
          await tx.transaction.create({
            data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.REDEEM, amount: -amount, orderId, outletId: hold.outletId, staffId: hold.staffId }
          });
          // Earn lots consumption (optional)
          if (process.env.EARN_LOTS_FEATURE === '1' && amount > 0) {
            await this.consumeLots(tx, hold.merchantId, hold.customerId, amount, { orderId });
          }
          // Ledger mirror (optional)
          if (process.env.LEDGER_FEATURE === '1' && amount > 0) {
            await tx.ledgerEntry.create({ data: {
              merchantId: hold.merchantId,
              customerId: hold.customerId,
              debit: LedgerAccount.CUSTOMER_BALANCE,
              credit: LedgerAccount.MERCHANT_LIABILITY,
              amount,
              orderId,
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              meta: { mode: 'REDEEM' },
            }});
            this.metrics.inc('loyalty_ledger_entries_total', { type: 'redeem' });
          }
        }
      const baseEarnFromHold = hold.mode === 'EARN' ? Math.max(0, Math.floor(Number(hold.earnPoints || 0))) : 0;
      const promoBonus = promoResult ? Math.max(0, Math.floor(Number(promoResult.pointsIssued || 0))) : 0;
      const appliedEarnTotal = baseEarnFromHold + promoBonus;

      if (appliedEarnTotal > 0) {
        // Проверяем, требуется ли задержка начисления. В юнит-тестах tx может не иметь merchantSettings — делаем fallback на this.prisma.
        let settings: any = null;
        const txHasMs = (tx as any)?.merchantSettings?.findUnique;
        if (txHasMs) {
          settings = await (tx as any).merchantSettings.findUnique({ where: { merchantId: hold.merchantId } });
        } else if ((this.prisma as any)?.merchantSettings?.findUnique) {
          settings = await (this.prisma as any).merchantSettings.findUnique({ where: { merchantId: hold.merchantId } });
        }
        const delayDays = Number((settings as any)?.earnDelayDays || 0) || 0;
        const ttlDays = Number((settings as any)?.pointsTtlDays || 0) || 0;
        appliedEarn = appliedEarnTotal;
        const promoExpireDays = promoResult?.pointsExpireInDays ?? null;

        if (delayDays > 0) {
          // Откладываем начисление: создаём PENDING lot и событие, баланс не трогаем до созревания
          if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
            const maturesAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
            const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
            if (earnLot?.create) {
              if (baseEarnFromHold > 0) {
                const expiresAtStd = ttlDays > 0 ? new Date(maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000) : null;
                await earnLot.create({
                  data: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    points: baseEarnFromHold,
                    consumedPoints: 0,
                    earnedAt: maturesAt,
                    maturesAt,
                    expiresAt: expiresAtStd,
                    orderId,
                    receiptId: null,
                    outletId: hold.outletId ?? null,
                    staffId: hold.staffId ?? null,
                    status: 'PENDING',
                  },
                });
              }
              if (promoBonus > 0) {
                const promoExpiresAt = promoExpireDays
                  ? new Date(maturesAt.getTime() + promoExpireDays * 24 * 60 * 60 * 1000)
                  : null;
                await earnLot.create({
                  data: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    points: promoBonus,
                    consumedPoints: 0,
                    earnedAt: maturesAt,
                    maturesAt,
                    expiresAt: promoExpiresAt,
                    orderId,
                    receiptId: null,
                    outletId: hold.outletId ?? null,
                    staffId: hold.staffId ?? null,
                    status: 'PENDING',
                    metadata: opts?.promoCode ? { promoCodeId: opts.promoCode.promoCodeId } : undefined,
                  },
                });
              }
            }
          }
          await tx.eventOutbox.create({ data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.earn.scheduled',
            payload: {
              holdId: hold.id,
              orderId,
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              points: appliedEarn,
              maturesAt: new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString(),
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              promoCode:
                promoResult && opts?.promoCode
                  ? {
                      promoCodeId: opts.promoCode.promoCodeId,
                      code: opts.promoCode.code ?? null,
                      points: promoBonus,
                      expiresInDays: promoExpireDays,
                    }
                  : undefined,
            } as any,
          }});
        } else {
          // Немедленное начисление
          const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
          if (appliedEarn > 0) {
            await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance + appliedEarn } });
          }
          await tx.transaction.create({
            data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.EARN, amount: appliedEarn, orderId, outletId: hold.outletId, staffId: hold.staffId }
          });
          // Ledger mirror (optional)
          if (process.env.LEDGER_FEATURE === '1' && appliedEarn > 0) {
            await tx.ledgerEntry.create({ data: {
              merchantId: hold.merchantId,
              customerId: hold.customerId,
              debit: LedgerAccount.MERCHANT_LIABILITY,
              credit: LedgerAccount.CUSTOMER_BALANCE,
              amount: appliedEarn,
              orderId,
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              meta: { mode: 'EARN' },
            }});
            this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
            this.metrics.inc('loyalty_ledger_amount_total', { type: 'earn' }, appliedEarn);
          }
          // Earn lots (optional)
          if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
            const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
            if (earnLot?.create) {
              if (baseEarnFromHold > 0) {
                let expires: Date | null = null;
                if (ttlDays > 0) expires = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
                await earnLot.create({
                  data: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    points: baseEarnFromHold,
                    consumedPoints: 0,
                    earnedAt: new Date(),
                    maturesAt: null,
                    expiresAt: expires,
                    orderId,
                    receiptId: null,
                    outletId: hold.outletId ?? null,
                    staffId: hold.staffId ?? null,
                    status: 'ACTIVE',
                  },
                });
              }
              if (promoBonus > 0) {
                const expiresPromo = promoExpireDays
                  ? new Date(Date.now() + promoExpireDays * 24 * 60 * 60 * 1000)
                  : null;
                await earnLot.create({
                  data: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    points: promoBonus,
                    consumedPoints: 0,
                    earnedAt: new Date(),
                    maturesAt: null,
                    expiresAt: expiresPromo,
                    orderId,
                    receiptId: null,
                    outletId: hold.outletId ?? null,
                    staffId: hold.staffId ?? null,
                    status: 'ACTIVE',
                    metadata: opts?.promoCode ? { promoCodeId: opts.promoCode.promoCodeId } : undefined,
                  },
                });
              }
            }
          }
        }
      }

      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.COMMITTED, orderId, receiptId: receiptNumber }
      });

        const created = await tx.receipt.create({
          data: {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            orderId,
            receiptNumber: receiptNumber ?? null,
            total: hold.total ?? 0,
            eligibleTotal: hold.eligibleTotal ?? (hold.total ?? 0),
            redeemApplied: appliedRedeem,
            earnApplied: appliedEarn,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
          }
        });
        // обновим lastSeen у торговой точки/устройства
        const touchTs = new Date();
        if (hold.outletId) {
          try { await tx.outlet.update({ where: { id: hold.outletId }, data: { posLastSeenAt: touchTs } }); } catch {}
        }
        // Пишем событие в outbox (минимально)
        await tx.eventOutbox.create({
          data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.commit',
            payload: {
              schemaVersion: 1,
              holdId: hold.id,
              orderId,
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              redeemApplied: appliedRedeem,
              earnApplied: appliedEarn,
              receiptId: created.id,
              createdAt: new Date().toISOString(),
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              requestId: requestId ?? null,
            } as any,
          },
        });
        return { ok: true, receiptId: created.id, redeemApplied: appliedRedeem, earnApplied: appliedEarn };
      });
    } catch (e: any) {
      // В редкой гонке уникальный индекс по (merchantId, orderId) может сработать —
      // любая следующая команда в рамках той же транзакции упадёт с 25P02 (transaction aborted).
      // Выполним идемпотентный поиск вне транзакции.
      try {
        const existing2 = await this.prisma.receipt.findUnique({ where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } } });
        if (existing2) {
          return { ok: true, alreadyCommitted: true, receiptId: existing2.id, redeemApplied: existing2.redeemApplied, earnApplied: existing2.earnApplied };
        }
      } catch {}
      throw e;
    }
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

  async refund(merchantId: string, orderId: string, refundTotal: number, refundEligibleTotal?: number, requestId?: string) {
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
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: pointsToRestore, orderId, outletId: receipt.outletId, staffId: receipt.staffId }
        });
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.unconsumeLots(tx, merchantId, receipt.customerId, pointsToRestore, { orderId });
        }
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({ data: {
            merchantId,
            customerId: receipt.customerId,
            debit: LedgerAccount.MERCHANT_LIABILITY,
            credit: LedgerAccount.CUSTOMER_BALANCE,
            amount: pointsToRestore,
            orderId,
            outletId: receipt.outletId ?? null,
            staffId: receipt.staffId ?? null,
            meta: { mode: 'REFUND', kind: 'restore' },
          }});
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'refund_restore' });
        }
      }
      if (pointsToRevoke > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: (fresh!.balance - pointsToRevoke) } });
        await tx.transaction.create({
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: -pointsToRevoke, orderId, outletId: receipt.outletId, staffId: receipt.staffId }
        });
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.revokeLots(tx, merchantId, receipt.customerId, pointsToRevoke, { orderId });
        }
        if (process.env.LEDGER_FEATURE === '1') {
          await tx.ledgerEntry.create({ data: {
            merchantId,
            customerId: receipt.customerId,
            debit: LedgerAccount.CUSTOMER_BALANCE,
            credit: LedgerAccount.MERCHANT_LIABILITY,
            amount: pointsToRevoke,
            orderId,
            outletId: receipt.outletId ?? null,
            staffId: receipt.staffId ?? null,
            meta: { mode: 'REFUND', kind: 'revoke' },
          }});
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'refund_revoke' });
        }
      }
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.refund',
          payload: {
            schemaVersion: 1,
            orderId,
            customerId: receipt.customerId,
            merchantId,
            share,
            pointsRestored: pointsToRestore,
            pointsRevoked: pointsToRevoke,
            createdAt: new Date().toISOString(),
            outletId: receipt.outletId ?? null,
            staffId: receipt.staffId ?? null,
            requestId: requestId ?? null,
          } as any,
        },
      });
      return { ok: true, share, pointsRestored: pointsToRestore, pointsRevoked: pointsToRevoke };
    });
  }

  async transactions(merchantId: string, customerId: string, limit = 20, before?: Date, filters?: { outletId?: string|null; staffId?: string|null }) {
    const where: any = { merchantId, customerId };
    if (before) where.createdAt = { lt: before };
    if (filters?.outletId) where.outletId = filters.outletId;
    if (filters?.staffId) where.staffId = filters.staffId;
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { outlet: { select: { posType: true, posLastSeenAt: true } } },
    });
    const nextBefore = items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;
    const normalized = items.map((entity) => ({
      id: entity.id,
      type: entity.type,
      amount: entity.amount,
      orderId: entity.orderId ?? null,
      customerId: entity.customerId,
      createdAt: entity.createdAt.toISOString(),
      outletId: entity.outletId ?? null,
      outletPosType: entity.outlet?.posType ?? null,
      outletLastSeenAt: entity.outlet?.posLastSeenAt ? entity.outlet.posLastSeenAt.toISOString() : null,
      staffId: entity.staffId ?? null,
    }));
    return { items: normalized, nextBefore };
  }
}
