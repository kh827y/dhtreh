import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { fetchReceiptAggregates } from '../common/receipt-aggregates.util';
import {
  TelegramStaffNotificationsService,
  type StaffNotificationPayload,
} from '../telegram/staff-notifications.service';
import {
  PromoCodesService,
  type PromoCodeApplyResult,
} from '../promocodes/promocodes.service';
import { Mode, QuoteDto } from './dto';
import {
  computeLevelState,
  DEFAULT_LEVELS_METRIC,
  DEFAULT_LEVELS_PERIOD_DAYS,
  type LevelRule,
} from './levels.util';
import { ensureBaseTier, toLevelRule } from './tier-defaults.util';
import {
  StaffMotivationEngine,
  type StaffMotivationSettingsNormalized,
} from '../staff-motivation/staff-motivation.engine';
import {
  HoldStatus,
  TxnType,
  WalletType,
  LedgerAccount,
  HoldMode,
  DeviceType,
  Prisma,
  PromotionStatus,
  PromotionRewardType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeDeviceCode } from '../devices/device.util';

type QrMeta = { jti: string; iat: number; exp: number } | undefined;

type CustomerContext = {
  customerId: string;
};

type IntegrationBonusParams = {
  merchantId: string;
  customerId: string;
  userToken?: string | null;
  invoiceNum?: string | null;
  total: number;
  paidBonus?: number | null;
  bonusValue?: number | null;
  outletId?: string | null;
  deviceId?: string | null;
  resolvedDeviceId?: string | null;
  staffId?: string | null;
  operationDate?: Date | null;
  requestId?: string | null;
  items?: PositionInput[];
};

type IntegrationBonusResult = {
  receiptId: string;
  orderId: string;
  invoiceNum: string | null;
  redeemApplied: number;
  earnApplied: number;
  balanceBefore: number | null;
  balanceAfter: number;
  alreadyProcessed: boolean;
};

type PositionInput = {
  productId?: string;
  externalId?: string;
  categoryId?: string;
  name?: string;
  qty: number;
  price: number;
  accruePoints?: boolean;
  basePrice?: number;
  allowEarnAndPay?: boolean;
  actions?: string[];
  actionNames?: string[];
  earnMultiplier?: number;
};

type ResolvedPosition = PositionInput & {
  amount: number;
  resolvedProductId?: string | null;
  resolvedCategoryId?: string | null;
  promotionId?: string | null;
  promotionMultiplier: number;
  earnPoints?: number;
  redeemAmount?: number;
  accruePoints: boolean;
  redeemPercent?: number;
};

type ActivePromotionRule = {
  id: string;
  name: string;
  kind: 'POINTS_MULTIPLIER' | 'NTH_FREE' | 'FIXED_PRICE';
  multiplier?: number;
  buyQty?: number;
  freeQty?: number;
  fixedPrice?: number;
  productIds: Set<string>;
  categoryIds: Set<string>;
};

