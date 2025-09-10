import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { Mode, QuoteDto } from './dto';
import { HoldStatus, TxnType, WalletType, LedgerAccount } from '@prisma/client';
import { randomUUID } from 'crypto';

type QrMeta = { jti: string; iat: number; exp: number } | undefined;

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  // ===== Earn Lots helpers (optional feature) =====
  private async consumeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const lots = await tx.earnLot.findMany({ where: { merchantId, customerId }, orderBy: { earnedAt: 'asc' } });
    const updates = require('./lots.util').planConsume(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await tx.earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.consumed', payload: { merchantId, customerId, lotId: up.id, consumed: up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  private async unconsumeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const lots = await tx.earnLot.findMany({ where: { merchantId, customerId, consumedPoints: { gt: 0 } }, orderBy: { earnedAt: 'desc' } });
    const updates = require('./lots.util').planUnconsume(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await tx.earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.unconsumed', payload: { merchantId, customerId, lotId: up.id, unconsumed: -up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  private async revokeLots(tx: any, merchantId: string, customerId: string, amount: number, ctx: { orderId?: string|null }) {
    const lots = await tx.earnLot.findMany({ where: { merchantId, customerId }, orderBy: { earnedAt: 'desc' } });
    const updates = require('./lots.util').planRevoke(lots.map((l: any) => ({ id: l.id, points: l.points, consumedPoints: l.consumedPoints || 0, earnedAt: l.earnedAt })), amount);
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
      await tx.earnLot.update({ where: { id: up.id }, data: { consumedPoints: (lot.consumedPoints || 0) + up.deltaConsumed } });
      await tx.eventOutbox.create({ data: { merchantId, eventType: 'loyalty.earnlot.revoked', payload: { merchantId, customerId, lotId: up.id, revoked: up.deltaConsumed, orderId: ctx.orderId ?? null, at: new Date().toISOString() } } });
    }
  }

  // ====== Кеш правил ======
  private rulesCache = new Map<string, { updatedAt: string; fn: (args: { channel: 'VIRTUAL'|'PC_POS'|'SMART'; weekday: number; eligibleTotal: number; category?: string }) => { earnBps: number; redeemLimitBps: number } }>();

  private compileRules(merchantId: string, rulesJson: any, updatedAt: Date | null | undefined) {
    const key = merchantId;
    const stamp = updatedAt ? updatedAt.toISOString() : '0';
    const cached = this.rulesCache.get(key);
    if (cached && cached.updatedAt === stamp) return cached.fn;
    let fn = (args: { channel: 'VIRTUAL'|'PC_POS'|'SMART'; weekday: number; eligibleTotal: number; category?: string }) => ({ earnBps: 500, redeemLimitBps: 5000 });
    if (Array.isArray(rulesJson)) {
      const rules = rulesJson as any[];
      fn = (args) => {
        let earnBps = 500;
        let redeemLimitBps = 5000;
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
    this.rulesCache.set(key, { updatedAt: stamp, fn });
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
    const { redeemCooldownSec, earnCooldownSec, redeemDailyCap, earnDailyCap, rulesJson } = await this.getSettings(dto.merchantId);

    // канал по типу устройства
    let channel: 'VIRTUAL'|'PC_POS'|'SMART' = 'VIRTUAL';
    if (dto.deviceId) {
      const dev = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (dev) channel = dev.type as any;
    }

    // применяем правила для earnBps/redeemLimitBps (с кешом)
    const wd = new Date().getDay();
    const rulesFn = this.compileRules(dto.merchantId, rulesJson, (await this.prisma.merchantSettings.findUnique({ where: { merchantId: dto.merchantId } }))?.updatedAt);
    const { earnBps, redeemLimitBps } = rulesFn({ channel, weekday: wd, eligibleTotal: dto.eligibleTotal, category: dto.category });

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
            return { canRedeem: false, discountToApply: 0, pointsToBurn: 0, finalPayable: Math.floor(dto.total), holdId: undefined, message: `Кулдаун на списание: подождите ${wait} сек.` };
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
          return { canRedeem: false, discountToApply: 0, pointsToBurn: 0, finalPayable: Math.floor(dto.total), holdId: undefined, message: 'Дневной лимит списаний исчерпан.' };
        }
      }
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
        const capLeft = dailyRedeemLeft != null ? dailyRedeemLeft : Number.MAX_SAFE_INTEGER;
        const discountToApply = Math.min(wallet.balance, limit, capLeft);
        const finalPayable = Math.max(0, Math.floor(dto.total - discountToApply));

        const hold = await tx.hold.create({
          data: {
            id: randomUUID(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: discountToApply,
            orderId: dto.orderId,
            total: Math.floor(dto.total),
            eligibleTotal: Math.floor(dto.eligibleTotal),
            qrJti: qr?.jti ?? null,
            expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
            status: HoldStatus.PENDING,
            outletId: dto.outletId ?? null,
            deviceId: dto.deviceId ?? null,
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
      let wallet = await tx.wallet.findFirst({
        where: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId: customer.id, merchantId: dto.merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }

      let points = Math.floor(dto.eligibleTotal * earnBps / 10000);
      if (dailyEarnLeft != null) points = Math.min(points, dailyEarnLeft);

      const hold = await tx.hold.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: Math.floor(dto.total),
          eligibleTotal: Math.floor(dto.eligibleTotal),
          qrJti: qr?.jti ?? null,
          expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
          status: HoldStatus.PENDING,
          outletId: dto.outletId ?? null,
          deviceId: dto.deviceId ?? null,
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

  async commit(holdId: string, orderId: string, receiptNumber?: string, requestId?: string) {
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

    return this.prisma.$transaction(async (tx) => {
      // Идемпотентность: если чек уже есть — ничего не делаем
      const existing = await tx.receipt.findUnique({ where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } } });
      if (existing) {
        return { ok: true, alreadyCommitted: true, receiptId: existing.id, redeemApplied: existing.redeemApplied, earnApplied: existing.earnApplied };
      }
      let appliedRedeem = 0;
      let appliedEarn = 0;

      if (hold.mode === 'REDEEM' && hold.redeemAmount > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        const amount = Math.min(fresh!.balance, hold.redeemAmount);
        appliedRedeem = amount;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance - amount } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.REDEEM, amount: -amount, orderId, outletId: hold.outletId, deviceId: hold.deviceId, staffId: hold.staffId }
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
            deviceId: hold.deviceId ?? null,
            staffId: hold.staffId ?? null,
            meta: { mode: 'REDEEM' },
          }});
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'redeem' });
        }
      }
      if (hold.mode === 'EARN' && hold.earnPoints > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        appliedEarn = hold.earnPoints;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: fresh!.balance + hold.earnPoints } });
        await tx.transaction.create({
          data: { customerId: hold.customerId, merchantId: hold.merchantId, type: TxnType.EARN, amount: hold.earnPoints, orderId, outletId: hold.outletId, deviceId: hold.deviceId, staffId: hold.staffId }
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
            deviceId: hold.deviceId ?? null,
            staffId: hold.staffId ?? null,
            meta: { mode: 'EARN' },
          }});
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
          this.metrics.inc('loyalty_ledger_amount_total', { type: 'earn' }, appliedEarn);
        }
        // Earn lots (optional)
        if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
          let expires: Date | null = null;
          try {
            const s = await tx.merchantSettings.findUnique({ where: { merchantId: hold.merchantId } });
            const days = (s as any)?.pointsTtlDays as number | null;
            if (days && days > 0) expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          } catch {}
          await tx.earnLot.create({ data: {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            points: appliedEarn,
            consumedPoints: 0,
            earnedAt: new Date(),
            expiresAt: expires,
            orderId,
            receiptId: null,
            outletId: hold.outletId ?? null,
            deviceId: hold.deviceId ?? null,
            staffId: hold.staffId ?? null,
          }});
        }
      }

      await tx.hold.update({
        where: { id: hold.id },
        data: { status: HoldStatus.COMMITTED, orderId, receiptId: receiptNumber }
      });

      try {
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
            deviceId: hold.deviceId ?? null,
            staffId: hold.staffId ?? null,
          }
        });
        // обновим lastSeen у устройства, если передано
        if (hold.deviceId) {
          try { await tx.device.update({ where: { id: hold.deviceId }, data: { lastSeenAt: new Date() } }); } catch {}
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
              deviceId: hold.deviceId ?? null,
              staffId: hold.staffId ?? null,
              requestId: requestId ?? null,
            } as any,
          },
        });
        return { ok: true, receiptId: created.id, redeemApplied: appliedRedeem, earnApplied: appliedEarn };
      } catch (e: any) {
        // В редкой гонке уникальный индекс по (merchantId, orderId) может сработать — считаем идемпотентным успехом
        const existing2 = await tx.receipt.findUnique({ where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } } });
        if (existing2) {
          return { ok: true, alreadyCommitted: true, receiptId: existing2.id, redeemApplied: existing2.redeemApplied, earnApplied: existing2.earnApplied };
        }
        throw e;
      }
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
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: pointsToRestore, orderId, outletId: receipt.outletId, deviceId: receipt.deviceId, staffId: receipt.staffId }
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
            deviceId: receipt.deviceId ?? null,
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
          data: { customerId: receipt.customerId, merchantId, type: TxnType.REFUND, amount: -pointsToRevoke, orderId, outletId: receipt.outletId, deviceId: receipt.deviceId, staffId: receipt.staffId }
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
            deviceId: receipt.deviceId ?? null,
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
            deviceId: receipt.deviceId ?? null,
            staffId: receipt.staffId ?? null,
            requestId: requestId ?? null,
          } as any,
        },
      });
      return { ok: true, share, pointsRestored: pointsToRestore, pointsRevoked: pointsToRevoke };
    });
  }

  async transactions(merchantId: string, customerId: string, limit = 20, before?: Date, filters?: { outletId?: string|null; deviceId?: string|null; staffId?: string|null }) {
    const where: any = { merchantId, customerId };
    if (before) where.createdAt = { lt: before };
    if (filters?.outletId) where.outletId = filters.outletId;
    if (filters?.deviceId) where.deviceId = filters.deviceId;
    if (filters?.staffId) where.staffId = filters.staffId;
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    const nextBefore = items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;
    return { items, nextBefore };
  }
}