@Injectable()
export class LoyaltyService {
  // Simple wrappers for modules that directly earn/redeem points without QR/holds
  async earn(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    // Ensure entities exist
    await this.ensureCustomerId(customerId);
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: merchantId, initialName: merchantId },
      });
    } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: fresh!.balance + amount },
      });
      const txn = await tx.transaction.create({
        data: { customerId, merchantId, type: TxnType.EARN, amount, orderId },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  private async resolveDeviceContext(
    merchantId: string,
    rawDeviceId?: string | null,
    outletId?: string | null,
  ): Promise<{ id: string; code: string; outletId: string } | null> {
    if (!rawDeviceId) return null;
    const { code, normalized } = normalizeDeviceCode(String(rawDeviceId || ''));
    const device = await this.prisma.device.findFirst({
      where: {
        merchantId,
        codeNormalized: normalized,
        archivedAt: null,
      },
    });
    if (!device) {
      throw new BadRequestException('Устройство не найдено или удалено');
    }
    if (outletId && device.outletId !== outletId) {
      throw new BadRequestException(
        'Устройство привязано к другой торговой точке',
      );
    }
    return { id: device.id, code, outletId: device.outletId };
  }

  private sanitizePositions(raw?: PositionInput[] | null): PositionInput[] {
    if (!Array.isArray(raw)) return [];
    const items: PositionInput[] = [];
    const normalizeStr = (value: any) =>
      typeof value === 'string' && value.trim().length
        ? value.trim()
        : undefined;
    const parseBool = (value: any): boolean | undefined => {
      if (value === true || value === false) return Boolean(value);
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === '1') return true;
        if (v === 'false' || v === '0') return false;
      }
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }
      return undefined;
    };
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const qtyRaw = Number((entry as any).qty ?? 0);
      const priceRaw = Number((entry as any).price ?? 0);
      const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      const price = Number.isFinite(priceRaw) ? priceRaw : 0;
      if (qty <= 0 || price < 0) continue;
      const basePriceRaw =
        (entry as any).basePrice ?? (entry as any).base_price ?? price;
      const basePrice = Number.isFinite(Number(basePriceRaw))
        ? Math.max(0, Number(basePriceRaw))
        : Math.max(0, price);
      const actions = Array.isArray((entry as any).actions)
        ? (entry as any).actions
            .map((v: any) =>
              typeof v === 'string' && v.trim().length ? v.trim() : null,
            )
            .filter((v: string | null): v is string => Boolean(v))
        : undefined;
      const actionNames = Array.isArray((entry as any).actionNames)
        ? (entry as any).actionNames
            .map((v: any) =>
              typeof v === 'string' && v.trim().length ? v.trim() : null,
            )
            .filter((v: string | null): v is string => Boolean(v))
        : Array.isArray((entry as any).action_names)
          ? (entry as any).action_names
              .map((v: any) =>
                typeof v === 'string' && v.trim().length ? v.trim() : null,
              )
              .filter((v: string | null): v is string => Boolean(v))
          : undefined;
      const earnMultiplierRaw =
        (entry as any).earnMultiplier ??
        (entry as any).earn_multiplier ??
        (entry as any).multiplier;
      const earnMultiplier =
        Number.isFinite(Number(earnMultiplierRaw)) &&
        Number(earnMultiplierRaw) > 0
          ? Number(earnMultiplierRaw)
          : undefined;
      items.push({
        productId: normalizeStr((entry as any).productId),
        externalId:
          normalizeStr((entry as any).externalId) ??
          normalizeStr((entry as any).id_product),
        categoryId:
          normalizeStr((entry as any).categoryId) ??
          normalizeStr((entry as any).category_id),
        name: normalizeStr((entry as any).name),
        qty,
        price: Math.max(0, price),
        basePrice,
        accruePoints: parseBool(
          (entry as any).accruePoints ??
            (entry as any).accrue_points ??
            (entry as any).allowAccrue ??
            (entry as any).earn_bonus ??
            (entry as any).eligible,
        ),
        allowEarnAndPay: parseBool(
          (entry as any).allowEarnAndPay ??
            (entry as any).allow_earn_and_pay ??
            (entry as any).allowEarnPay,
        ),
        actions,
        actionNames,
        earnMultiplier,
      });
    }
    return items;
  }

  private async resolvePositions(
    merchantId: string,
    items: PositionInput[],
  ): Promise<ResolvedPosition[]> {
    const normalized = this.sanitizePositions(items);
    if (!normalized.length) return [];

    const normalize = (value?: string | null) => {
      if (value == null) return undefined;
      const v = String(value).trim();
      return v.length ? v : undefined;
    };

    const productIds = Array.from(
      new Set(
        normalized
          .map((i) => normalize(i.productId))
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const externalIds = Array.from(
      new Set(
        normalized
          .map((i) => normalize(i.externalId))
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const categoryIds = Array.from(
      new Set(
        normalized
          .map((i) => normalize(i.categoryId))
          .filter((v): v is string => Boolean(v)),
      ),
    );

    const [productsById, productsByExternalId, categoriesById, multipliers] =
      await Promise.all([
      productIds.length
        ? (this.prisma.product
            .findMany({
              where: { merchantId, id: { in: productIds }, deletedAt: null },
              select: {
                id: true,
                categoryId: true,
                name: true,
                accruePoints: true,
                allowRedeem: true,
                redeemPercent: true,
              },
            })
            .catch(() => []) as any)
        : [],
      externalIds.length
        ? (this.prisma.product
            .findMany({
              where: {
                merchantId,
                deletedAt: null,
                externalId: { in: externalIds },
              },
              select: {
                id: true,
                categoryId: true,
                name: true,
                accruePoints: true,
                allowRedeem: true,
                redeemPercent: true,
                externalId: true,
              },
            })
            .catch(() => []) as any)
        : [],
      categoryIds.length
        ? (this.prisma.productCategory
            .findMany({
              where: {
                merchantId,
                deletedAt: null,
                id: { in: categoryIds },
              },
              select: { id: true },
            })
            .catch(() => []) as any)
        : [],
      this.loadActiveMultipliers(merchantId, new Date()),
    ]);

    const productByIdMap = new Map<
      string,
      {
        id: string;
        categoryId: string | null;
        accruePoints: boolean;
        allowRedeem: boolean;
        redeemPercent: number;
        name: string | null;
      }
    >();
    (productsById as any[]).forEach((p) =>
      productByIdMap.set(p.id, {
        id: p.id,
        categoryId: p.categoryId ?? null,
        accruePoints: p.accruePoints !== false,
        allowRedeem: p.allowRedeem !== false,
        redeemPercent: Number.isFinite(p.redeemPercent)
          ? Number(p.redeemPercent)
          : 100,
        name: p.name ?? null,
      }),
    );
    const productByExtMap = new Map<
      string,
      {
        id: string;
        categoryId: string | null;
        accruePoints: boolean;
        allowRedeem: boolean;
        redeemPercent: number;
        name: string | null;
      }
    >();
    (productsByExternalId as any[]).forEach((p) => {
      const key = p.externalId;
      if (!key) return;
      productByExtMap.set(key, {
        id: p.id,
        categoryId: p.categoryId ?? null,
        accruePoints: p.accruePoints !== false,
        allowRedeem: p.allowRedeem !== false,
        redeemPercent: Number.isFinite(p.redeemPercent)
          ? Number(p.redeemPercent)
          : 100,
        name: p.name ?? null,
      });
    });

    const categoryByIdMap = new Map<string, string>();
    (categoriesById as any[]).forEach((c) => {
      categoryByIdMap.set(c.id, c.id);
    });

    const resolved: ResolvedPosition[] = [];
    for (const item of normalized) {
      const amount = Math.max(
        0,
        Math.round(
          Math.max(0, Number(item.price || 0)) *
            Math.max(0, Number(item.qty || 0)),
        ),
      );
      if (amount <= 0) continue;
      const extKey = normalize(item.externalId);
      const productId =
        (normalize(item.productId) &&
          productByIdMap.get(normalize(item.productId) as string)?.id) ||
        (extKey && productByExtMap.get(extKey)?.id) ||
        null;
      const productInfo: any =
        (productId && productByIdMap.get(productId)) ||
        (extKey ? productByExtMap.get(extKey) : undefined);
      const categoryId =
        (normalize(item.categoryId) &&
          categoryByIdMap.get(normalize(item.categoryId) as string)) ||
        productInfo?.categoryId ||
        null;
      const promo = this.pickMultiplier(multipliers, productId, categoryId);
      const accruePoints =
        item.accruePoints != null
          ? Boolean(item.accruePoints)
          : productInfo?.accruePoints !== false;
      const allowEarnAndPay =
        item.allowEarnAndPay != null
          ? Boolean(item.allowEarnAndPay)
          : productInfo?.allowRedeem !== false;
      const name =
        item.name && item.name.length
          ? item.name
          : productInfo?.name && productInfo.name.length
            ? productInfo.name
            : undefined;
      resolved.push({
        ...item,
        name,
        productId: productId ?? undefined,
        categoryId: categoryId ?? undefined,
        resolvedProductId: productId,
        resolvedCategoryId: categoryId,
        amount,
        promotionId: promo?.id ?? null,
        promotionMultiplier: promo?.multiplier ?? 1,
        earnPoints: 0,
        redeemAmount: 0,
        accruePoints,
        allowEarnAndPay,
        redeemPercent: Number.isFinite(productInfo?.redeemPercent)
          ? Number(productInfo?.redeemPercent)
          : 100,
        price: Math.max(0, item.price),
        basePrice:
          item.basePrice != null && Number.isFinite(item.basePrice)
            ? Math.max(0, Number(item.basePrice))
            : Math.max(0, item.price),
      });
    }
    return resolved;
  }

  private computeEligibleAmountFromPositions(
    positions: ResolvedPosition[],
    fallbackTotal: number,
  ) {
    if (!positions.length) {
      return Math.max(0, Math.floor(Number(fallbackTotal ?? 0)));
    }
    const eligible = positions
      .filter(
        (item) =>
          item.accruePoints !== false &&
          (item.promotionMultiplier == null || item.promotionMultiplier > 0),
      )
      .reduce((sum, item) => sum + Math.max(0, item.amount || 0), 0);
    return Math.max(0, Math.floor(eligible));
  }

  private computeTotalsFromPositions(
    fallbackTotal: number,
    positions: ResolvedPosition[],
  ) {
    const baseTotal = Math.max(0, Math.floor(Number(fallbackTotal ?? 0)));
    if (!positions.length) {
      return { total: baseTotal, eligibleAmount: baseTotal };
    }
    const itemsTotal = positions.reduce(
      (sum, item) => sum + Math.max(0, item.amount || 0),
      0,
    );
    const eligibleAmount = this.computeEligibleAmountFromPositions(
      positions,
      itemsTotal,
    );
    const total = itemsTotal > 0 ? itemsTotal : baseTotal;
    return {
      total,
      eligibleAmount: Math.min(total, eligibleAmount),
    };
  }

  private async loadActivePromotionRules(
    merchantId: string,
    now: Date,
  ): Promise<ActivePromotionRule[]> {
    const promos = await this.prisma.loyaltyPromotion
      .findMany({
        where: {
          merchantId,
          status: PromotionStatus.ACTIVE,
          archivedAt: null,
          OR: [{ startAt: null }, { startAt: { lte: now } }],
          AND: [{ endAt: null }, { endAt: { gte: now } }],
        },
      })
      .catch(() => []);
    const rules: ActivePromotionRule[] = [];
    const pushAll = (value: any, target: Set<string>) => {
      if (!Array.isArray(value)) return;
      value.forEach((v) => {
        if (typeof v === 'string' && v.trim()) target.add(v.trim());
      });
    };
    for (const promo of promos) {
      const meta =
        promo.rewardMetadata && typeof promo.rewardMetadata === 'object'
          ? (promo.rewardMetadata as Record<string, any>)
          : {};
      const productIds = new Set<string>();
      const categoryIds = new Set<string>();
      pushAll(meta.productIds, productIds);
      pushAll(meta.products, productIds);
      pushAll(meta.targets?.products, productIds);
      pushAll(meta.categoryIds, categoryIds);
      pushAll(meta.categories, categoryIds);
      pushAll(meta.targets?.categories, categoryIds);

      const kindRaw = String(meta.kind || meta.type || '').toUpperCase();
      let kind: ActivePromotionRule['kind'] | null = null;
      let multiplier: number | undefined;
      let buyQty: number | undefined;
      let freeQty: number | undefined;
      let fixedPrice: number | undefined;
      const pickMultiplier = () => {
        const raw =
          meta.multiplier ??
          meta.earnMultiplier ??
          meta.pointsMultiplier ??
          meta.rewardMultiplier ??
          promo.rewardValue;
        const num = Number(raw);
        return Number.isFinite(num) && num > 0 ? num : undefined;
      };

      if (
        promo.rewardType === PromotionRewardType.POINTS ||
        kindRaw === 'POINTS' ||
        kindRaw === 'POINTS_MULTIPLIER'
      ) {
        multiplier = pickMultiplier();
        if (multiplier) kind = 'POINTS_MULTIPLIER';
      }

      const buyRaw =
        meta.buyQty ??
        meta.buy ??
        meta.every ??
        meta.step ??
        (meta.nth != null ? Number(meta.nth) - 1 : undefined);
      const freeRaw =
        meta.freeQty ??
        meta.free ??
        meta.getQty ??
        meta.bonusQty ??
        meta.giftQty ??
        1;
      const buyParsed = Number(buyRaw);
      const freeParsed = Number(freeRaw);
      const buy =
        Number.isFinite(buyParsed) && buyParsed > 0
          ? Math.max(1, Math.trunc(buyParsed))
          : null;
      const free =
        Number.isFinite(freeParsed) && freeParsed > 0
          ? Math.max(1, Math.trunc(freeParsed))
          : 1;
      if (
        kind === null &&
        (kindRaw === 'NTH_FREE' ||
          kindRaw === 'EACH_NTH_FREE' ||
          kindRaw === 'STEP' ||
          buy !== null)
      ) {
        kind = 'NTH_FREE';
        buyQty = buy ?? 1;
        freeQty = free;
      }

      const fixedPriceRaw =
        meta.price ??
        meta.fixedPrice ??
        meta.specialPrice ??
        meta.promoPrice ??
        (promo.rewardType === PromotionRewardType.DISCOUNT
          ? promo.rewardValue
          : undefined);
      const fixedParsed = Number(fixedPriceRaw);
      if (
        kind === null &&
        Number.isFinite(fixedParsed) &&
        fixedParsed >= 0 &&
        (kindRaw === 'FIXED_PRICE' ||
          kindRaw === 'SPECIAL_PRICE' ||
          kindRaw === 'PRICE' ||
          promo.rewardType === PromotionRewardType.DISCOUNT ||
          promo.rewardType === PromotionRewardType.CASHBACK ||
          promo.rewardType === PromotionRewardType.CUSTOM)
      ) {
        kind = 'FIXED_PRICE';
        fixedPrice = Math.max(0, fixedParsed);
      }

      if (!kind) continue;
      rules.push({
        id: promo.id,
        name: promo.name,
        kind,
        multiplier,
        buyQty,
        freeQty,
        fixedPrice,
        productIds,
        categoryIds,
      });
    }
    return rules;
  }

  private async loadActiveMultipliers(merchantId: string, now: Date) {
    const promos = await this.prisma.loyaltyPromotion
      .findMany({
        where: {
          merchantId,
          status: PromotionStatus.ACTIVE,
          rewardType: PromotionRewardType.POINTS,
          archivedAt: null,
          OR: [{ startAt: null }, { startAt: { lte: now } }],
          AND: [{ endAt: null }, { endAt: { gte: now } }],
        },
      })
      .catch(() => []);
    return promos.map((promo) => {
      const meta =
        promo.rewardMetadata && typeof promo.rewardMetadata === 'object'
          ? (promo.rewardMetadata as Record<string, any>)
          : {};
      const multiplierRaw =
        meta.multiplier ??
        meta.earnMultiplier ??
        meta.pointsMultiplier ??
        meta.rewardMultiplier ??
        1;
      const multiplier =
        Number.isFinite(Number(multiplierRaw)) && Number(multiplierRaw) > 0
          ? Number(multiplierRaw)
          : 1;
      const productIds = new Set<string>();
      const categoryIds = new Set<string>();
      const pushAll = (value: any, target: Set<string>) => {
        if (!Array.isArray(value)) return;
        value.forEach((v) => {
          if (typeof v === 'string' && v.trim()) target.add(v.trim());
        });
      };
      pushAll(meta.productIds, productIds);
      pushAll(meta.products, productIds);
      pushAll(meta.targets?.products, productIds);
      pushAll(meta.categoryIds, categoryIds);
      pushAll(meta.categories, categoryIds);
      pushAll(meta.targets?.categories, categoryIds);
      return {
        id: promo.id,
        multiplier,
        productIds,
        categoryIds,
      };
    });
  }

  private pickMultiplier(
    promos: Array<{
      id: string;
      multiplier: number;
      productIds: Set<string>;
      categoryIds: Set<string>;
    }>,
    productId?: string | null,
    categoryId?: string | null,
  ) {
    let best: { id: string; multiplier: number } | null = null;
    for (const promo of promos) {
      const matchesProduct =
        productId && promo.productIds.size
          ? promo.productIds.has(productId)
          : false;
      const matchesCategory =
        categoryId && promo.categoryIds.size
          ? promo.categoryIds.has(categoryId)
          : false;
      const appliesAll =
        promo.productIds.size === 0 && promo.categoryIds.size === 0;
      if (matchesProduct || matchesCategory || appliesAll) {
        if (!best || promo.multiplier > best.multiplier) {
          best = { id: promo.id, multiplier: promo.multiplier };
        }
      }
    }
    return best;
  }

  async calculateAction(params: {
    merchantId: string;
    items: PositionInput[];
  }) {
    const resolved = await this.resolvePositions(
      params.merchantId,
      params.items,
    );
    if (!resolved.length) {
      return { positions: [], info: [] as string[] };
    }
    const promotions = await this.loadActivePromotionRules(
      params.merchantId,
      new Date(),
    );
    const infoSet = new Set<string>();
    const priority: Record<ActivePromotionRule['kind'], number> = {
      FIXED_PRICE: 1,
      NTH_FREE: 2,
      POINTS_MULTIPLIER: 3,
    };
    const roundCurrency = (v: number) => Math.round(v * 100) / 100;

    // Используем flatMap для возможности разбиения позиций (NTH_FREE)
    const positions = resolved.flatMap((item) => {
      const applicable = promotions
        .filter((promo) => {
          const matchesProduct =
            item.resolvedProductId && promo.productIds.size
              ? promo.productIds.has(item.resolvedProductId)
              : false;
          const matchesCategory =
            item.resolvedCategoryId && promo.categoryIds.size
              ? promo.categoryIds.has(item.resolvedCategoryId)
              : false;
          const appliesAll =
            promo.productIds.size === 0 && promo.categoryIds.size === 0;
          return matchesProduct || matchesCategory || appliesAll;
        })
        .sort((a, b) => (priority[a.kind] ?? 10) - (priority[b.kind] ?? 10));
      const appliedIds: string[] = [];
      const appliedNames: string[] = [];
      let unitPrice = Math.max(0, item.price);
      const basePrice =
        item.basePrice != null && Number.isFinite(item.basePrice)
          ? Math.max(0, Number(item.basePrice))
          : unitPrice;
      let earnMultiplier =
        item.promotionMultiplier && item.promotionMultiplier > 0
          ? item.promotionMultiplier
          : 1;

      // Для NTH_FREE: кол-во бесплатных единиц
      let freebies = 0;
      let nthFreePromoApplied = false;

      for (const promo of applicable) {
        if (appliedIds.includes(promo.id)) continue;
        appliedIds.push(promo.id);
        appliedNames.push(promo.name);
        if (promo.kind === 'POINTS_MULTIPLIER') {
          if (promo.multiplier && promo.multiplier > earnMultiplier) {
            earnMultiplier = promo.multiplier;
          }
          infoSet.add(
            `${promo.name}: множитель начисления x${promo.multiplier ?? 1}`,
          );
          continue;
        }
        if (promo.kind === 'NTH_FREE') {
          const step = Math.max(
            1,
            Math.trunc((promo.buyQty ?? 1) + (promo.freeQty ?? 0)),
          );
          const freeCount =
            step > 0
              ? Math.floor(item.qty / step) * Math.max(1, promo.freeQty ?? 1)
              : 0;
          if (freeCount > 0) {
            freebies = Math.min(freeCount, item.qty);
            nthFreePromoApplied = true;
            infoSet.add(`${promo.name}: ${freebies} шт. бесплатно`);
          }
          continue;
        }
        if (promo.kind === 'FIXED_PRICE') {
          const fixed = Math.max(
            0,
            Math.min(Number.MAX_SAFE_INTEGER, promo.fixedPrice ?? unitPrice),
          );
          unitPrice = fixed;
          infoSet.add(
            `${promo.name}: цена ${roundCurrency(fixed)} вместо ${roundCurrency(basePrice)}`,
          );
        }
      }

      const idProduct =
        item.externalId ?? item.productId ?? item.resolvedProductId ?? null;
      const allowEarnAndPay =
        item.allowEarnAndPay != null ? Boolean(item.allowEarnAndPay) : true;

      // Если есть бесплатные позиции — разбиваем на две записи (как GMB)
      if (nthFreePromoApplied && freebies > 0 && freebies < item.qty) {
        const paidQty = item.qty - freebies;
        const result: any[] = [];
        // Бесплатная позиция
        result.push({
          id_product: idProduct,
          name: item.name ?? null,
          qty: freebies,
          price: 0,
          base_price: basePrice,
          actions: appliedIds,
          action_names: appliedNames,
          earn_multiplier: earnMultiplier > 0 ? earnMultiplier : 1,
          allow_earn_and_pay: allowEarnAndPay,
        });
        // Платная позиция
        result.push({
          id_product: idProduct,
          name: item.name ?? null,
          qty: paidQty,
          price: unitPrice,
          base_price: basePrice,
          actions: [],
          action_names: [],
          earn_multiplier: earnMultiplier > 0 ? earnMultiplier : 1,
          allow_earn_and_pay: allowEarnAndPay,
        });
        return result;
      }

      // Если все бесплатные (qty == freebies)
      if (nthFreePromoApplied && freebies >= item.qty) {
        return [
          {
            id_product: idProduct,
            name: item.name ?? null,
            qty: item.qty,
            price: 0,
            base_price: basePrice,
            actions: appliedIds,
            action_names: appliedNames,
            earn_multiplier: earnMultiplier > 0 ? earnMultiplier : 1,
            allow_earn_and_pay: allowEarnAndPay,
          },
        ];
      }

      // Стандартный случай — без разбиения
      return [
        {
          id_product: idProduct,
          name: item.name ?? null,
          qty: item.qty,
          price: unitPrice,
          base_price: basePrice,
          actions: appliedIds,
          action_names: appliedNames,
          earn_multiplier: earnMultiplier > 0 ? earnMultiplier : 1,
          allow_earn_and_pay: allowEarnAndPay,
        },
      ];
    });
    return { positions, info: Array.from(infoSet) };
  }

  private allocateProRata(amounts: number[], target: number): number[] {
    const normalizedTarget = Math.max(0, Math.floor(Number(target) || 0));
    const total = amounts.reduce(
      (sum, v) => sum + Math.max(0, Math.floor(v)),
      0,
    );
    if (total <= 0 || normalizedTarget <= 0) return amounts.map(() => 0);
    const targetClamped = Math.min(normalizedTarget, total);
    const shares = amounts.map((amount) =>
      Math.floor((Math.max(0, Math.floor(amount)) * targetClamped) / total),
    );
    let distributed = shares.reduce((sum, v) => sum + v, 0);
    let idx = 0;
    while (distributed < targetClamped && idx < shares.length) {
      const canAdd = Math.max(0, Math.floor(amounts[idx])) > 0;
      if (canAdd) {
        shares[idx] += 1;
        distributed += 1;
      }
      idx = (idx + 1) % shares.length;
    }
    return shares;
  }

  private allocateByWeight(weights: number[], total: number) {
    const sanitizedWeights = weights.map((w) =>
      Math.max(0, Math.floor(Number.isFinite(w) ? w : 0)),
    );
    const sum = sanitizedWeights.reduce((acc, v) => acc + v, 0);
    if (sum <= 0 || total <= 0) return sanitizedWeights.map(() => 0);
    const target = Math.max(0, Math.floor(total));
    const shares = sanitizedWeights.map((w) => Math.floor((w * target) / sum));
    let distributed = shares.reduce((acc, v) => acc + v, 0);
    let idx = 0;
    while (distributed < target && idx < shares.length) {
      if (sanitizedWeights[idx] > 0) {
        shares[idx] += 1;
        distributed += 1;
      }
      idx = (idx + 1) % shares.length;
    }
    return shares;
  }

  private normalizePercent(value: unknown, fallback = 100) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(100, Math.max(0, Math.round(num)));
  }

  private computeRedeemCaps(items: ResolvedPosition[]) {
    return items.map((item) => {
      if (item.allowEarnAndPay === false) return 0;
      const amount = Math.max(0, Math.floor(Number(item.amount || 0)));
      if (amount <= 0) return 0;
      const percent = this.normalizePercent(item.redeemPercent, 100);
      return Math.floor((amount * percent) / 100);
    });
  }

  private allocateProRataWithCaps(
    weights: number[],
    caps: number[],
    total: number,
  ) {
    const length = Math.min(weights.length, caps.length);
    if (length <= 0) return [];
    const shares = new Array<number>(length).fill(0);
    const remainingCaps = caps
      .slice(0, length)
      .map((cap) => Math.max(0, Math.floor(Number(cap) || 0)));
    let remaining = Math.max(0, Math.floor(Number(total) || 0));
    if (!remaining) return shares;
    const active = new Set<number>();
    for (let i = 0; i < length; i += 1) {
      const weight = Math.max(0, Math.floor(Number(weights[i]) || 0));
      if (weight > 0 && remainingCaps[i] > 0) active.add(i);
    }
    while (remaining > 0 && active.size > 0) {
      const activeIndices = Array.from(active);
      const activeWeights = activeIndices.map((idx) =>
        Math.max(0, Math.floor(Number(weights[idx]) || 0)),
      );
      const sumWeights = activeWeights.reduce((acc, v) => acc + v, 0);
      if (sumWeights <= 0) break;
      const provisional = this.allocateProRata(activeWeights, remaining);
      let capped = false;
      activeIndices.forEach((idx, pos) => {
        const cap = remainingCaps[idx];
        if (cap <= 0) {
          active.delete(idx);
          return;
        }
        const desired = provisional[pos] ?? 0;
        const applied = Math.min(desired, cap);
        if (desired > cap) capped = true;
        shares[idx] += applied;
        remainingCaps[idx] -= applied;
        remaining -= applied;
        if (remainingCaps[idx] <= 0) active.delete(idx);
      });
      if (!capped) break;
    }
    return shares;
  }

  private applyEarnAndRedeemToItems(
    items: ResolvedPosition[],
    earnBps: number,
    discountToApply: number,
  ) {
    if (!items.length) return 0;
    const amounts = items.map((i) => Math.max(0, i.amount || 0));
    const caps = this.computeRedeemCaps(items);
    const capsTotal = caps.reduce((sum, cap) => sum + cap, 0);
    const redeemTarget = Math.min(
      Math.max(0, Math.floor(Number(discountToApply) || 0)),
      capsTotal,
    );
    const shares = this.allocateProRataWithCaps(amounts, caps, redeemTarget);
    let totalEarn = 0;
    items.forEach((item, idx) => {
      const redeemShare = shares[idx] ?? 0;
      item.redeemAmount = redeemShare;
      const earnBase =
        item.accruePoints === false
          ? 0
          : Math.max(0, item.amount - redeemShare);
      const basePoints = Math.floor((earnBase * earnBps) / 10000);
      const multiplier =
        item.promotionMultiplier && item.promotionMultiplier > 0
          ? item.promotionMultiplier
          : 1;
      const itemEarn = Math.floor(basePoints * multiplier);
      item.earnPoints = itemEarn;
      totalEarn += itemEarn;
    });
    return totalEarn;
  }

  private async upsertHoldItems(
    tx: Prisma.TransactionClient,
    holdId: string,
    merchantId: string,
    items: ResolvedPosition[],
  ) {
    await tx.holdItem.deleteMany({ where: { holdId } });
    if (!items.length) return;
    const now = new Date();
    await tx.holdItem.createMany({
      data: items.map((item) => ({
        holdId,
        merchantId,
        productId: item.resolvedProductId ?? null,
        categoryId: item.resolvedCategoryId ?? null,
        externalProvider: null,
        externalId: item.externalId ?? null,
        name: item.name ?? null,
        sku: null,
        barcode: null,
        qty: new Prisma.Decimal(item.qty),
        price: new Prisma.Decimal(item.price),
        amount: item.amount,
        earnPoints:
          item.earnPoints != null && Number.isFinite(item.earnPoints)
            ? Math.floor(Number(item.earnPoints))
            : null,
        redeemAmount:
          item.redeemAmount != null && Number.isFinite(item.redeemAmount)
            ? Math.floor(Number(item.redeemAmount))
            : null,
        promotionId: item.promotionId ?? null,
        promotionMultiplier:
          item.promotionMultiplier && item.promotionMultiplier > 0
            ? Math.round(item.promotionMultiplier * 10000)
            : null,
        metadata: Prisma.JsonNull,
        createdAt: now,
      })),
    });
  }

  // ===== Referral rewards awarding =====
  private async applyReferralRewards(
    tx: any,
    ctx: {
      merchantId: string;
      buyerId: string;
      purchaseAmount: number;
      receiptId: string;
      orderId: string;
      outletId: string | null;
      staffId: string | null;
      deviceId: string | null;
    },
  ) {
    // Активная программа рефералов
    const program = await tx.referralProgram.findFirst({
      where: { merchantId: ctx.merchantId, status: 'ACTIVE', isActive: true },
    });
    if (!program) return;

    const minPurchase = Number(program.minPurchaseAmount || 0) || 0;
    if (ctx.purchaseAmount < minPurchase) return;

    // Находим прямую связь реферала (уровень 1)
    const direct = await tx.referral.findFirst({
      where: { refereeId: ctx.buyerId, programId: program.id },
    });
    if (!direct) return; // покупатель не является приглашённым по активной программе

    const triggerAll =
      String(program.rewardTrigger || 'first').toLowerCase() === 'all';
    const canFirstPayout = direct.status === 'ACTIVATED';
    if (!triggerAll && !canFirstPayout) {
      // Режим только «за первую покупку» уже отработал
      return;
    }

    // Конфигурация уровней
    const rewardType = String(program.rewardType || 'FIXED').toUpperCase();
    const lvCfgArr = Array.isArray(program.levelRewards)
      ? (program.levelRewards as Array<any>)
      : [];

    const getLevelCfg = (lvl: number) =>
      lvCfgArr.find((x) => Number(x?.level) === lvl) || null;

    const enabledForLevel = (lvl: number) => {
      if (lvl === 1) return true; // всегда включаем L1
      if (!program.multiLevel) return false;
      const cfg = getLevelCfg(lvl);
      return cfg ? Boolean(cfg.enabled) : false;
    };

    const rewardValueForLevel = (lvl: number) => {
      const cfg = getLevelCfg(lvl);
      if (cfg && Number.isFinite(Number(cfg.reward))) return Number(cfg.reward);
      if (lvl === 1 && Number.isFinite(Number(program.referrerReward)))
        return Number(program.referrerReward);
      return 0;
    };

    // Обходим цепочку пригласителей вверх по программе
    let current = direct;
    let level = 1;
    const maxLevels = program.multiLevel
      ? Math.max(
          1,
          lvCfgArr.reduce((m, x) => Math.max(m, Number(x?.level || 0) || 0), 1),
        )
      : 1;

    while (level <= maxLevels && current) {
      if (enabledForLevel(level)) {
        const rv = rewardValueForLevel(level);
        let points = 0;
        if (rewardType === 'PERCENT') {
          points = Math.floor((ctx.purchaseAmount * Math.max(0, rv)) / 100);
        } else {
          points = Math.max(0, Math.floor(rv));
        }
        if (points > 0) {
          // Начисляем пригласителю
          let w = await tx.wallet.findFirst({
            where: {
              customerId: current.referrerId,
              merchantId: ctx.merchantId,
              type: WalletType.POINTS,
            },
          });
          if (!w)
            w = await tx.wallet.create({
              data: {
                customerId: current.referrerId,
                merchantId: ctx.merchantId,
                type: WalletType.POINTS,
                balance: 0,
              },
            });
          const fresh = await tx.wallet.findUnique({ where: { id: w.id } });
          await tx.wallet.update({
            where: { id: w.id },
            data: { balance: (fresh?.balance ?? 0) + points },
          });
          const rewardTx = await tx.transaction.create({
            data: {
              customerId: current.referrerId,
              merchantId: ctx.merchantId,
              type: TxnType.REFERRAL,
              amount: points,
              orderId: `referral_reward_${ctx.receiptId}_L${level}`,
              outletId: ctx.outletId,
              staffId: ctx.staffId,
              deviceId: ctx.deviceId ?? null,
              metadata: {
                source: 'REFERRAL_BONUS',
                referralLevel: level,
                receiptId: ctx.receiptId,
                buyerId: ctx.buyerId,
              } as Prisma.JsonObject,
            },
          });
          if (process.env.LEDGER_FEATURE === '1') {
            await tx.ledgerEntry.create({
              data: {
                merchantId: ctx.merchantId,
                customerId: current.referrerId,
                debit: LedgerAccount.MERCHANT_LIABILITY,
                credit: LedgerAccount.CUSTOMER_BALANCE,
                amount: points,
                orderId: ctx.orderId,
                outletId: ctx.outletId ?? null,
                staffId: ctx.staffId ?? null,
                deviceId: ctx.deviceId ?? null,
                meta: { mode: 'REFERRAL', level },
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'earn',
            });
            this.metrics.inc(
              'loyalty_ledger_amount_total',
              { type: 'earn' },
              points,
            );
          }
        }
      }

      // Следующий уровень (пригласитель текущего пригласителя)
      if (!program.multiLevel) break;
      const parent = await tx.referral.findFirst({
        where: { refereeId: current.referrerId, programId: program.id },
      });
      current = parent;
      level += 1;
    }

    // Для триггера «первая покупка» помечаем связь завершённой
    if (!triggerAll && direct.status === 'ACTIVATED') {
      await tx.referral.update({
        where: { id: direct.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          purchaseAmount: ctx.purchaseAmount,
        },
      });
    }
  }

  private async rollbackReferralRewards(
    tx: any,
    params: {
      merchantId: string;
      receipt: {
        id: string;
        orderId: string;
        customerId: string;
        outletId: string | null;
        staffId: string | null;
      };
    },
  ) {
    const prefix = `referral_reward_${params.receipt.id}`;
    let rewards = await tx.transaction.findMany({
      where: {
        merchantId: params.merchantId,
        type: TxnType.REFERRAL,
        orderId: { startsWith: prefix },
        canceledAt: null,
      },
    });

    const programInfo = await tx.referralProgram.findFirst({
      where: { merchantId: params.merchantId },
      orderBy: { createdAt: 'desc' },
      select: { rewardTrigger: true, minPurchaseAmount: true },
    });

    let skipRollback = false;
    if (programInfo && programInfo.rewardTrigger !== 'all') {
      const minPurchaseAmount = Math.max(
        0,
        Math.round(Number(programInfo.minPurchaseAmount ?? 0)),
      );
      const otherValidPurchases = await tx.$queryRaw(
        Prisma.sql`
        SELECT 1
        FROM "Receipt" r
        WHERE r."merchantId" = ${params.merchantId}
          AND r."customerId" = ${params.receipt.customerId}
          AND r."id" <> ${params.receipt.id}
          AND r."canceledAt" IS NULL
          AND r."total" > 0
          AND r."total" >= ${minPurchaseAmount}
          AND NOT EXISTS (
            SELECT 1
            FROM "Transaction" refund
            WHERE refund."merchantId" = r."merchantId"
              AND refund."orderId" = r."orderId"
              AND refund."type" = 'REFUND'
              AND refund."canceledAt" IS NULL
          )
        LIMIT 1`,
      );
      if (
        Array.isArray(otherValidPurchases) &&
        otherValidPurchases.length > 0
      ) {
        skipRollback = true;
      }
    }

    if (!rewards.length && !skipRollback) {
      rewards = await this.loadReferralRewardsForCustomer(
        tx,
        params.merchantId,
        params.receipt.customerId,
      );
    }

    if (!rewards.length || skipRollback) {
      return;
    }

    for (const reward of rewards) {
      const amount = Math.abs(Number(reward.amount ?? 0));
      if (!amount) continue;
      const rollbackOrderId =
        typeof reward.orderId === 'string' && reward.orderId.length
          ? reward.orderId.replace('referral_reward_', 'referral_rollback_')
          : `referral_rollback_${reward.id}`;
      const existingRollback = await tx.transaction.findFirst({
        where: { merchantId: params.merchantId, orderId: rollbackOrderId },
      });
      if (existingRollback) continue;

      const wallet = await tx.wallet.findFirst({
        where: {
          merchantId: params.merchantId,
          customerId: reward.customerId,
          type: WalletType.POINTS,
        },
      });
      if (!wallet) continue;
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: (fresh?.balance ?? 0) - amount },
      });
      const rewardMeta: any = reward?.metadata;
      let rollbackBuyerId: string | null = null;
      if (
        rewardMeta &&
        typeof rewardMeta === 'object' &&
        !Array.isArray(rewardMeta)
      ) {
        const rawBuyerId = rewardMeta.buyerId;
        if (
          rawBuyerId !== undefined &&
          rawBuyerId !== null &&
          String(rawBuyerId).trim() !== ''
        ) {
          rollbackBuyerId = String(rawBuyerId).trim();
        }
      }
      const rollbackTx = await tx.transaction.create({
        data: {
          customerId: reward.customerId,
          merchantId: params.merchantId,
          type: TxnType.REFERRAL,
          amount: -amount,
          orderId: rollbackOrderId,
          outletId: reward.outletId ?? params.receipt.outletId ?? null,
          staffId: reward.staffId ?? params.receipt.staffId ?? null,
          metadata: {
            source: 'REFERRAL_ROLLBACK',
            originalOrderId: reward.orderId ?? null,
            originalTransactionId: reward.id,
            receiptId: params.receipt.id,
            buyerId: rollbackBuyerId,
          } as Prisma.JsonObject,
        },
      });
      if (process.env.LEDGER_FEATURE === '1') {
        await tx.ledgerEntry.create({
          data: {
            merchantId: params.merchantId,
            customerId: reward.customerId,
            debit: LedgerAccount.CUSTOMER_BALANCE,
            credit: LedgerAccount.MERCHANT_LIABILITY,
            amount,
            orderId: params.receipt.orderId,
            outletId: reward.outletId ?? params.receipt.outletId ?? null,
            staffId: reward.staffId ?? params.receipt.staffId ?? null,
            meta: { mode: 'REFERRAL', kind: 'rollback' },
          },
        });
        this.metrics.inc('loyalty_ledger_entries_total', {
          type: 'referral_rollback',
        });
        this.metrics.inc(
          'loyalty_ledger_amount_total',
          { type: 'referral_rollback' },
          amount,
        );
      }
    }

    await this.reopenReferralAfterRefund(
      tx,
      params.merchantId,
      params.receipt.customerId,
    );
  }

  private async loadReferralRewardsForCustomer(
    tx: any,
    merchantId: string,
    customerId: string,
  ) {
    const receipts = await tx.receipt.findMany({
      where: { merchantId, customerId },
      select: { id: true },
    });
    if (!receipts.length) return [];
    const orderIds: string[] = [];
    for (const receipt of receipts) {
      for (let level = 1; level <= 5; level += 1) {
        orderIds.push(`referral_reward_${receipt.id}_L${level}`);
      }
    }
    if (!orderIds.length) return [];
    return tx.transaction.findMany({
      where: {
        merchantId,
        type: TxnType.REFERRAL,
        orderId: { in: orderIds },
        canceledAt: null,
      },
    });
  }

  private async reopenReferralAfterRefund(
    tx: any,
    merchantId: string,
    customerId: string,
  ) {
    const referral = await tx.referral.findFirst({
      where: {
        refereeId: customerId,
        status: 'COMPLETED',
        program: { merchantId },
      },
      include: { program: true },
      orderBy: { completedAt: 'desc' },
    });
    if (!referral) return;
    const trigger = String(
      referral.program?.rewardTrigger || 'first',
    ).toLowerCase();
    if (trigger === 'all') {
      return;
    }
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: 'ACTIVATED',
        completedAt: null,
        purchaseAmount: null,
      },
    });
  }

  async grantRegistrationBonus(params: {
    merchantId?: string;
    customerId?: string;
    outletId?: string | null;
    staffId?: string | null;
  }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const outletId =
      typeof params?.outletId === 'string' && params.outletId.trim()
        ? params.outletId.trim()
        : null;
    const staffId =
      typeof params?.staffId === 'string' && params.staffId.trim()
        ? params.staffId.trim()
        : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');

    // Read registration mechanic from settings
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules =
      settings?.rulesJson && typeof settings.rulesJson === 'object'
        ? (settings.rulesJson as any)
        : null;
    const reg =
      rules && typeof rules.registration === 'object'
        ? rules.registration
        : null;
    const enabled =
      reg && Object.prototype.hasOwnProperty.call(reg, 'enabled')
        ? Boolean(reg.enabled)
        : true;
    const pointsRaw = reg && reg.points != null ? Number(reg.points) : 0;
    const points = Number.isFinite(pointsRaw)
      ? Math.max(0, Math.floor(pointsRaw))
      : 0;
    const ttlDaysRaw =
      reg && reg.ttlDays != null
        ? Number(reg.ttlDays)
        : (settings?.pointsTtlDays ?? null);
    const ttlDays =
      Number.isFinite(ttlDaysRaw as any) &&
      (ttlDaysRaw as any) != null &&
      (ttlDaysRaw as any) > 0
        ? Math.floor(Number(ttlDaysRaw))
        : null;
    const delayDaysRaw =
      reg && reg.delayDays != null
        ? Number(reg.delayDays)
        : (settings?.earnDelayDays ?? 0);
    const delayHoursRaw =
      reg && reg.delayHours != null ? Number(reg.delayHours) : null;
    const delayMs =
      Number.isFinite(delayHoursRaw as any) &&
      delayHoursRaw != null &&
      (delayHoursRaw as any) > 0
        ? Math.floor(Number(delayHoursRaw)) * 60 * 60 * 1000
        : Number.isFinite(delayDaysRaw) &&
            delayDaysRaw != null &&
            delayDaysRaw > 0
          ? Math.floor(Number(delayDaysRaw)) * 24 * 60 * 60 * 1000
          : 0;

    // Если клиент приглашён по рефералу и у активной программы выключено суммирование с регистрацией — запрещаем выдачу
    try {
      const ref = await this.prisma.referral.findFirst({
        where: {
          refereeId: customerId,
          program: { merchantId, status: 'ACTIVE', isActive: true },
        },
        include: { program: true },
      });
      if (ref?.program && ref.program.stackWithRegistration === false) {
        throw new BadRequestException(
          'Регистрационный бонус не суммируется с реферальным для приглашённых клиентов',
        );
      }
    } catch {}

    if (!enabled || points <= 0) {
      throw new BadRequestException(
        'registration bonus disabled or zero points',
      );
    }

    // Idempotency: if already issued, return existing state
    const existingTxn = await this.prisma.transaction.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    const existingLot = await this.prisma.earnLot.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    if (existingTxn || existingLot) {
      const walletEx = await this.prisma.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      return {
        ok: true,
        alreadyGranted: true,
        pointsIssued: 0,
        pending: !!(existingLot && existingLot.status === 'PENDING'),
        maturesAt: existingLot?.maturesAt
          ? existingLot.maturesAt.toISOString()
          : null,
        pointsExpireInDays: ttlDays,
        pointsExpireAt: existingLot?.expiresAt
          ? existingLot.expiresAt.toISOString()
          : null,
        balance: walletEx?.balance ?? 0,
      } as const;
    }

    await this.ensureCustomerId(customerId);

    return this.prisma.$transaction(async (tx) => {
      // Ensure wallet
      let wallet = await tx.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      if (!wallet)
        wallet = await tx.wallet.create({
          data: { merchantId, customerId, type: WalletType.POINTS, balance: 0 },
        });

      const now = new Date();
      const lotsEnabled = process.env.EARN_LOTS_FEATURE === '1';

      if (delayMs > 0 && lotsEnabled) {
        // Create pending lot
        const maturesAt = new Date(now.getTime() + delayMs);
        const expiresAt = ttlDays
          ? new Date(maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000)
          : null;
        const earnLot = (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
        if (!earnLot?.create)
          throw new BadRequestException('earn lots not available');
        await earnLot.create({
          data: {
            merchantId,
            customerId,
            points,
            consumedPoints: 0,
            earnedAt: maturesAt,
            maturesAt,
            expiresAt,
            orderId: 'registration_bonus',
            receiptId: null,
            outletId,
            staffId,
            status: 'PENDING',
          },
        });

        await tx.eventOutbox.create({
          data: {
            merchantId,
            eventType: 'loyalty.registration.scheduled',
            payload: {
              merchantId,
              customerId,
              points,
              maturesAt: maturesAt.toISOString(),
              outletId: outletId ?? null,
              staffId: staffId ?? null,
            },
          },
        });

        return {
          ok: true,
          pointsIssued: points,
          pending: true,
          maturesAt: maturesAt.toISOString(),
          pointsExpireInDays: ttlDays,
          pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
          balance: (await tx.wallet.findUnique({ where: { id: wallet.id } }))!
            .balance,
        } as const;
      } else {
        // Immediate award
        const freshW = await tx.wallet.findUnique({ where: { id: wallet.id } });
        const balance = (freshW?.balance ?? 0) + points;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });

        const earnTx = await tx.transaction.create({
          data: {
            merchantId,
            customerId,
            type: TxnType.EARN,
            amount: points,
            orderId: 'registration_bonus',
            outletId,
            staffId,
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
              orderId: 'registration_bonus',
              outletId,
              staffId,
              meta: { mode: 'REGISTRATION' },
            },
          });
          this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
          this.metrics.inc(
            'loyalty_ledger_amount_total',
            { type: 'earn' },
            points,
          );
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
                earnedAt: now,
                maturesAt: null,
                expiresAt: ttlDays
                  ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
                  : null,
                orderId: 'registration_bonus',
                receiptId: null,
                outletId,
                staffId,
                status: 'ACTIVE',
              },
            });
          }
        }

        await tx.eventOutbox.create({
          data: {
            merchantId,
            eventType: 'loyalty.registration.awarded',
            payload: {
              merchantId,
              customerId,
              points,
              outletId: outletId ?? null,
              staffId: staffId ?? null,
            },
          },
        });

        return {
          ok: true,
          pointsIssued: points,
          pending: false,
          maturesAt: null,
          pointsExpireInDays: ttlDays,
          pointsExpireAt: ttlDays
            ? new Date(
                now.getTime() + ttlDays * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null,
          balance,
        } as const;
      }
    });
  }

  async redeem(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    await this.ensureCustomerId(customerId);
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: merchantId, initialName: merchantId },
      });
    } catch {}

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if (fresh!.balance < amount)
        throw new BadRequestException('Insufficient points');
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: fresh!.balance - amount },
      });
      const txn = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.REDEEM,
          amount: -amount,
          orderId,
        },
      });
      return { ok: true, transactionId: txn.id };
    });
  }

  async applyPromoCode(params: {
    merchantId?: string;
    customerId?: string;
    code?: string;
  }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const code = String(params?.code || '').trim();
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!code) throw new BadRequestException('code required');

    await this.ensureCustomerId(customerId);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new BadRequestException('merchant not found');

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findFirst({
        where: { customerId, merchantId, type: WalletType.POINTS },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
        });
      }

      // Если старое назначение уровня истекло, пересчитываем актуальный уровень по сумме покупок
      await this.refreshTierAssignmentIfExpired(tx, merchantId, customerId);

      const promo = await this.promoCodes.requireActiveByCode(merchantId, code);

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
      const expiresAt = promoExpireDays
        ? new Date(Date.now() + promoExpireDays * 24 * 60 * 60 * 1000)
        : null;

      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const currentBalance = fresh?.balance ?? 0;
      let balance = currentBalance;
      if (points > 0) {
        balance = currentBalance + points;
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance } });
      }

      const promoTx = await tx.transaction.create({
        data: {
          customerId,
          merchantId,
          type: TxnType.EARN,
          amount: points,
          orderId: null,
          outletId: null,
          staffId: null,
          metadata: {
            source: 'PROMOCODE',
            promoCodeId: result.promoCode.id,
            code: result.promoCode.code ?? null,
          } as any,
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
        this.metrics.inc(
          'loyalty_ledger_amount_total',
          { type: 'earn' },
          points,
        );
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

      const tierName = result.assignedTier?.name ?? null;
      let message: string;
      if (points > 0 && tierName) {
        message = `Вы получили ${points} баллов и "${tierName}" уровень!`;
      } else if (points > 0) {
        message = `Вы получили ${points} баллов!`;
      } else if (tierName) {
        message = `Вы получили "${tierName}" уровень!`;
      } else {
        message = 'Промокод активирован';
      }

      return {
        ok: true,
        promoCodeId: result.promoCode.id,
        code: result.promoCode.code,
        pointsIssued: points,
        pointsExpireInDays: promoExpireDays,
        pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
        balance,
        tierAssigned:
          result.assignedTier?.id ?? result.promoCode.assignTierId ?? null,
        tierAssignedName: result.assignedTier?.name ?? null,
        message: message || 'Промокод активирован',
      };
    });
  }
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private promoCodes: PromoCodesService,
    private staffNotifications: TelegramStaffNotificationsService,
    private staffMotivation: StaffMotivationEngine,
  ) {}

  // ===== Earn Lots helpers (optional feature) =====
  private async consumeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return; // в тестовых моках может отсутствовать
    const lots = await earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'asc' },
    });
    const updates = require('./lots.util').planConsume(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
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

  private async unconsumeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({
      where: { merchantId, customerId, consumedPoints: { gt: 0 } },
      orderBy: { earnedAt: 'desc' },
    });
    const updates = require('./lots.util').planUnconsume(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
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

  private async revokeLots(
    tx: any,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null },
  ) {
    const earnLot = tx?.earnLot ?? (this.prisma as any)?.earnLot;
    if (!earnLot?.findMany || !earnLot?.update) return;
    const lots = await earnLot.findMany({
      where: { merchantId, customerId },
      orderBy: { earnedAt: 'desc' },
    });
    const updates = require('./lots.util').planRevoke(
      lots.map((l: any) => ({
        id: l.id,
        points: l.points,
        consumedPoints: l.consumedPoints || 0,
        earnedAt: l.earnedAt,
      })),
      amount,
    );
    for (const up of updates) {
      const lot = lots.find((l: any) => l.id === up.id)!;
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

  // ====== Кеш правил ======
  private rulesCache = new Map<
    string,
    {
      updatedAt: string;
      baseEarnBps: number;
      baseRedeemLimitBps: number;
      fn: (args: {
        channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
        weekday: number;
        eligibleAmount: number;
      }) => { earnBps: number; redeemLimitBps: number };
    }
  >();

  private compileRules(
    merchantId: string,
    outletId: string | null,
    base: { earnBps: number; redeemLimitBps: number },
    rulesJson: any,
    updatedAt: Date | null | undefined,
  ) {
    const key = `${merchantId}:${outletId ?? '-'}`;
    const stamp = updatedAt ? updatedAt.toISOString() : '0';
    const cached = this.rulesCache.get(key);
    if (
      cached &&
      cached.updatedAt === stamp &&
      cached.baseEarnBps === base.earnBps &&
      cached.baseRedeemLimitBps === base.redeemLimitBps
    )
      return cached.fn;
    let fn = (args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      eligibleAmount: number;
    }) => ({ earnBps: base.earnBps, redeemLimitBps: base.redeemLimitBps });
    // Support both array root and object with { rules: [...] }
    const rulesArr: any[] | null = Array.isArray(rulesJson)
      ? rulesJson
      : rulesJson && Array.isArray(rulesJson.rules)
        ? rulesJson.rules
        : null;
    if (Array.isArray(rulesArr)) {
      const rules = rulesArr;
      fn = (args) => {
        let earnBps = base.earnBps;
        let redeemLimitBps = base.redeemLimitBps;
        const wd = args.weekday;
        for (const item of rules) {
          try {
            if (!item || typeof item !== 'object' || Array.isArray(item))
              continue;
            const cond = item.if ?? {};
            if (
              Array.isArray(cond.channelIn) &&
              !cond.channelIn.includes(args.channel)
            )
              continue;
            if (
              cond.minEligible != null &&
              args.eligibleAmount < Number(cond.minEligible)
            )
              continue;
            const then = item.then ?? {};
            if (then.earnBps != null) earnBps = Number(then.earnBps);
            if (then.redeemLimitBps != null)
              redeemLimitBps = Number(then.redeemLimitBps);
          } catch {}
        }
        return { earnBps, redeemLimitBps };
      };
    }
    this.rulesCache.set(key, {
      updatedAt: stamp,
      baseEarnBps: base.earnBps,
      baseRedeemLimitBps: base.redeemLimitBps,
      fn,
    });
    return fn;
  }

  private sanitizeManualAmount(value?: number | null): number | null {
    if (value == null) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.floor(num));
  }

  private normalizePhoneOptional(phone?: string | null): string | null {
    if (phone == null) return null;
    const raw = String(phone).trim();
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10 && !digits.startsWith('7')) {
      digits = `7${digits}`;
    }
    if (digits.length !== 11) {
      throw new BadRequestException('invalid phone');
    }
    return `+${digits}`;
  }

  private async ensurePointsWallet(merchantId: string, customerId: string) {
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

  private async checkManualIntegrationCaps(params: {
    merchantId: string;
    customerId: string;
    redeemAmount: number;
    earnAmount: number;
    operationDate?: Date | null;
  }) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId: params.merchantId },
    });
    const ts = (params.operationDate ?? new Date()).getTime();
    const since = new Date(ts - 24 * 60 * 60 * 1000);
    const until = new Date(ts);
    const redeemCap = settings?.redeemDailyCap ?? null;
    const earnCap = settings?.earnDailyCap ?? null;
    if (redeemCap && redeemCap > 0 && params.redeemAmount > 0) {
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: TxnType.REDEEM,
          createdAt: { gte: since, lte: until },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
      const left = Math.max(0, redeemCap - used);
      if (params.redeemAmount > left) {
        throw new BadRequestException('Превышен дневной лимит списания');
      }
    }
    if (earnCap && earnCap > 0 && params.earnAmount > 0) {
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: params.merchantId,
          customerId: params.customerId,
          type: TxnType.EARN,
          createdAt: { gte: since, lte: until },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
      const left = Math.max(0, earnCap - used);
      if (params.earnAmount > left) {
        throw new BadRequestException('Превышен дневной лимит начисления');
      }
    }
  }

  // Customer теперь per-merchant модель — только проверка существования
  private async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!found) {
      throw new BadRequestException('customer not found');
    }
    return found;
  }

  private async getSettings(merchantId: string) {
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    return {
      earnBps: s?.earnBps ?? 300,
      redeemLimitBps: s?.redeemLimitBps ?? 5000,
      redeemCooldownSec: s?.redeemCooldownSec ?? 0,
      earnCooldownSec: s?.earnCooldownSec ?? 0,
      redeemDailyCap: s?.redeemDailyCap ?? null,
      earnDailyCap: s?.earnDailyCap ?? null,
      rulesJson: s?.rulesJson ?? null,
      updatedAt: s?.updatedAt ?? null,
    };
  }

  private normalizeChannel(
    raw: DeviceType | null | undefined,
  ): 'VIRTUAL' | 'PC_POS' | 'SMART' {
    if (!raw) return 'VIRTUAL';
    if (raw === DeviceType.SMART) return 'SMART';
    if (raw === DeviceType.PC_POS) return 'PC_POS';
    return 'VIRTUAL';
  }

  private async resolveOutletContext(
    merchantId: string,
    input: { outletId?: string | null },
  ) {
    const { outletId } = input;
    let outlet: { id: string; posType: DeviceType | null } | null = null;
    if (outletId) {
      try {
        outlet = await this.prisma.outlet.findFirst({
          where: { id: outletId, merchantId },
          select: { id: true, posType: true },
        });
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
        message:
          discountToApply > 0
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
      message:
        points > 0
          ? `Начислим ${points} баллов после оплаты.`
          : 'Сумма слишком мала для начисления.',
    };
  }

  // ————— основной расчёт — анти-replay вне транзакции + идемпотентность —————
  async quote(
    dto: QuoteDto & { customerId: string },
    qr?: QrMeta,
    opts?: { dryRun?: boolean; operationDate?: Date | null },
  ) {
    const customer = await this.ensureCustomerId(dto.customerId);
    const dryRun = opts?.dryRun ?? false;
    const operationDate = opts?.operationDate ?? null;
    // Ensure the merchant exists to satisfy FK constraints for wallet/holds
    try {
      await this.prisma.merchant.upsert({
        where: { id: dto.merchantId },
        update: {},
        create: {
          id: dto.merchantId,
          name: dto.merchantId,
          initialName: dto.merchantId,
        },
      });
    } catch {}
    await ensureBaseTier(this.prisma, dto.merchantId).catch(() => null);
    const {
      redeemCooldownSec,
      earnCooldownSec,
      redeemDailyCap,
      earnDailyCap,
      rulesJson,
      earnBps: baseEarnBps,
      redeemLimitBps: baseRedeemLimitBps,
      updatedAt,
    } = await this.getSettings(dto.merchantId);
    const rulesConfig =
      rulesJson && typeof rulesJson === 'object'
        ? (rulesJson as Record<string, any>)
        : {};
    const allowSameReceipt = Object.prototype.hasOwnProperty.call(
      rulesConfig,
      'allowEarnRedeemSameReceipt',
    )
      ? Boolean((rulesConfig as any).allowEarnRedeemSameReceipt)
      : !(rulesConfig as any).disallowEarnRedeemSameReceipt;

    let effectiveOutletId = dto.outletId ?? null;
    const deviceCtx = await this.resolveDeviceContext(
      dto.merchantId,
      dto.deviceId ?? null,
      effectiveOutletId,
    );
    if (deviceCtx && !effectiveOutletId) {
      effectiveOutletId = deviceCtx.outletId;
    }
    const outletCtx = await this.resolveOutletContext(dto.merchantId, {
      outletId: effectiveOutletId,
    });
    const channel = outletCtx.channel;
    effectiveOutletId = outletCtx.outletId ?? effectiveOutletId ?? null;
    const resolvedDeviceId = deviceCtx?.id ?? null;

    let resolvedPositions: ResolvedPosition[] = [];
    const rawPositions = this.sanitizePositions(
      (dto as any).positions as PositionInput[],
    );
    if (rawPositions.length) {
      resolvedPositions = await this.resolvePositions(
        dto.merchantId,
        rawPositions,
      );
    }
    const { total: sanitizedTotal, eligibleAmount } =
      this.computeTotalsFromPositions(
        Math.max(0, Math.floor(Number((dto as any).total ?? 0))),
        resolvedPositions,
      );
    // применяем правила для earnBps/redeemLimitBps (с кешом)
    const wd = new Date().getDay();
    const rulesFn = this.compileRules(
      dto.merchantId,
      effectiveOutletId,
      { earnBps: baseEarnBps, redeemLimitBps: baseRedeemLimitBps },
      rulesJson,
      updatedAt,
    );
    let { earnBps, redeemLimitBps } = rulesFn({
      channel,
      weekday: wd,
      eligibleAmount,
    });
    // Уровни управляются через LoyaltyTier, бонусы из локальных настроек не применяем

    // Override by portal-managed LoyaltyTier (per-customer assignment)
    let tierMinPayment: number | null = null;
    try {
      const assignment = await this.prisma.loyaltyTierAssignment.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { assignedAt: 'desc' },
      });
      let tier: any = null;
      if (assignment) {
        tier = await this.prisma.loyaltyTier.findUnique({
          where: { id: assignment.tierId },
        });
      }
      if (!tier) {
        tier = await this.prisma.loyaltyTier.findFirst({
          where: { merchantId: dto.merchantId, isInitial: true },
          orderBy: { thresholdAmount: 'asc' },
        });
      }
      if (tier) {
        if (typeof tier.earnRateBps === 'number') {
          earnBps = Math.max(0, Math.floor(Number(tier.earnRateBps)));
        }
        if (typeof tier.redeemRateBps === 'number') {
          redeemLimitBps = Math.max(0, Math.floor(Number(tier.redeemRateBps)));
        }
        const meta: any = tier.metadata ?? null;
        if (meta && typeof meta === 'object') {
          const raw = meta.minPaymentAmount ?? meta.minPayment;
          if (raw != null) {
            const mp = Number(raw);
            if (Number.isFinite(mp) && mp >= 0) tierMinPayment = Math.round(mp);
          }
        }
      }
    } catch {}

    // 0) если есть qr — сначала смотрим, не существует ли hold с таким qrJti
    if (qr && !dryRun) {
      const existing = await this.prisma.hold.findUnique({
        where: { qrJti: qr.jti },
      });
      if (existing) {
        if (existing.status === HoldStatus.PENDING) {
          if (effectiveOutletId && existing.outletId !== effectiveOutletId) {
            try {
              await this.prisma.hold.update({
                where: { id: existing.id },
                data: { outletId: effectiveOutletId },
              });
              (existing as any).outletId = effectiveOutletId;
            } catch {}
          }
          // идемпотентно отдадим тот же расчёт/holdId
          return this.quoteFromExistingHold(dto.mode, existing);
        }
        // уже зафиксирован или отменён — QR повторно использовать нельзя
        throw new BadRequestException(
          'QR токен уже использован. Попросите клиента обновить QR.',
        );
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
        const again = await this.prisma.hold.findUnique({
          where: { qrJti: qr.jti },
        });
        if (again) {
          if (again.status === HoldStatus.PENDING) {
            if (effectiveOutletId && again.outletId !== effectiveOutletId) {
              try {
                await this.prisma.hold.update({
                  where: { id: again.id },
                  data: { outletId: effectiveOutletId },
                });
                (again as any).outletId = effectiveOutletId;
              } catch {}
            }
            return this.quoteFromExistingHold(dto.mode, again);
          }
          throw new BadRequestException(
            'QR токен уже использован. Попросите клиента обновить QR.',
          );
        }
        // иначе считаем, что QR использован
        throw new BadRequestException(
          'QR токен уже использован. Попросите клиента обновить QR.',
        );
      }
    }

    const modeUpper = String(dto.mode).toUpperCase();
    if (modeUpper === 'REDEEM') {
      if (!allowSameReceipt && dto.orderId) {
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
          this.prisma.receipt
            .findUnique({
              where: {
                merchantId_orderId: {
                  merchantId: dto.merchantId,
                  orderId: dto.orderId,
                },
              },
            })
            .catch(() => null),
        ]);
        if (
          existingEarnHold ||
          (existingReceipt && Math.max(0, existingReceipt.earnApplied || 0) > 0)
        ) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message:
              'Нельзя одновременно начислять и списывать баллы в одном чеке.',
          };
        }
      }
      // антифрод: кулдаун и дневной лимит списаний
      if (redeemCooldownSec && redeemCooldownSec > 0) {
        const last = await this.prisma.transaction.findFirst({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            type: 'REDEEM',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (last) {
          const diffSec = Math.floor(
            (Date.now() - last.createdAt.getTime()) / 1000,
          );
          if (diffSec < redeemCooldownSec) {
            const wait = redeemCooldownSec - diffSec;
            return {
              canRedeem: false,
              discountToApply: 0,
              pointsToBurn: 0,
              finalPayable: sanitizedTotal,
              holdId: undefined,
              message: `Кулдаун на списание: подождите ${wait} сек.`,
            };
          }
        }
      }
      let dailyRedeemLeft: number | null = null;
      if (redeemDailyCap && redeemDailyCap > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const txns = await this.prisma.transaction.findMany({
          where: {
            merchantId: dto.merchantId,
            customerId: customer.id,
            type: 'REDEEM',
            createdAt: { gte: since },
          },
        });
        const used = txns.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
        dailyRedeemLeft = Math.max(0, redeemDailyCap - used);
        if (dailyRedeemLeft <= 0) {
          return {
            canRedeem: false,
            discountToApply: 0,
            pointsToBurn: 0,
            finalPayable: sanitizedTotal,
            holdId: undefined,
            message: 'Дневной лимит списаний исчерпан.',
          };
        }
      }
      // Проверка: если указан orderId, учитываем уже применённое списание по этому заказу
      let priorRedeemApplied = 0;
      if (dto.orderId) {
        try {
          const rcp = await this.prisma.receipt.findUnique({
            where: {
              merchantId_orderId: {
                merchantId: dto.merchantId,
                orderId: dto.orderId,
              },
            },
          });
          if (rcp) priorRedeemApplied = Math.max(0, rcp.redeemApplied || 0);
        } catch {}
      }
      const limit = Math.floor((sanitizedTotal * redeemLimitBps) / 10000);
      const remainingByOrder = Math.max(0, limit - priorRedeemApplied);
      if (dto.orderId && remainingByOrder <= 0) {
        return {
          canRedeem: false,
          discountToApply: 0,
          pointsToBurn: 0,
          finalPayable: sanitizedTotal,
          holdId: undefined,
          message: 'По этому заказу уже списаны максимальные баллы.',
        } as any;
      }
      const capLeft =
        dailyRedeemLeft != null ? dailyRedeemLeft : Number.MAX_SAFE_INTEGER;
      const allowedByMinPayment =
        tierMinPayment != null
          ? Math.max(
              0,
              sanitizedTotal - tierMinPayment - Math.max(0, priorRedeemApplied),
            )
          : Number.MAX_SAFE_INTEGER;
      const computeRedeemQuote = (walletBalance: number) => {
        const discountToApply = Math.min(
          walletBalance,
          remainingByOrder || limit,
          capLeft,
          allowedByMinPayment,
        );
        const itemsForCalc = resolvedPositions.map((item) => ({
          ...item,
          earnPoints: 0,
          redeemAmount: 0,
        }));
        let appliedRedeem = Math.max(
          0,
          Math.floor(Number(discountToApply) || 0),
        );
        let postEarnPoints = 0;
        let postEarnOnAmount = 0;
        if (itemsForCalc.length) {
          postEarnPoints = this.applyEarnAndRedeemToItems(
            itemsForCalc,
            allowSameReceipt ? earnBps : 0,
            discountToApply,
          );
          appliedRedeem = itemsForCalc.reduce(
            (sum, item) => sum + Math.max(0, item.redeemAmount || 0),
            0,
          );
          postEarnOnAmount = itemsForCalc.reduce(
            (sum, item) =>
              sum +
              Math.max(0, item.amount - Math.max(0, item.redeemAmount || 0)),
            0,
          );
        } else if (allowSameReceipt) {
          appliedRedeem = Math.max(
            0,
            Math.floor(Number(discountToApply) || 0),
          );
          const finalPayable = Math.max(0, sanitizedTotal - appliedRedeem);
          const earnBaseOnCash = Math.min(finalPayable, eligibleAmount);
          const eligibleByMin = !(
            tierMinPayment != null && finalPayable < tierMinPayment
          );
          if (eligibleByMin && earnBaseOnCash > 0) {
            postEarnOnAmount = earnBaseOnCash;
            postEarnPoints = Math.floor((earnBaseOnCash * earnBps) / 10000);
          }
        } else {
          appliedRedeem = Math.max(
            0,
            Math.floor(Number(discountToApply) || 0),
          );
        }
        const finalPayable = Math.max(0, sanitizedTotal - appliedRedeem);
        return {
          canRedeem: appliedRedeem > 0,
          discountToApply: appliedRedeem,
          pointsToBurn: appliedRedeem,
          finalPayable,
          message:
            appliedRedeem > 0
              ? `Списываем ${appliedRedeem} ₽, к оплате ${finalPayable} ₽`
              : 'Недостаточно баллов для списания.',
          postEarnPoints,
          postEarnOnAmount,
          positions: itemsForCalc.length ? itemsForCalc : resolvedPositions,
        };
      };

      if (dryRun) {
        const walletBalance =
          (
            await this.prisma.wallet.findFirst({
              where: {
                customerId: customer.id,
                merchantId: dto.merchantId,
                type: WalletType.POINTS,
              },
            })
          )?.balance ?? 0;
        const calc = computeRedeemQuote(walletBalance);
        return { ...calc, holdId: undefined };
      }

      // 2) дальше — обычный расчёт в транзакции и создание нового hold (уникальный qrJti не даст дубликат)
      return this.prisma.$transaction(async (tx) => {
        // Ensure merchant exists within the same transaction/connection (FK safety)
        try {
          await tx.merchant.upsert({
            where: { id: dto.merchantId },
            update: {},
            create: {
              id: dto.merchantId,
              name: dto.merchantId,
              initialName: dto.merchantId,
            },
          });
        } catch {}
        let wallet = await tx.wallet.findFirst({
          where: {
            customerId: customer.id,
            merchantId: dto.merchantId,
            type: WalletType.POINTS,
          },
        });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              customerId: customer.id,
              merchantId: dto.merchantId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });
        }

        const calc = computeRedeemQuote(wallet.balance);
        const positionsForHold = calc.positions ?? resolvedPositions;

        const hold = await tx.hold.create({
          data: {
            id: randomUUID(),
            customerId: customer.id,
            merchantId: dto.merchantId,
            mode: 'REDEEM',
            redeemAmount: calc.discountToApply,
            earnPoints: calc.postEarnPoints ?? 0,
            orderId: dto.orderId,
            total: sanitizedTotal,
            eligibleTotal: eligibleAmount,
            qrJti: qr?.jti ?? null,
            expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
            status: HoldStatus.PENDING,
            outletId: effectiveOutletId,
            staffId: dto.staffId ?? null,
            deviceId: resolvedDeviceId,
            createdAt: operationDate ?? undefined,
          },
        });
        await this.upsertHoldItems(
          tx,
          hold.id,
          dto.merchantId,
          positionsForHold,
        );

        return {
          ...calc,
          holdId: hold.id,
        };
      });
    }

    // ===== EARN =====
    if (!allowSameReceipt && dto.orderId) {
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
        this.prisma.receipt
          .findUnique({
            where: {
              merchantId_orderId: {
                merchantId: dto.merchantId,
                orderId: dto.orderId,
              },
            },
          })
          .catch(() => null),
      ]);
      if (
        existingRedeemHold ||
        (existingReceipt && Math.max(0, existingReceipt.redeemApplied || 0) > 0)
      ) {
        return {
          canEarn: false,
          pointsToEarn: 0,
          holdId: undefined,
          message:
            'Нельзя одновременно начислять и списывать баллы в одном чеке.',
        };
      }
    }
    // антифрод: кулдаун и дневной лимит начислений
    if (earnCooldownSec && earnCooldownSec > 0) {
      const last = await this.prisma.transaction.findFirst({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          type: 'EARN',
          orderId: { not: null } as any,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const diffSec = Math.floor(
          (Date.now() - last.createdAt.getTime()) / 1000,
        );
        if (diffSec < earnCooldownSec) {
          const wait = earnCooldownSec - diffSec;
          return {
            canEarn: false,
            pointsToEarn: 0,
            holdId: undefined,
            message: `Кулдаун на начисление: подождите ${wait} сек.`,
          };
        }
      }
    }
    let dailyEarnLeft: number | null = null;
    if (earnDailyCap && earnDailyCap > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const txns = await this.prisma.transaction.findMany({
        where: {
          merchantId: dto.merchantId,
          customerId: customer.id,
          type: 'EARN',
          orderId: { not: null } as any,
          createdAt: { gte: since },
        },
      });
      const used = txns.reduce((sum, t) => sum + Math.max(0, t.amount), 0);
      dailyEarnLeft = Math.max(0, earnDailyCap - used);
      if (dailyEarnLeft <= 0) {
        return {
          canEarn: false,
          pointsToEarn: 0,
          holdId: undefined,
          message: 'Дневной лимит начислений исчерпан.',
        };
      }
    }
    let points = Math.floor((eligibleAmount * earnBps) / 10000);
    let positionsForHold = resolvedPositions;
    if (resolvedPositions.length) {
      const itemsForCalc = resolvedPositions.map((item) => ({
        ...item,
        earnPoints: 0,
        redeemAmount: 0,
      }));
      const eligibleBps =
        tierMinPayment != null && sanitizedTotal < tierMinPayment ? 0 : earnBps;
      let totalFromItems = this.applyEarnAndRedeemToItems(
        itemsForCalc,
        eligibleBps,
        0,
      );
      if (tierMinPayment != null && sanitizedTotal < tierMinPayment) {
        totalFromItems = 0;
      }
      let cappedTotal = totalFromItems;
      if (dailyEarnLeft != null)
        cappedTotal = Math.min(cappedTotal, dailyEarnLeft);
      if (cappedTotal !== totalFromItems) {
        const weights = itemsForCalc.map((item) =>
          Math.max(
            1,
            Math.floor(
              Math.max(0, item.amount || 0) *
                Math.max(1, item.promotionMultiplier || 1),
            ),
          ),
        );
        const redistributed = this.allocateByWeight(weights, cappedTotal);
        redistributed.forEach((value, idx) => {
          itemsForCalc[idx].earnPoints = value;
        });
        totalFromItems = cappedTotal;
      }
      points = totalFromItems;
      positionsForHold = itemsForCalc;
    } else {
      if (tierMinPayment != null && sanitizedTotal < tierMinPayment) {
        points = 0;
      }
      if (dailyEarnLeft != null) points = Math.min(points, dailyEarnLeft);
      if (points < 0) points = 0;
    }

    if (dryRun) {
      return {
        canEarn: points > 0,
        pointsToEarn: points,
        holdId: undefined,
        message:
          points > 0
            ? `Начислим ${points} баллов после оплаты.`
            : 'Сумма слишком мала для начисления.',
      };
    }

    return this.prisma.$transaction(async (tx) => {
      // Ensure merchant exists within the same transaction/connection (FK safety)
      try {
        await tx.merchant.upsert({
          where: { id: dto.merchantId },
          update: {},
          create: {
            id: dto.merchantId,
            name: dto.merchantId,
            initialName: dto.merchantId,
          },
        });
      } catch {}
      let wallet = await tx.wallet.findFirst({
        where: {
          customerId: customer.id,
          merchantId: dto.merchantId,
          type: WalletType.POINTS,
        },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            customerId: customer.id,
            merchantId: dto.merchantId,
            type: WalletType.POINTS,
            balance: 0,
          },
        });
      }

      const hold = await tx.hold.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          merchantId: dto.merchantId,
          mode: 'EARN',
          earnPoints: points,
          orderId: dto.orderId,
          total: sanitizedTotal,
          eligibleTotal: eligibleAmount,
          qrJti: qr?.jti ?? null,
          expiresAt: qr?.exp ? new Date(qr.exp * 1000) : null,
          status: HoldStatus.PENDING,
          outletId: effectiveOutletId,
          staffId: dto.staffId ?? null,
          deviceId: resolvedDeviceId,
          createdAt: operationDate ?? undefined,
        },
      });
      await this.upsertHoldItems(tx, hold.id, dto.merchantId, positionsForHold);

      return {
        canEarn: points > 0,
        pointsToEarn: points,
        holdId: hold.id,
        message:
          points > 0
            ? `Начислим ${points} баллов после оплаты.`
            : 'Сумма слишком мала для начисления.',
      };
    });
  }

  async commit(
    holdId: string,
    orderId: string,
    receiptNumber: string | undefined,
    requestId: string | undefined,
    opts?: {
      promoCode?: { promoCodeId: string; code?: string | null };
      operationDate?: Date | null;
      manualEarnPoints?: number | null;
      manualRedeemAmount?: number | null;
      positions?: PositionInput[] | null;
    },
  ) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { items: true },
    });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Hold expired. Обновите QR в мини-аппе и повторите.',
      );
    }
    const context = await this.ensureCustomerContext(
      hold.merchantId,
      hold.customerId,
    );
    const operationDate = opts?.operationDate ?? null;
    const operationDateObj = operationDate ?? new Date();
    const operationTimestamp = operationDateObj.getTime();
    const manualRedeemOverride =
      opts?.manualRedeemAmount == null
        ? null
        : Math.max(0, Math.floor(Number(opts.manualRedeemAmount ?? 0) || 0));
    const manualEarnOverride =
      opts?.manualEarnPoints == null
        ? null
        : Math.max(0, Math.floor(Number(opts.manualEarnPoints ?? 0) || 0));

    if (hold.status !== HoldStatus.PENDING) {
      // Идемпотентность: если чек уже есть по этому заказу — возвращаем успех
      const existing = await this.prisma.receipt.findUnique({
        where: { merchantId_orderId: { merchantId: hold.merchantId, orderId } },
      });
      if (existing) {
        return {
          ok: true,
          customerId: context.customerId,
          alreadyCommitted: true,
          receiptId: existing.id,
          redeemApplied: existing.redeemApplied,
          earnApplied: existing.earnApplied,
        };
      }
      throw new ConflictException('Hold already finished');
    }

    const positionsOverrideInput = this.sanitizePositions(
      (opts?.positions as PositionInput[]) ?? [],
    );
    const positionsOverrideResolved = positionsOverrideInput.length
      ? await this.resolvePositions(hold.merchantId, positionsOverrideInput)
      : [];
    const fallbackHoldTotal = Math.max(0, Math.floor(Number(hold.total ?? 0)));
    let effectiveTotal = fallbackHoldTotal;
    let effectiveEligible = Math.max(
      0,
      Math.floor(
        Number(
          hold.eligibleTotal != null ? hold.eligibleTotal : (hold.total ?? 0),
        ),
      ),
    );
    if (positionsOverrideResolved.length) {
      const totals = this.computeTotalsFromPositions(
        fallbackHoldTotal,
        positionsOverrideResolved,
      );
      effectiveTotal = totals.total;
      effectiveEligible = totals.eligibleAmount;
    } else if (effectiveTotal > 0) {
      effectiveEligible = Math.min(effectiveEligible, effectiveTotal);
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: hold.customerId,
        merchantId: hold.merchantId,
        type: WalletType.POINTS,
      },
    });
    if (!wallet) throw new BadRequestException('Wallet not found');

    try {
      return await this.prisma.$transaction(async (tx) => {
        let staffMotivationSettings: StaffMotivationSettingsNormalized | null =
          null;
        let staffMotivationIsFirstPurchase = false;
        if (hold.staffId) {
          try {
            staffMotivationSettings = await this.staffMotivation.getSettings(
              tx,
              hold.merchantId,
            );
            if (staffMotivationSettings.enabled) {
              const previousPurchases = await tx.receipt.count({
                where: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  canceledAt: null,
                },
              });
              staffMotivationIsFirstPurchase = previousPurchases === 0;
            }
          } catch {
            staffMotivationSettings = null;
            staffMotivationIsFirstPurchase = false;
          }
        }
        // Идемпотентность: если чек уже есть — ничего не делаем
        const existing = await tx.receipt.findUnique({
          where: {
            merchantId_orderId: { merchantId: hold.merchantId, orderId },
          },
        });
        if (existing) {
          return {
            ok: true,
            customerId: context.customerId,
            alreadyCommitted: true,
            receiptId: existing.id,
            redeemApplied: existing.redeemApplied,
            earnApplied: existing.earnApplied,
          };
        }

        // Накапливаем применённые суммы для чека
        let appliedRedeem = 0;
        let appliedEarn = 0;
        let redeemTxId: string | null = null;
        let earnTxId: string | null = null;
        let promoResult: PromoCodeApplyResult | null = null;
        if (opts?.promoCode && hold.customerId && manualEarnOverride == null) {
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
        const hasSavedItems =
          Array.isArray((hold as any)?.items) &&
          ((hold as any).items as any[]).length > 0;
        const shouldOverrideItems =
          positionsOverrideResolved.length > 0 && !hasSavedItems;

        const holdItemsResolved: ResolvedPosition[] = shouldOverrideItems
          ? positionsOverrideResolved.map((item) => ({
              ...item,
              earnPoints:
                item.earnPoints != null
                  ? Math.max(0, Math.floor(Number(item.earnPoints)))
                  : 0,
              redeemAmount:
                item.redeemAmount != null
                  ? Math.max(0, Math.floor(Number(item.redeemAmount)))
                  : 0,
            }))
          : (((hold as any)?.items as any[])?.map((item: any) => ({
              productId: item.productId ?? undefined,
              categoryId: item.categoryId ?? undefined,
              resolvedProductId: item.productId ?? null,
              resolvedCategoryId: item.categoryId ?? null,
              externalId: item.externalId ?? undefined,
              name: item.name ?? undefined,
              qty: Number(item.qty ?? 0),
              price: Number(item.price ?? 0),
              amount: Math.max(0, Number(item.amount ?? 0)),
              promotionId: item.promotionId ?? null,
              promotionMultiplier:
                item.promotionMultiplier &&
                Number.isFinite(item.promotionMultiplier)
                  ? Number(item.promotionMultiplier) / 10000
                  : 1,
              accruePoints:
                item.accruePoints != null ? Boolean(item.accruePoints) : true,
              earnPoints:
                item.earnPoints != null
                  ? Math.max(0, Math.floor(Number(item.earnPoints)))
                  : 0,
              redeemAmount:
                item.redeemAmount != null
                  ? Math.max(0, Math.floor(Number(item.redeemAmount)))
                  : 0,
            })) ?? []);

        if (shouldOverrideItems) {
          await this.upsertHoldItems(
            tx,
            hold.id,
            hold.merchantId,
            holdItemsResolved,
          );
        }

        // REDEEM
        const redeemTarget = manualRedeemOverride ?? hold.redeemAmount;
        if (hold.mode === 'REDEEM' && redeemTarget > 0) {
          const fresh = await tx.wallet.findUnique({
            where: { id: wallet.id },
          });
          const amount = Math.min(fresh!.balance, redeemTarget);
          appliedRedeem = amount;
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: fresh!.balance - amount },
          });
          const redeemTx = await tx.transaction.create({
            data: {
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              type: TxnType.REDEEM,
              amount: -amount,
              orderId,
              outletId: hold.outletId,
              staffId: hold.staffId,
              deviceId: hold.deviceId ?? null,
              createdAt: operationDateObj,
            },
          });
          redeemTxId = redeemTx.id;
          // Earn lots consumption (optional)
          if (process.env.EARN_LOTS_FEATURE === '1' && amount > 0) {
            await this.consumeLots(
              tx,
              hold.merchantId,
              hold.customerId,
              amount,
              { orderId },
            );
          }
          // Ledger mirror (optional)
          if (process.env.LEDGER_FEATURE === '1' && amount > 0) {
            await tx.ledgerEntry.create({
              data: {
                merchantId: hold.merchantId,
                customerId: hold.customerId,
                debit: LedgerAccount.CUSTOMER_BALANCE,
                credit: LedgerAccount.MERCHANT_LIABILITY,
                amount,
                orderId,
                outletId: hold.outletId ?? null,
                staffId: hold.staffId ?? null,
                deviceId: hold.deviceId ?? null,
                meta: { mode: 'REDEEM' },
                createdAt: operationDateObj,
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', {
              type: 'redeem',
            });
          }
        }
        const baseEarnFromHold =
          manualEarnOverride != null
            ? manualEarnOverride
            : Math.max(0, Math.floor(Number(hold.earnPoints || 0)));
        const promoBonus =
          manualEarnOverride != null
            ? 0
            : promoResult
              ? Math.max(0, Math.floor(Number(promoResult.pointsIssued || 0)))
              : 0;
        // Доп. начисление при списании, если включено allowEarnRedeemSameReceipt
        let extraEarn = 0;
        try {
          const msRules = await tx.merchantSettings.findUnique({
            where: { merchantId: hold.merchantId },
          });
          const rules =
            msRules?.rulesJson && typeof msRules.rulesJson === 'object'
              ? (msRules.rulesJson as any)
              : {};
          const allowSame = Object.prototype.hasOwnProperty.call(
            rules,
            'allowEarnRedeemSameReceipt',
          )
            ? Boolean(rules.allowEarnRedeemSameReceipt)
            : !rules.disallowEarnRedeemSameReceipt;
          if (
            manualEarnOverride == null &&
            hold.mode === 'REDEEM' &&
            allowSame &&
            baseEarnFromHold === 0
          ) {
            const { earnBps: baseEarnBps, earnDailyCap } =
              await this.getSettings(hold.merchantId);
            let earnBpsEff = baseEarnBps;
            let tierMinPaymentLocal: number | null = null;
            try {
              const assignment = await tx.loyaltyTierAssignment.findFirst({
                where: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                orderBy: { assignedAt: 'desc' },
              });
              let tier: any = null;
              if (assignment)
                tier = await tx.loyaltyTier.findUnique({
                  where: { id: assignment.tierId },
                });
              if (!tier)
                tier = await tx.loyaltyTier.findFirst({
                  where: { merchantId: hold.merchantId, isInitial: true },
                  orderBy: { thresholdAmount: 'asc' },
                });
              if (tier) {
                if (typeof tier.earnRateBps === 'number')
                  earnBpsEff = Math.max(
                    0,
                    Math.floor(Number(tier.earnRateBps)),
                  );
                const meta: any = tier.metadata ?? null;
                if (meta && typeof meta === 'object') {
                  const raw = meta.minPaymentAmount ?? meta.minPayment;
                  if (raw != null) {
                    const mp = Number(raw);
                    if (Number.isFinite(mp) && mp >= 0)
                      tierMinPaymentLocal = Math.round(mp);
                  }
                }
              }
            } catch {}
            const appliedRedeemAmt = Math.max(0, appliedRedeem);
            const total = effectiveTotal;
            const eligible = effectiveEligible;
            const finalPayable = Math.max(0, total - appliedRedeemAmt);
            const earnBaseOnCash = Math.min(finalPayable, eligible);
            if (
              !(
                tierMinPaymentLocal != null &&
                finalPayable < tierMinPaymentLocal
              ) &&
              earnBaseOnCash > 0
            ) {
              let pts = Math.floor((earnBaseOnCash * earnBpsEff) / 10000);
              if (pts > 0 && earnDailyCap && earnDailyCap > 0) {
                const since = new Date(
                  operationTimestamp - 24 * 60 * 60 * 1000,
                );
                const txns = await tx.transaction.findMany({
                  where: {
                    merchantId: hold.merchantId,
                    customerId: hold.customerId,
                    type: 'EARN',
                    orderId: { not: null } as any,
                    createdAt: { gte: since },
                  },
                });
                const used = txns.reduce(
                  (sum, t) => sum + Math.max(0, t.amount),
                  0,
                );
                const left = Math.max(0, earnDailyCap - used);
                pts = Math.min(pts, left);
              }
              extraEarn = Math.max(0, pts);
            }
          }
        } catch {}
        const appliedEarnTotal = baseEarnFromHold + promoBonus + extraEarn;

        if (appliedEarnTotal > 0) {
          // Проверяем, требуется ли задержка начисления. В юнит-тестах tx может не иметь merchantSettings — делаем fallback на this.prisma.
          let settings: any = null;
          const txHasMs = (tx as any)?.merchantSettings?.findUnique;
          if (txHasMs) {
            settings = await (tx as any).merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
          } else if ((this.prisma as any)?.merchantSettings?.findUnique) {
            settings = await (this.prisma as any).merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
          }
          const delayDays = Number(settings?.earnDelayDays || 0) || 0;
          const ttlDays = Number(settings?.pointsTtlDays || 0) || 0;
          appliedEarn = appliedEarnTotal;
          const promoExpireDays = promoResult?.pointsExpireInDays ?? null;

          if (delayDays > 0) {
            // Откладываем начисление: создаём PENDING lot и событие, баланс не трогаем до созревания
            if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
              const maturesAt = new Date(
                operationTimestamp + delayDays * 24 * 60 * 60 * 1000,
              );
              const earnLot =
                (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
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
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                  });
                }
                if (promoBonus > 0) {
                  const promoExpiresAt = promoExpireDays
                    ? new Date(
                        maturesAt.getTime() +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
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
                      orderId: null,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                  });
                }
                if (extraEarn > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: extraEarn,
                      consumedPoints: 0,
                      earnedAt: maturesAt,
                      maturesAt,
                      expiresAt: expiresAtStd,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                  });
                }
              }
            }
            await tx.eventOutbox.create({
              data: {
                merchantId: hold.merchantId,
                eventType: 'loyalty.earn.scheduled',
                createdAt: operationDateObj,
                payload: {
                  holdId: hold.id,
                  orderId,
                  customerId: hold.customerId,
                  merchantId: hold.merchantId,
                  points: appliedEarn,
                  maturesAt: new Date(
                    operationTimestamp + delayDays * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                  outletId: hold.outletId ?? null,
                  staffId: hold.staffId ?? null,
                  deviceId: hold.deviceId ?? null,
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
              },
            });
          } else {
            // Немедленное начисление
            const fresh = await tx.wallet.findUnique({
              where: { id: wallet.id },
            });
            if (appliedEarn > 0) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: fresh!.balance + appliedEarn },
              });
            }
            const earnTx = await tx.transaction.create({
              data: {
                customerId: hold.customerId,
                merchantId: hold.merchantId,
                type: TxnType.EARN,
                amount: appliedEarn,
                orderId,
                outletId: hold.outletId,
                staffId: hold.staffId,
                deviceId: hold.deviceId ?? null,
                createdAt: operationDateObj,
              },
            });
            earnTxId = earnTx.id;
            // Ledger mirror (optional)
            if (process.env.LEDGER_FEATURE === '1' && appliedEarn > 0) {
              await tx.ledgerEntry.create({
                data: {
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  debit: LedgerAccount.MERCHANT_LIABILITY,
                  credit: LedgerAccount.CUSTOMER_BALANCE,
                  amount: appliedEarn,
                  orderId,
                  outletId: hold.outletId ?? null,
                  staffId: hold.staffId ?? null,
                  deviceId: hold.deviceId ?? null,
                  meta: { mode: 'EARN' },
                  createdAt: operationDateObj,
                },
              });
              this.metrics.inc('loyalty_ledger_entries_total', {
                type: 'earn',
              });
              this.metrics.inc(
                'loyalty_ledger_amount_total',
                { type: 'earn' },
                appliedEarn,
              );
            }
            // Earn lots (optional)
            if (process.env.EARN_LOTS_FEATURE === '1' && appliedEarn > 0) {
              const earnLot =
                (tx as any)?.earnLot ?? (this.prisma as any)?.earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: baseEarnFromHold,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                  });
                }
                if (promoBonus > 0) {
                  const expiresPromo = promoExpireDays
                    ? new Date(
                        operationTimestamp +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: promoBonus,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expiresPromo,
                      orderId: null,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                  });
                }
                if (extraEarn > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  await earnLot.create({
                    data: {
                      merchantId: hold.merchantId,
                      customerId: hold.customerId,
                      points: extraEarn,
                      consumedPoints: 0,
                      earnedAt: operationDateObj,
                      maturesAt: null,
                      expiresAt: expires,
                      orderId,
                      receiptId: null,
                      outletId: hold.outletId ?? null,
                      staffId: hold.staffId ?? null,
                      deviceId: hold.deviceId ?? null,
                      status: 'ACTIVE',
                      createdAt: operationDateObj,
                    },
                  });
                }
              }
            }
          }
        }

        await tx.hold.update({
          where: { id: hold.id },
          data: {
            status: HoldStatus.COMMITTED,
            orderId,
            total: effectiveTotal,
            eligibleTotal: effectiveEligible,
          },
        });

        let redeemShares: number[] = [];
        if (holdItemsResolved.length > 0) {
          const plannedRedeem = holdItemsResolved.map((item) =>
            Math.max(0, Math.floor(Number(item.redeemAmount || 0))),
          );
          const plannedTotal = plannedRedeem.reduce(
            (sum, value) => sum + value,
            0,
          );
          const targetRedeem = Math.min(
            Math.max(0, Math.floor(Number(appliedRedeem) || 0)),
            plannedTotal > 0 ? plannedTotal : Number.MAX_SAFE_INTEGER,
          );
          redeemShares =
            plannedTotal > 0
              ? this.allocateProRata(plannedRedeem, targetRedeem)
              : this.allocateProRata(
                  holdItemsResolved.map((item) => item.amount),
                  targetRedeem,
                );
        }
        const earnWeights =
          holdItemsResolved.length > 0
            ? holdItemsResolved.map((item, idx) =>
                Math.max(
                  0,
                  Math.floor(
                    Math.max(0, item.amount - (redeemShares[idx] ?? 0)) *
                      Math.max(1, item.promotionMultiplier || 1),
                  ),
                ),
              )
            : [];
        const earnShares =
          holdItemsResolved.length > 0
            ? this.allocateByWeight(earnWeights, appliedEarnTotal)
            : [];

        const created = await tx.receipt.create({
          data: {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
            orderId,
            receiptNumber: receiptNumber ?? null,
            total: effectiveTotal,
            eligibleTotal: effectiveEligible,
            redeemApplied: appliedRedeem,
            earnApplied: appliedEarn,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
            deviceId: hold.deviceId ?? null,
            createdAt: operationDateObj,
          },
        });

        const receiptItemsCreated: Array<{
          id: string;
          redeemApplied: number;
          earnApplied: number;
          item: ResolvedPosition;
        }> = [];
        for (let idx = 0; idx < holdItemsResolved.length; idx++) {
          const item = holdItemsResolved[idx];
          const redeemAppliedItem = redeemShares[idx] ?? 0;
          const earnAppliedItem = earnShares[idx] ?? 0;
          const receiptItem = await tx.receiptItem.create({
            data: {
              receiptId: created.id,
              merchantId: hold.merchantId,
              productId: item.resolvedProductId ?? null,
              categoryId: item.resolvedCategoryId ?? null,
              externalProvider: null,
              externalId: item.externalId ?? null,
              name: item.name ?? null,
              sku: null,
              barcode: null,
              qty: new Prisma.Decimal(item.qty ?? 0),
              price: new Prisma.Decimal(item.price ?? 0),
              amount: item.amount ?? 0,
              earnApplied: earnAppliedItem,
              redeemApplied: redeemAppliedItem,
              promotionId: item.promotionId ?? null,
              promotionMultiplier:
                item.promotionMultiplier && item.promotionMultiplier > 0
                  ? Math.round(item.promotionMultiplier * 10000)
                  : null,
              metadata: Prisma.JsonNull,
            },
          });
          receiptItemsCreated.push({
            id: receiptItem.id,
            redeemApplied: redeemAppliedItem,
            earnApplied: earnAppliedItem,
            item,
          });
        }

        if (redeemTxId && appliedRedeem > 0) {
          for (const rec of receiptItemsCreated) {
            await tx.transactionItem.create({
              data: {
                transactionId: redeemTxId,
                receiptItemId: rec.id,
                merchantId: hold.merchantId,
                productId: rec.item.resolvedProductId ?? null,
                categoryId: rec.item.resolvedCategoryId ?? null,
                externalProvider: null,
                externalId: rec.item.externalId ?? null,
                name: rec.item.name ?? null,
                sku: null,
                barcode: null,
                qty: new Prisma.Decimal(rec.item.qty ?? 0),
                price: new Prisma.Decimal(rec.item.price ?? 0),
                amount: rec.item.amount ?? 0,
                earnAmount: null,
                redeemAmount: rec.redeemApplied ?? 0,
                promotionId: rec.item.promotionId ?? null,
                promotionMultiplier:
                  rec.item.promotionMultiplier &&
                  rec.item.promotionMultiplier > 0
                    ? Math.round(rec.item.promotionMultiplier * 10000)
                    : null,
                metadata: Prisma.JsonNull,
              },
            });
          }
        }

        if (earnTxId && appliedEarn > 0) {
          for (const rec of receiptItemsCreated) {
            await tx.transactionItem.create({
              data: {
                transactionId: earnTxId,
                receiptItemId: rec.id,
                merchantId: hold.merchantId,
                productId: rec.item.resolvedProductId ?? null,
                categoryId: rec.item.resolvedCategoryId ?? null,
                externalProvider: null,
                externalId: rec.item.externalId ?? null,
                name: rec.item.name ?? null,
                sku: null,
                barcode: null,
                qty: new Prisma.Decimal(rec.item.qty ?? 0),
                price: new Prisma.Decimal(rec.item.price ?? 0),
                amount: rec.item.amount ?? 0,
                earnAmount: rec.earnApplied ?? 0,
                redeemAmount: null,
                promotionId: rec.item.promotionId ?? null,
                promotionMultiplier:
                  rec.item.promotionMultiplier &&
                  rec.item.promotionMultiplier > 0
                    ? Math.round(rec.item.promotionMultiplier * 10000)
                    : null,
                metadata: Prisma.JsonNull,
              },
            });
          }
        }

        try {
          await tx.hold.update({
            where: { id: hold.id },
            data: { receiptId: created.id },
          });
        } catch {}

        if (hold.staffId && staffMotivationSettings?.enabled) {
          try {
            await this.staffMotivation.recordPurchase(tx, {
              merchantId: hold.merchantId,
              staffId: hold.staffId,
              outletId: hold.outletId ?? null,
              customerId: hold.customerId,
              orderId,
              receiptId: created.id,
              eventAt: created.createdAt ?? new Date(),
              isFirstPurchase: staffMotivationIsFirstPurchase,
              settings: staffMotivationSettings,
            });
          } catch {}
        }

        // Начисление реферальных бонусов пригласителям (многоуровневая схема, триггеры first/all)
        try {
          await this.applyReferralRewards(tx, {
            merchantId: hold.merchantId,
            buyerId: hold.customerId,
            purchaseAmount: effectiveEligible,
            receiptId: created.id,
            orderId,
            outletId: hold.outletId ?? null,
            staffId: hold.staffId ?? null,
            deviceId: hold.deviceId ?? null,
          });
        } catch {}
        // обновим lastSeen у торговой точки/устройства
        const touchTs = operationDateObj;
        if (hold.outletId) {
          try {
            await tx.outlet.update({
              where: { id: hold.outletId },
              data: { posLastSeenAt: touchTs },
            });
          } catch {}
        }
        // Пишем событие в outbox (минимально)
        await tx.eventOutbox.create({
          data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.commit',
            createdAt: operationDateObj,
            payload: {
              schemaVersion: 1,
              holdId: hold.id,
              orderId,
              customerId: hold.customerId,
              merchantId: hold.merchantId,
              redeemApplied: appliedRedeem,
              earnApplied: appliedEarn,
              receiptId: created.id,
              createdAt: operationDateObj.toISOString(),
              outletId: hold.outletId ?? null,
              staffId: hold.staffId ?? null,
              requestId: requestId ?? null,
            } as any,
          },
        });
        try {
          await tx.eventOutbox.create({
            data: {
              merchantId: hold.merchantId,
              eventType: 'notify.staff.telegram',
              createdAt: operationDateObj,
              payload: {
                kind: 'ORDER',
                receiptId: created.id,
                at:
                  (created as any)?.createdAt?.toISOString?.() ??
                  operationDateObj.toISOString(),
              } satisfies StaffNotificationPayload,
            },
          });
        } catch {}
        // ===== Автоповышение уровня по порогу (portal-managed tiers) =====
        try {
          await this.recomputeTierProgress(tx, {
            merchantId: hold.merchantId,
            customerId: hold.customerId,
          });
        } catch {}
        return {
          ok: true,
          customerId: context.customerId,
          receiptId: created.id,
          redeemApplied: appliedRedeem,
          earnApplied: appliedEarn,
        };
      });
    } catch (e: any) {
      // В редкой гонке уникальный индекс по (merchantId, orderId) может сработать —
      // любая следующая команда в рамках той же транзакции упадёт с 25P02 (transaction aborted).
      // Выполним идемпотентный поиск вне транзакции.
      try {
        const existing2 = await this.prisma.receipt.findUnique({
          where: {
            merchantId_orderId: { merchantId: hold.merchantId, orderId },
          },
        });
        if (existing2) {
          return {
            ok: true,
            customerId: context.customerId,
            alreadyCommitted: true,
            receiptId: existing2.id,
            redeemApplied: existing2.redeemApplied,
            earnApplied: existing2.earnApplied,
          };
        }
      } catch {}
      throw e;
    }
  }

  async processIntegrationBonus(
    params: IntegrationBonusParams,
  ): Promise<IntegrationBonusResult> {
    const merchantId = String(params.merchantId || '').trim();
    const customerId = String(params.customerId || '').trim();
    const invoiceNum = String(params.invoiceNum || '').trim() || null;
    const orderId = invoiceNum || randomUUID();
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    const operationDate = params.operationDate ?? null;
    const paidBonus = this.sanitizeManualAmount(params.paidBonus);
    const bonusValue = this.sanitizeManualAmount(params.bonusValue);
    const manualMode = paidBonus != null || bonusValue != null;
    const baseTotal = Math.max(0, Math.floor(Number(params.total ?? 0)));
    const rawItems = this.sanitizePositions(
      (params.items as PositionInput[]) ?? [],
    );
    const resolvedItems = rawItems.length
      ? await this.resolvePositions(merchantId, rawItems)
      : [];
    const { total: sanitizedTotal, eligibleAmount } =
      this.computeTotalsFromPositions(baseTotal, resolvedItems);

    await this.ensureCustomerId(customerId);
    try {
      await this.prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: {
          id: merchantId,
          name: merchantId,
          initialName: merchantId,
        },
      });
    } catch {}

    let existingReceipt: any = null;
    try {
      existingReceipt = await this.prisma.receipt.findUnique({
        where: { merchantId_orderId: { merchantId, orderId } },
      });
    } catch {
      existingReceipt = null;
    }
    if (existingReceipt) {
      if (existingReceipt.customerId !== customerId) {
        throw new ConflictException(
          'Операция уже выполнена для другого клиента',
        );
      }
      const walletAfter = await this.balance(merchantId, customerId);
      return {
        orderId: existingReceipt.id,
        invoiceNum: invoiceNum || orderId,
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

    if (manualMode) {
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

    let holdId = existingHold?.id ?? null;
    let manualRedeemOverride: number | null = paidBonus ?? null;
    let manualEarnOverride: number | null = bonusValue ?? null;

    let positionsForHold = resolvedItems.map((item) => ({
      ...item,
      earnPoints: item.earnPoints ?? 0,
      redeemAmount: item.redeemAmount ?? 0,
    }));
    if (manualMode && positionsForHold.length) {
      const redeemCaps = this.computeRedeemCaps(positionsForHold);
      const capsTotal = redeemCaps.reduce((sum, cap) => sum + cap, 0);
      const redeemTarget = Math.min(
        Math.max(0, Math.floor(Number(paidBonus ?? 0) || 0)),
        capsTotal,
      );
      const redeemShares = this.allocateProRataWithCaps(
        positionsForHold.map((i) => i.amount),
        redeemCaps,
        redeemTarget,
      );
      const earnWeights = positionsForHold.map((item, idx) =>
        Math.max(
          0,
          Math.floor(
            Math.max(0, item.amount - (redeemShares[idx] ?? 0)) *
              Math.max(1, item.promotionMultiplier || 1),
          ),
        ),
      );
      const earnShares = this.allocateByWeight(earnWeights, bonusValue ?? 0);
      manualRedeemOverride = redeemShares.reduce(
        (sum, value) => sum + Math.max(0, value),
        0,
      );
      positionsForHold = positionsForHold.map((item, idx) => ({
        ...item,
        redeemAmount: redeemShares[idx] ?? 0,
        earnPoints: earnShares[idx] ?? 0,
      }));
    }

    const holdMode =
      manualRedeemOverride && manualRedeemOverride > 0
        ? HoldMode.REDEEM
        : HoldMode.EARN;
    const redeemToSave = manualRedeemOverride ?? 0;
    const earnToSave = manualEarnOverride ?? 0;

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
          total: sanitizedTotal,
          eligibleTotal: eligibleAmount,
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
          this.prisma as any,
          holdId,
          merchantId,
          positionsForHold,
        );
      }
    } else {
      const holdExisting = existingHold!;
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

      if (manualMode && positionsForHold.length) {
        try {
          await this.upsertHoldItems(
            this.prisma as any,
            holdId,
            merchantId,
            positionsForHold,
          );
        } catch {}
        try {
          await this.prisma.hold.update({
            where: { id: holdId },
            data: {
              total: sanitizedTotal,
              eligibleTotal: eligibleAmount,
              outletId: params.outletId ?? null,
              staffId: params.staffId ?? null,
              deviceId: params.resolvedDeviceId ?? null,
              mode:
                manualRedeemOverride && manualRedeemOverride > 0
                  ? HoldMode.REDEEM
                  : holdExisting.mode,
              redeemAmount:
                manualRedeemOverride != null
                  ? manualRedeemOverride
                  : holdExisting.redeemAmount,
              earnPoints:
                manualEarnOverride != null
                  ? manualEarnOverride
                  : holdExisting.earnPoints,
            },
          });
        } catch {}
      }
    }

    if (manualRedeemOverride != null && manualRedeemOverride > balanceBefore) {
      throw new BadRequestException('Недостаточно бонусов для списания');
    }

    if (!holdId) {
      throw new BadRequestException('Не удалось подготовить hold');
    }
    const commitResult = await this.commit(
      holdId,
      orderId,
      invoiceNum || undefined,
      params.requestId ?? undefined,
      {
        operationDate,
        manualRedeemAmount:
          manualMode && manualRedeemOverride != null
            ? manualRedeemOverride
            : null,
        manualEarnPoints:
          manualMode && manualEarnOverride != null ? manualEarnOverride : null,
        positions: manualMode ? undefined : rawItems,
      },
    );
    let receiptId: string | null = commitResult.receiptId ?? null;
    if (!receiptId) {
      try {
        const fallback = await this.prisma.receipt.findUnique({
          where: { merchantId_orderId: { merchantId, orderId } },
          select: { id: true },
        });
        receiptId = fallback?.id ?? null;
      } catch {}
    }
    if (!receiptId) {
      throw new BadRequestException('Не удалось зафиксировать операцию');
    }
    const walletAfter = await this.balance(merchantId, customerId);
    return {
      receiptId: receiptId,
      orderId: receiptId,
      invoiceNum: invoiceNum || orderId,
      redeemApplied: commitResult.redeemApplied ?? 0,
      earnApplied: commitResult.earnApplied ?? 0,
      balanceBefore,
      balanceAfter: walletAfter.balance ?? 0,
      alreadyProcessed: Boolean(commitResult.alreadyCommitted),
    };
  }

  async cancel(holdId: string) {
    const hold = await this.prisma.hold.findUnique({ where: { id: holdId } });
    if (!hold) throw new BadRequestException('Hold not found');
    if (hold.status !== HoldStatus.PENDING)
      throw new ConflictException('Hold already finished');
    await this.prisma.hold.update({
      where: { id: holdId },
      data: { status: HoldStatus.CANCELED },
    });
    return { ok: true };
  }

  async balance(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer
      .findUnique({
        where: { id: customerId },
        select: { id: true, merchantId: true },
      })
      .catch(() => null);
    if (!customer || customer.merchantId !== merchantId)
      throw new BadRequestException('merchant customer not found');
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: customer.id,
        merchantId,
        type: WalletType.POINTS,
      },
    });
    return {
      merchantId,
      customerId,
      balance: wallet?.balance ?? 0,
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
    const normalized = this.sanitizePositions(params.items);
    const baseTotal = Math.max(0, Math.floor(Number(params.total ?? 0) || 0));

    // Если items пустой, но есть total — создаём виртуальную позицию
    let resolved: ResolvedPosition[];
    let total: number;
    let eligibleAmount: number;
    if (normalized.length) {
      resolved = await this.resolvePositions(params.merchantId, normalized);
      const computed = this.computeTotalsFromPositions(0, resolved);
      total = computed.total;
      eligibleAmount = computed.eligibleAmount;
    } else if (baseTotal > 0) {
      // Нет items, используем total как одну виртуальную позицию
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

    // Загружаем баланс и ставки
    const [balanceResp, rates] = await Promise.all([
      this.balance(params.merchantId, params.customerId),
      this.getBaseRatesForCustomer(params.merchantId, params.customerId, {
        outletId: params.outletId,
        eligibleAmount,
      }),
    ]);
    const balance = balanceResp.balance ?? 0;
    const earnBps = rates.earnBps ?? 0;
    const redeemLimitBps = rates.redeemLimitBps ?? 0;

    // Считаем лимит списания по чеку
    const maxRedeemByLimit = Math.floor(
      (total * redeemLimitBps) / 10000,
    );
    let maxRedeemTotal = Math.min(balance, maxRedeemByLimit, total);

    // Если передан paidBonus — учитываем желаемое списание
    const paidBonus = Math.max(
      0,
      Math.floor(Number(params.paidBonus ?? 0) || 0),
    );
    if (paidBonus > 0) {
      maxRedeemTotal = Math.min(maxRedeemTotal, paidBonus);
    }

    const amounts = resolved.map((item) => Math.max(0, item.amount || 0));
    const itemCaps = this.computeRedeemCaps(resolved);
    const capsTotal = itemCaps.reduce((sum, cap) => sum + cap, 0);
    maxRedeemTotal = Math.min(maxRedeemTotal, capsTotal);
    const redeemShares = this.allocateProRataWithCaps(
      amounts,
      itemCaps,
      maxRedeemTotal,
    );
    const appliedRedeem = redeemShares.reduce((sum, value) => sum + value, 0);
    const perItemMaxRedeem =
      paidBonus > 0 ? redeemShares : itemCaps;

    // Считаем начисление по позициям
    const products = resolved.map((item, idx) => {
      const qty = Math.max(0, Number(item.qty ?? 0));
      const price = Math.max(0, Number(item.price ?? 0));
      const basePrice =
        item.basePrice != null ? Math.max(0, Number(item.basePrice)) : price;
      const allowEarnAndPay =
        item.allowEarnAndPay != null ? Boolean(item.allowEarnAndPay) : true;
      const itemRedeem = redeemShares[idx] ?? 0;
      const itemMaxRedeem = perItemMaxRedeem[idx] ?? 0;
      const earnBase =
        item.accruePoints === false
          ? 0
          : Math.max(0, (item.amount || 0) - itemRedeem);
      const multiplier =
        item.promotionMultiplier && item.promotionMultiplier > 0
          ? item.promotionMultiplier
          : 1;
      const itemEarn = Math.floor((earnBase * earnBps * multiplier) / 10000);
      return {
        id_product:
          item.externalId ?? item.productId ?? item.resolvedProductId ?? null,
        name: item.name ?? null,
        price,
        base_price: basePrice,
        quantity: qty,
        qty,
        max_pay_bonus: itemMaxRedeem,
        earn_bonus: itemEarn,
        allow_earn_and_pay: allowEarnAndPay,
      };
    });

    const totalEarn = products.reduce((sum, p) => sum + p.earn_bonus, 0);
    const finalPayable = Math.max(0, total - appliedRedeem);

    return {
      products: normalized.length ? products : undefined,
      max_pay_bonus: appliedRedeem,
      bonus_value: totalEarn,
      final_payable: finalPayable,
      balance,
    };
  }

  async getBaseRatesForCustomer(
    merchantId: string,
    customerId: string,
    opts?: { outletId?: string | null; eligibleAmount?: number },
  ) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    await ensureBaseTier(this.prisma, mid).catch(() => null);
    const settings = await this.getSettings(mid);
    const eligible = Math.max(
      0,
      Math.floor(Number(opts?.eligibleAmount ?? 0) || 0),
    );
    const outletCtx = await this.resolveOutletContext(mid, {
      outletId: opts?.outletId ?? null,
    });
    const rulesFn = this.compileRules(
      mid,
      outletCtx.outletId ?? null,
      {
        earnBps: settings.earnBps,
        redeemLimitBps: settings.redeemLimitBps,
      },
      settings.rulesJson,
      settings.updatedAt,
    );
    const { earnBps: rawEarn, redeemLimitBps: rawRedeem } = rulesFn({
      channel: outletCtx.channel,
      weekday: new Date().getDay(),
      eligibleAmount: eligible,
    });
    let earnBps = Math.max(
      0,
      Math.floor(
        Number.isFinite(Number(rawEarn)) ? Number(rawEarn) : settings.earnBps,
      ),
    );
    let redeemLimitBps = Math.max(
      0,
      Math.floor(
        Number.isFinite(Number(rawRedeem))
          ? Number(rawRedeem)
          : settings.redeemLimitBps,
      ),
    );
    let tierMinPayment: number | null = null;
    try {
      const assignment = await this.prisma.loyaltyTierAssignment.findFirst({
        where: {
          merchantId: mid,
          customerId: cid,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { assignedAt: 'desc' },
      });
      let tier: any = null;
      if (assignment) {
        tier = await this.prisma.loyaltyTier.findUnique({
          where: { id: assignment.tierId },
        });
      }
      if (!tier) {
        tier = await this.prisma.loyaltyTier.findFirst({
          where: { merchantId: mid, isInitial: true },
          orderBy: { thresholdAmount: 'asc' },
        });
      }
      if (tier) {
        if (typeof tier.earnRateBps === 'number') {
          earnBps = Math.max(0, Math.floor(Number(tier.earnRateBps)));
        }
        if (typeof tier.redeemRateBps === 'number') {
          redeemLimitBps = Math.max(0, Math.floor(Number(tier.redeemRateBps)));
        }
        const meta: any = tier.metadata ?? null;
        if (meta && typeof meta === 'object') {
          const raw = meta.minPaymentAmount ?? meta.minPayment;
          if (raw != null) {
            const mp = Number(raw);
            if (Number.isFinite(mp) && mp >= 0) {
              tierMinPayment = Math.round(mp);
            }
          }
        }
      }
    } catch {}
    const toPercent = (bps: number) =>
      Math.round(Math.max(0, Number(bps) || 0)) / 100;
    return {
      earnBps,
      redeemLimitBps,
      earnPercent: toPercent(earnBps),
      redeemLimitPercent: toPercent(redeemLimitBps),
      tierMinPayment,
    };
  }

  async getCustomerAnalytics(merchantId: string, customerId: string) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    const aggregates = await fetchReceiptAggregates(this.prisma, {
      merchantId: mid,
      customerIds: [cid],
      includeImportedBase: true,
    });
    let row =
      Array.isArray(aggregates) && aggregates.length ? aggregates[0] : null;
    if (!row) {
      const stats = await this.prisma.customerStats.findUnique({
        where: { merchantId_customerId: { merchantId: mid, customerId: cid } },
      });
      if (stats) {
        row = {
          customerId: cid,
          visits: Number(stats.visits ?? 0),
          totalSpent: Number(stats.totalSpent ?? 0),
          firstPurchaseAt: stats.firstSeenAt ?? null,
          lastPurchaseAt:
            stats.lastOrderAt ?? stats.lastSeenAt ?? stats.firstSeenAt ?? null,
        };
      }
    }
    const visitCount = row?.visits ?? 0;
    const totalAmount = Math.max(0, Number(row?.totalSpent ?? 0));
    const avgBillRaw =
      visitCount > 0 ? Math.max(0, totalAmount) / visitCount : 0;
    const avgBill = Math.round(avgBillRaw * 100) / 100;
    const firstDate = row?.firstPurchaseAt ?? null;
    const lastDate = row?.lastPurchaseAt ?? firstDate;
    let visitFrequency = 0;
    if (visitCount > 0 && firstDate) {
      const endDate = lastDate ?? firstDate;
      const spanDays = Math.max(
        1,
        Math.round((endDate.getTime() - firstDate.getTime()) / 86_400_000) + 1,
      );
      visitFrequency = (visitCount / spanDays) * 30; // визитов в среднем за 30 дней
    }
    const visitFrequencyRounded = Math.round(visitFrequency * 100) / 100;
    return {
      bDate: firstDate ? firstDate.toISOString() : null,
      visitCount,
      totalAmount,
      avgBill,
      visitFrequency: visitFrequencyRounded,
    };
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
    let receipt = null as any;
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
    const deviceCtx = await this.resolveDeviceContext(
      merchantId,
      params.deviceId ?? null,
      receipt.outletId ?? null,
    );
    const refundOutletId = receipt.outletId ?? deviceCtx?.outletId ?? null;
    const refundDeviceId = deviceCtx?.id ?? receipt.deviceId ?? null;

    const pointsToRestore = Math.max(0, Math.round(receipt.redeemApplied || 0));
    const pointsToRevoke = Math.max(0, Math.round(receipt.earnApplied || 0));
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

    const merchantContext = await this.ensureCustomerContext(
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
          tx.metadata && typeof tx.metadata === 'object'
            ? (tx.metadata as any)
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
      if (pointsToRestore > 0) {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: fresh!.balance + pointsToRestore },
        });
        const restoreTx = await tx.transaction.create({
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
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.unconsumeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRestore,
            { orderId: receipt.orderId },
          );
        }
        if (process.env.LEDGER_FEATURE === '1') {
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
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: fresh!.balance - pointsToRevoke },
        });
        const revokeTx = await tx.transaction.create({
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
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.revokeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRevoke,
            { orderId: receipt.orderId },
          );
        }
        if (process.env.LEDGER_FEATURE === '1') {
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

      await tx.receipt.update({
        where: { id: receipt.id },
        data: { canceledAt: operationDateObj },
      });
      await tx.eventOutbox.create({
        data: {
          merchantId,
          eventType: 'loyalty.refund',
          createdAt: operationDateObj,
          payload: {
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
          } as any,
        },
      });
      try {
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
      } catch {}
      try {
        await this.staffMotivation.recordRefund(tx, {
          merchantId,
          orderId: receipt.orderId,
          eventAt: operationDateObj,
          share: 1,
        });
      } catch {}
      try {
        await this.recomputeTierProgress(tx, {
          merchantId,
          customerId: receipt.customerId,
        });
      } catch {}
      return {
        ok: true,
        share: 1,
        pointsRestored: pointsToRestore,
        pointsRevoked: pointsToRevoke,
        customerId: merchantContext.customerId,
      };
    });
  }

  async getStaffMotivationConfig(merchantId: string) {
    return this.staffMotivation.getSettings(this.prisma, merchantId);
  }

  async getStaffMotivationLeaderboard(
    merchantId: string,
    options?: { outletId?: string | null; limit?: number },
  ) {
    return this.staffMotivation.getLeaderboard(merchantId, options);
  }

  async outletTransactions(
    merchantId: string,
    outletId: string,
    limit = 20,
    before?: Date,
  ) {
    const allowSameReceipt = await this.isAllowSameReceipt(merchantId);
    const formatStaff = (staff?: {
      firstName?: string | null;
      lastName?: string | null;
      login?: string | null;
    }): string | null => {
      if (!staff) return null;
      const name = [staff.firstName, staff.lastName]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      return name || staff.login?.trim() || null;
    };
    const formatCustomer = (customer?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    }): string | null => {
      if (!customer) return null;
      return (
        customer.name?.trim() ||
        customer.phone?.trim() ||
        customer.email?.trim() ||
        null
      );
    };
    const hardLimit = Math.min(Math.max(limit, 1), 100);
    const whereTx: any = {
      merchantId,
      outletId,
      canceledAt: null,
      type: { in: [TxnType.EARN, TxnType.REDEEM, TxnType.REFUND] },
    };
    if (before) whereTx.createdAt = { lt: before };

    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        outlet: { select: { name: true } },
        staff: { select: { firstName: true, lastName: true, login: true } },
        customer: { select: { name: true, phone: true, email: true } },
      },
    });

    const orderIdsForReceipts = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const receiptMetaByOrderId = new Map<
      string,
      {
        receiptNumber: string | null;
        createdAt: string;
        total: number;
        earnApplied: number;
        redeemApplied: number;
        staffName: string | null;
        customerName: string | null;
        outletName: string | null;
      }
    >();
    if (orderIdsForReceipts.length > 0) {
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: orderIdsForReceipts } },
        select: {
          orderId: true,
          receiptNumber: true,
          createdAt: true,
          total: true,
          earnApplied: true,
          redeemApplied: true,
          outlet: { select: { name: true, code: true } },
          staff: { select: { firstName: true, lastName: true, login: true } },
          customer: { select: { name: true, phone: true, email: true } },
        },
      });
      for (const receipt of receipts) {
        if (!receipt.orderId) continue;
        const key = receipt.orderId;
        const normalized =
          typeof receipt.receiptNumber === 'string' &&
          receipt.receiptNumber.trim().length > 0
            ? receipt.receiptNumber.trim()
            : null;
        receiptMetaByOrderId.set(key, {
          receiptNumber: normalized,
          createdAt: receipt.createdAt.toISOString(),
          total: Number(receipt.total ?? 0),
          earnApplied: Math.max(0, Number(receipt.earnApplied ?? 0)),
          redeemApplied: Math.max(0, Number(receipt.redeemApplied ?? 0)),
          staffName: formatStaff(receipt.staff ?? undefined),
          customerName: formatCustomer(receipt.customer ?? undefined),
          outletName:
            receipt.outlet?.name?.trim() ||
            receipt.outlet?.code?.trim() ||
            null,
        });
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      return {
        id: entity.id,
        mode: 'TXN' as const,
        type: entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId
          ? (receiptMetaByOrderId.get(orderId)?.receiptNumber ?? null)
          : null,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        outletName: entity.outlet?.name ?? null,
        purchaseAmount: orderId
          ? (receiptMetaByOrderId.get(orderId)?.total ?? null)
          : null,
        earnApplied: orderId
          ? (receiptMetaByOrderId.get(orderId)?.earnApplied ?? null)
          : null,
        redeemApplied: orderId
          ? (receiptMetaByOrderId.get(orderId)?.redeemApplied ?? null)
          : null,
        staffName:
          formatStaff(entity.staff ?? undefined) ||
          receiptMetaByOrderId.get(orderId ?? '')?.staffName ||
          null,
        customerName:
          formatCustomer(entity.customer ?? undefined) ||
          receiptMetaByOrderId.get(orderId ?? '')?.customerName ||
          null,
      };
    });

    // агрегируем покупки и возвраты по чеку
    const purchaseEntries = Array.from(receiptMetaByOrderId.entries()).map(
      ([orderId, meta]) => {
        const change = (meta.earnApplied ?? 0) - (meta.redeemApplied ?? 0);
        return {
          id: `purchase:${orderId}`,
          mode: 'PURCHASE' as const,
          type: null,
          amount: change,
          orderId,
          receiptNumber: meta.receiptNumber ?? null,
          createdAt: meta.createdAt,
          outletId,
          outletName: meta.outletName ?? null,
          purchaseAmount: meta.total ?? null,
          earnApplied: meta.earnApplied ?? null,
          redeemApplied: meta.redeemApplied ?? null,
          refundEarn: null,
          refundRedeem: null,
          staffName: meta.staffName ?? null,
          customerName: meta.customerName ?? null,
        };
      },
    );

    const refundGrouped = new Map<
      string,
      {
        earn: number;
        redeem: number;
        createdAt: string;
        receiptNumber: string | null;
        staffName: string | null;
        customerName: string | null;
      }
    >();
    for (const tx of normalizedTxs) {
      if (tx.type !== TxnType.REFUND) continue;
      const orderId = tx.orderId ?? 'unknown';
      const group =
        refundGrouped.get(orderId) ??
        ({
          earn: 0,
          redeem: 0,
          createdAt: tx.createdAt,
          receiptNumber: tx.receiptNumber ?? null,
          staffName: tx.staffName ?? null,
          customerName: tx.customerName ?? null,
        } as any);
      const amount = Number(tx.amount ?? 0);
      if (amount > 0) group.redeem += amount;
      else if (amount < 0) group.earn += Math.abs(amount);
      if (tx.createdAt > group.createdAt) group.createdAt = tx.createdAt;
      if (!group.receiptNumber && tx.receiptNumber)
        group.receiptNumber = tx.receiptNumber;
      if (!group.staffName && tx.staffName) group.staffName = tx.staffName;
      if (!group.customerName && tx.customerName)
        group.customerName = tx.customerName;
      refundGrouped.set(orderId, group);
    }

    const refundEntries = Array.from(refundGrouped.entries()).map(
      ([orderId, meta]) => {
        const receiptMeta = receiptMetaByOrderId.get(orderId);
        const purchaseAmount = receiptMeta?.total ?? null;
        return {
          id: `refund:${orderId}`,
          mode: 'REFUND' as const,
          type: null,
          amount: (meta.redeem ?? 0) - (meta.earn ?? 0),
          orderId: orderId === 'unknown' ? null : orderId,
          receiptNumber:
            meta.receiptNumber ?? receiptMeta?.receiptNumber ?? null,
          createdAt: meta.createdAt,
          outletId,
          outletName: receiptMeta?.outletName ?? null,
          purchaseAmount,
          earnApplied: null,
          redeemApplied: null,
          refundEarn: meta.earn ?? 0,
          refundRedeem: meta.redeem ?? 0,
          staffName: meta.staffName ?? receiptMeta?.staffName ?? null,
          customerName: meta.customerName ?? receiptMeta?.customerName ?? null,
        };
      },
    );

    const isolatedTx = normalizedTxs.filter(
      (tx) =>
        tx.mode === 'TXN' &&
        (!tx.orderId || !receiptMetaByOrderId.has(tx.orderId)),
    );

    const merged = [...purchaseEntries, ...refundEntries, ...isolatedTx].sort(
      (a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const sliced = merged.slice(0, hardLimit);
    const nextBefore =
      sliced.length > 0 ? sliced[sliced.length - 1].createdAt : null;
    return { items: sliced, nextBefore, allowSameReceipt };
  }

  async transactions(
    merchantId: string,
    customerId: string,
    limit = 20,
    before?: Date,
    filters?: { outletId?: string | null; staffId?: string | null },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId)
      throw new BadRequestException('customer not found');
    const hardLimit = Math.min(Math.max(limit, 1), 100);
    const now = new Date();

    // 1) Обычные транзакции
    const whereTx: any = { merchantId, customerId };
    if (before) whereTx.createdAt = { lt: before };
    if (filters?.outletId) whereTx.outletId = filters.outletId;
    if (filters?.staffId) whereTx.staffId = filters.staffId;
    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        outlet: { select: { posType: true, posLastSeenAt: true } },
        device: { select: { code: true } },
        reviews: { select: { id: true, rating: true, createdAt: true } },
      },
    });

    // Отмеченные закрытые окна отзыва (кросс-девайс подавление показа)
    const reviewDismissedByTxId = new Map<string, string>();
    const txIds = txItems.map((item) => item.id).filter(Boolean);
    if (txIds.length > 0) {
      try {
        const records =
          (await (this.prisma as any)?.loyaltyRealtimeEvent?.findMany?.({
            where: {
              merchantId,
              customerId,
              transactionId: { in: txIds },
              eventType: 'loyalty.review.dismissed',
            },
            select: {
              transactionId: true,
              emittedAt: true,
              createdAt: true,
              updatedAt: true,
              payload: true,
            },
          })) || [];
        const normalizeDate = (value: any): string | null => {
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'string' && value.trim()) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
          }
          return null;
        };
        for (const record of records) {
          if (!record?.transactionId) continue;
          const payload =
            record && typeof record.payload === 'object'
              ? record.payload
              : null;
          const ts =
            normalizeDate(payload?.dismissedAt) ||
            normalizeDate(record.emittedAt) ||
            normalizeDate(record.updatedAt) ||
            normalizeDate(record.createdAt);
          if (!ts) continue;
          const existing = reviewDismissedByTxId.get(record.transactionId);
          if (!existing || ts > existing) {
            reviewDismissedByTxId.set(record.transactionId, ts);
          }
        }
      } catch {}
    }

    // 2) «Отложенные начисления» (EarnLot.status = PENDING)
    const whereLots: any = { merchantId, customerId, status: 'PENDING' };
    if (before) whereLots.createdAt = { lt: before };
    if (filters?.outletId) whereLots.outletId = filters.outletId;
    if (filters?.staffId) whereLots.staffId = filters.staffId;
    const pendingLots = await this.prisma.earnLot.findMany({
      where: whereLots,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      select: {
        id: true,
        merchantId: true,
        customerId: true,
        points: true,
        orderId: true,
        outletId: true,
        staffId: true,
        createdAt: true,
        maturesAt: true,
        device: { select: { code: true } },
      },
    });
    // Подтянем outlet данные одним запросом
    const outletIds = Array.from(
      new Set(pendingLots.map((l) => l.outletId).filter(Boolean)),
    ) as string[];
    const outletsMap = new Map<
      string,
      { posType: any; posLastSeenAt: Date | null }
    >();
    if (outletIds.length > 0) {
      const outlets = await this.prisma.outlet.findMany({
        where: { id: { in: outletIds } },
        select: { id: true, posType: true, posLastSeenAt: true },
      });
      for (const o of outlets)
        outletsMap.set(o.id, {
          posType: o.posType,
          posLastSeenAt: o.posLastSeenAt ?? null,
        });
    }

    const orderIdsForReceipts = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const receiptMetaByOrderId = new Map<
      string,
      { receiptNumber: string | null; createdAt: string }
    >();
    if (orderIdsForReceipts.length > 0) {
      const receipts = await this.prisma.receipt.findMany({
        where: { merchantId, orderId: { in: orderIdsForReceipts } },
        select: { orderId: true, receiptNumber: true, createdAt: true },
      });
      for (const receipt of receipts) {
        if (!receipt.orderId) continue;
        const key = receipt.orderId;
        const normalized =
          typeof receipt.receiptNumber === 'string' &&
          receipt.receiptNumber.trim().length > 0
            ? receipt.receiptNumber.trim()
            : null;
        receiptMetaByOrderId.set(key, {
          receiptNumber: normalized,
          createdAt: receipt.createdAt.toISOString(),
        });
      }
    }

    // 3) Нормализация
    const refundOrderIds = Array.from(
      new Set(
        txItems
          .map((entity) => {
            if (entity.type !== TxnType.REFUND) return null;
            if (typeof entity.orderId !== 'string') return null;
            const trimmed = entity.orderId.trim();
            return trimmed.length > 0 ? trimmed : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const refundOriginsByOrderId = new Map<string, string>();
    for (const order of refundOrderIds) {
      const meta = receiptMetaByOrderId.get(order);
      if (meta?.createdAt) {
        refundOriginsByOrderId.set(order, meta.createdAt);
      }
    }
    const fallbackOriginsByOrderId = new Map<string, string>();
    for (const entity of txItems) {
      if (entity.type === TxnType.REFUND) continue;
      if (typeof entity.orderId !== 'string') continue;
      const trimmed = entity.orderId.trim();
      if (!trimmed) continue;
      const iso = entity.createdAt.toISOString();
      const existing = fallbackOriginsByOrderId.get(trimmed);
      if (!existing || iso < existing) {
        fallbackOriginsByOrderId.set(trimmed, iso);
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      const metadata =
        entity &&
        typeof (entity as any)?.metadata === 'object' &&
        (entity as any)?.metadata
          ? ((entity as any).metadata as Record<string, any>)
          : null;
      const rawSource =
        typeof metadata?.source === 'string' &&
        metadata.source.trim().length > 0
          ? metadata.source.trim()
          : null;
      const source = rawSource ? rawSource.toUpperCase() : null;
      const comment =
        typeof metadata?.comment === 'string' &&
        metadata.comment.trim().length > 0
          ? metadata.comment.trim()
          : null;

      return {
        id: entity.id,
        type:
          entity.orderId === 'registration_bonus'
            ? ('REGISTRATION' as any)
            : entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId
          ? (receiptMetaByOrderId.get(orderId)?.receiptNumber ?? null)
          : null,
        customerId: entity.customerId,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        outletPosType: entity.outlet?.posType ?? null,
        outletLastSeenAt: entity.outlet?.posLastSeenAt
          ? entity.outlet.posLastSeenAt.toISOString()
          : null,
        staffId: entity.staffId ?? null,
        deviceId: entity.device?.code ?? null,
        reviewId: entity.reviews?.[0]?.id ?? null,
        reviewRating: entity.reviews?.[0]?.rating ?? null,
        reviewCreatedAt: entity.reviews?.[0]?.createdAt
          ? entity.reviews[0].createdAt.toISOString()
          : null,
        reviewDismissedAt: reviewDismissedByTxId.get(entity.id) ?? null,
        pending: undefined,
        maturesAt: undefined,
        daysUntilMature: undefined,
        source,
        comment,
        canceledAt: entity.canceledAt ? entity.canceledAt.toISOString() : null,
        relatedOperationAt:
          entity.type === TxnType.REFUND && orderId
            ? (refundOriginsByOrderId.get(orderId) ??
              fallbackOriginsByOrderId.get(orderId) ??
              null)
            : null,
      };
    });

    const normalizedPending = pendingLots.map((lot) => {
      const outlet = lot.outletId ? outletsMap.get(lot.outletId) : null;
      const mat = lot.maturesAt ?? null;
      const daysUntil = mat
        ? Math.max(
            0,
            Math.ceil((mat.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
          )
        : null;
      return {
        id: `lot:${lot.id}`,
        type: lot.orderId === 'registration_bonus' ? 'REGISTRATION' : 'EARN',
        amount: lot.points,
        orderId: lot.orderId ?? null,
        customerId: lot.customerId,
        createdAt: lot.createdAt.toISOString(),
        outletId: lot.outletId ?? null,
        outletPosType: outlet?.posType ?? null,
        outletLastSeenAt: outlet?.posLastSeenAt
          ? outlet.posLastSeenAt.toISOString()
          : null,
        staffId: lot.staffId ?? null,
        deviceId: lot.device?.code ?? null,
        reviewId: null,
        reviewRating: null,
        reviewCreatedAt: null,
        pending: true,
        maturesAt: mat ? mat.toISOString() : null,
        daysUntilMature: daysUntil,
        source: null,
        comment: null,
        canceledAt: null,
        relatedOperationAt: null,
        reviewDismissedAt: null,
      };
    });

    // 4) Слияние, сортировка, пагинация
    const merged = [...normalizedTxs, ...normalizedPending].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const sliced = merged.slice(0, hardLimit);
    const nextBefore =
      sliced.length > 0 ? sliced[sliced.length - 1].createdAt : null;
    return { items: sliced, nextBefore };
  }

  // После рефактора Customer = per-merchant модель
  private async ensureCustomerContext(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerContext> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, merchantId: true },
    });
    if (!customer || customer.merchantId !== merchantId) {
      throw new BadRequestException('customer not found');
    }
    return { customerId: customer.id };
  }

  private async ensureCustomerByTelegram(
    merchantId: string,
    tgId: string,
    _initData?: string,
  ): Promise<{ customerId: string }> {
    const existing = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
      select: { id: true },
    });
    if (existing) {
      return { customerId: existing.id };
    }
    const customer = await this.prisma.customer.create({
      data: {
        merchantId,
        tgId,
      },
      select: { id: true },
    });
    return { customerId: customer.id };
  }

  private async refreshTierAssignmentIfExpired(
    tx: any,
    merchantId: string,
    customerId: string,
  ) {
    const expired = await tx.loyaltyTierAssignment.findFirst({
      where: {
        merchantId,
        customerId,
        expiresAt: { lte: new Date() },
      },
    });
    if (expired) {
      await this.recomputeTierProgress(tx, { merchantId, customerId });
    }
  }

  private async isAllowSameReceipt(merchantId: string): Promise<boolean> {
    let allowSame = true;
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      });
      const rules =
        settings && typeof settings.rulesJson === 'object'
          ? (settings.rulesJson as Record<string, any>)
          : null;
      if (
        rules &&
        Object.prototype.hasOwnProperty.call(rules, 'allowSameReceipt')
      ) {
        allowSame = Boolean((rules as any).allowSameReceipt);
      } else if (
        rules &&
        Object.prototype.hasOwnProperty.call(
          rules,
          'allowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = Boolean((rules as any).allowEarnRedeemSameReceipt);
      } else if (
        rules &&
        Object.prototype.hasOwnProperty.call(
          rules,
          'disallowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = !(rules as any).disallowEarnRedeemSameReceipt;
      }
    } catch {}
    return allowSame;
  }

  private async recomputeTierProgress(
    tx: any,
    params: { merchantId: string; customerId: string },
  ) {
    const periodDays = DEFAULT_LEVELS_PERIOD_DAYS;
    const metric: 'earn' | 'redeem' | 'transactions' = DEFAULT_LEVELS_METRIC;
    const tiers = await tx.loyaltyTier.findMany({
      where: { merchantId: params.merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const visibleTiers = tiers.filter((tier: any) => !tier?.isHidden);
    if (!visibleTiers.length) return;
    const levelRules = visibleTiers.map((tier: any) => toLevelRule(tier));
    const { value } = await computeLevelState({
      prisma: tx,
      merchantId: params.merchantId,
      customerId: params.customerId,
      config: {
        periodDays,
        metric,
        levels: levelRules,
      },
      includeCanceled: false,
      includeRefunds: true,
    });
    await this.promoteTierIfEligible(tx, {
      merchantId: params.merchantId,
      customerId: params.customerId,
      progress: value,
      levelRules,
      tiers: visibleTiers,
    });
  }

  private async promoteTierIfEligible(
    tx: any,
    params: {
      merchantId: string;
      customerId: string;
      progress: number;
      levelRules?: LevelRule[];
      tiers?: Array<any>;
    },
  ) {
    const tiers =
      params.tiers ??
      (await tx.loyaltyTier.findMany({
        where: { merchantId: params.merchantId },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      }));
    if (!tiers.length) return;
    const visibleTiers = tiers.filter((tier: any) => !tier?.isHidden);
    if (!visibleTiers.length) return;
    const levelRules =
      params.levelRules ?? visibleTiers.map((tier: any) => toLevelRule(tier));
    const targetIndex = (() => {
      let idx = -1;
      for (let i = 0; i < levelRules.length; i += 1) {
        if (params.progress >= levelRules[i].threshold) idx = i;
        else break;
      }
      return idx;
    })();
    const target =
      targetIndex >= 0 ? (visibleTiers[targetIndex] ?? null) : null;
    if (!target) return;
    const currentAssign = await tx.loyaltyTierAssignment.findFirst({
      where: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { assignedAt: 'desc' },
      include: { tier: true },
    });
    if (currentAssign?.tier?.isHidden) return;
    if (currentAssign?.tierId === target.id) return;
    const assignedAt = new Date();
    await tx.loyaltyTierAssignment.upsert({
      where: {
        merchantId_customerId: {
          merchantId: params.merchantId,
          customerId: params.customerId,
        },
      },
      update: {
        tierId: target.id,
        assignedAt,
        expiresAt: null,
        source: 'auto',
      },
      create: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        tierId: target.id,
        assignedAt,
        expiresAt: null,
        source: 'auto',
      },
    });
    try {
      await tx.eventOutbox.create({
        data: {
          merchantId: params.merchantId,
          eventType: 'loyalty.tier.promoted',
          payload: {
            merchantId: params.merchantId,
            customerId: params.customerId,
            tierId: target.id,
            at: assignedAt.toISOString(),
          },
        },
      });
    } catch {}
  }
}
