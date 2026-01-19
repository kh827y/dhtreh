import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { fetchReceiptAggregates } from '../../shared/common/receipt-aggregates.util';
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
  normalizeLevelsPeriodDays,
  type LevelRule,
} from './levels.util';
import { ensureBaseTier, toLevelRule } from './tier-defaults.util';
import {
  StaffMotivationEngine,
  type StaffMotivationSettingsNormalized,
} from '../staff-motivation/staff-motivation.engine';
import { planConsume, planRevoke, planUnconsume } from './lots.util';
import {
  HoldStatus,
  TxnType,
  WalletType,
  LedgerAccount,
  HoldMode,
  Prisma,
  PromotionStatus,
  PromotionRewardType,
  LoyaltyTier,
  Receipt,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeDeviceCode } from '../../shared/devices/device.util';

type QrMeta =
  | { jti: string; iat: number; exp: number; kind?: 'jwt' | 'short' }
  | undefined;

type CustomerContext = {
  customerId: string;
  accrualsBlocked: boolean;
  redemptionsBlocked: boolean;
};

type IntegrationBonusParams = {
  merchantId: string;
  customerId: string;
  userToken?: string | null;
  invoiceNum?: string | null;
  idempotencyKey: string;
  total?: number | null;
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
  name?: string;
  qty: number;
  price: number;
  basePrice?: number;
  accruePoints?: boolean;
  actionIds?: string[];
  actionNames?: string[];
};

type ResolvedPosition = PositionInput & {
  amount: number;
  categoryId?: string | null;
  resolvedProductId?: string | null;
  resolvedCategoryId?: string | null;
  promotionId?: string | null;
  promotionMultiplier: number;
  earnPoints?: number;
  redeemAmount?: number;
  accruePoints: boolean;
  redeemPercent?: number;
  basePrice?: number;
  allowEarnAndPay?: boolean;
  pointPromotions?: ActivePromotionRule[];
  appliedPromotionIds?: string[];
  appliedPointPromotionId?: string | null;
  promotionPointsBonus?: number;
};

type ActivePromotionRule = {
  id: string;
  name: string;
  kind: 'POINTS_MULTIPLIER' | 'NTH_FREE' | 'FIXED_PRICE';
  pointsRuleType?: 'multiplier' | 'percent' | 'fixed';
  pointsValue?: number;
  segmentId?: string | null;
  usageLimit?:
    | 'unlimited'
    | 'once_per_client'
    | 'once_per_day'
    | 'once_per_week'
    | 'once_per_month'
    | null;
  buyQty?: number;
  freeQty?: number;
  fixedPrice?: number;
  productIds: Set<string>;
  categoryIds: Set<string>;
};

type PrismaTx = Prisma.TransactionClient;
type PrismaClientLike = PrismaTx | PrismaService;
type OptionalModelsClient = PrismaClientLike & {
  merchantSettings?: PrismaService['merchantSettings'];
  earnLot?: PrismaService['earnLot'];
  loyaltyRealtimeEvent?: {
    findMany?: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
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
    const context = await this.ensureCustomerContext(merchantId, customerId);
    if (context.accrualsBlocked) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
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
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
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
    const normalizeStr = (value: unknown) =>
      typeof value === 'string' && value.trim().length
        ? value.trim()
        : undefined;
    const normalizeArray = (value: unknown) => {
      if (!Array.isArray(value)) return undefined;
      const sanitized = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
      return sanitized.length ? sanitized : undefined;
    };
    const parseBool = (value: unknown): boolean | undefined => {
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
      const record = entry as Record<string, unknown>;
      const qtyRaw = Number(record.qty ?? 0);
      const priceRaw = Number(record.price ?? 0);
      const basePriceRaw = Number(record.base_price ?? record.basePrice ?? NaN);
      const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      const price = Number.isFinite(priceRaw) ? priceRaw : 0;
      const basePrice =
        Number.isFinite(basePriceRaw) && basePriceRaw >= 0
          ? basePriceRaw
          : undefined;
      if (qty <= 0 || price < 0) continue;
      items.push({
        productId: normalizeStr(record.productId),
        externalId:
          normalizeStr(record.externalId) ?? normalizeStr(record.id_product),
        name: normalizeStr(record.name),
        qty,
        price: Math.max(0, price),
        basePrice,
        accruePoints: parseBool(
          record.accruePoints ??
            record.accrue_points ??
            record.allowAccrue ??
            record.earn_bonus ??
            record.eligible,
        ),
        actionIds: normalizeArray(
          record.actions ??
            record.actions_id ??
            record.action_ids ??
            record.actionIds ??
            record.actionsIds,
        ),
        actionNames: normalizeArray(
          record.action_names ??
            record.actions_names ??
            record.actionNames ??
            record.actionsNames,
        ),
      });
    }
    return items;
  }

  private normalizeUsageLimit(
    value: unknown,
  ):
    | 'unlimited'
    | 'once_per_client'
    | 'once_per_day'
    | 'once_per_week'
    | 'once_per_month'
    | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'unlimited' ||
      normalized === 'once_per_client' ||
      normalized === 'once_per_day' ||
      normalized === 'once_per_week' ||
      normalized === 'once_per_month'
    ) {
      return normalized;
    }
    return null;
  }

  private async resolvePositions(
    merchantId: string,
    items: PositionInput[],
    customerId?: string | null,
    opts?: { allowAutoPromotions?: boolean },
  ): Promise<ResolvedPosition[]> {
    const normalized = this.sanitizePositions(items);
    if (!normalized.length) return [];
    const allowAutoPromotions = opts?.allowAutoPromotions !== false;

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
    type ProductLookup = {
      id: string;
      categoryId: string | null;
      accruePoints: boolean | null;
      allowRedeem: boolean | null;
      redeemPercent: number | null;
      name: string | null;
    };
    type ProductExternalLookup = ProductLookup & { externalId: string | null };
    type ProductExternalMapping = { externalId: string; productId: string };

    const externalMappings: ProductExternalMapping[] =
      externalIds.length && this.prisma.productExternalId?.findMany
        ? await this.prisma.productExternalId
            .findMany({
              where: { merchantId, externalId: { in: externalIds } },
              select: { externalId: true, productId: true },
            })
            .catch(() => [])
        : [];
    const mappedProductIds = externalMappings
      .map((item) => item.productId)
      .filter(Boolean);
    const productIdsToFetch = Array.from(
      new Set([...productIds, ...mappedProductIds]),
    );
    const productsByIdPromise: Promise<ProductLookup[]> =
      productIdsToFetch.length
        ? this.prisma.product
            .findMany({
              where: {
                merchantId,
                id: { in: productIdsToFetch },
                deletedAt: null,
              },
              select: {
                id: true,
                categoryId: true,
                name: true,
                accruePoints: true,
                allowRedeem: true,
                redeemPercent: true,
              },
            })
            .catch(() => [] as ProductLookup[])
        : Promise.resolve([] as ProductLookup[]);
    const productsByExternalIdPromise: Promise<ProductExternalLookup[]> =
      externalIds.length
        ? this.prisma.product
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
            .catch(() => [] as ProductExternalLookup[])
        : Promise.resolve([] as ProductExternalLookup[]);
    const promotionsPromise = this.loadActivePromotionRules(
      merchantId,
      new Date(),
    );
    const [productsById, productsByExternalId, promotionsRaw] =
      await Promise.all([
        productsByIdPromise,
        productsByExternalIdPromise,
        promotionsPromise,
      ]);
    const promotions = await this.filterPromotionsForCustomer({
      merchantId,
      promotions: promotionsRaw,
      customerId,
    });
    const pointPromotions = promotions.filter(
      (promo) => promo.kind === 'POINTS_MULTIPLIER',
    );
    const matchesPromotion = (
      promo: ActivePromotionRule,
      productId?: string | null,
      categoryId?: string | null,
    ) => {
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
      return matchesProduct || matchesCategory || appliesAll;
    };

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
    productsById.forEach((p) =>
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
    productsByExternalId.forEach((p) => {
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
    externalMappings.forEach((mapping) => {
      const extId = mapping.externalId;
      const productId = mapping.productId;
      if (!extId || productByExtMap.has(extId)) return;
      const product = productByIdMap.get(productId);
      if (!product) return;
      productByExtMap.set(extId, product);
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
      const productInfo: ProductLookup | undefined =
        (productId && productByIdMap.get(productId)) ||
        (extKey ? productByExtMap.get(extKey) : undefined);
      const categoryId = productInfo?.categoryId || null;
      const requestedIds = new Set(
        Array.isArray(item.actionIds)
          ? item.actionIds
              .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
              .filter(Boolean)
          : [],
      );
      const requestedNames = new Set(
        Array.isArray(item.actionNames)
          ? item.actionNames
              .map((entry) =>
                typeof entry === 'string' ? entry.trim().toLowerCase() : '',
              )
              .filter(Boolean)
          : [],
      );
      const hasRequestedPromos =
        requestedIds.size > 0 || requestedNames.size > 0;
      const isRequestedPromo = (promo: ActivePromotionRule) =>
        requestedIds.has(promo.id) ||
        (promo.name &&
          requestedNames.has(String(promo.name).trim().toLowerCase()));
      const shouldApplyPromos = hasRequestedPromos || allowAutoPromotions;
      const applicablePromos = shouldApplyPromos
        ? promotions
            .filter((promo) => {
              if (!matchesPromotion(promo, productId, categoryId)) return false;
              if (hasRequestedPromos && !isRequestedPromo(promo)) return false;
              return true;
            })
            .sort(
              (a, b) =>
                (
                  ({
                    FIXED_PRICE: 1,
                    NTH_FREE: 2,
                    POINTS_MULTIPLIER: 3,
                  }) as const
                )[a.kind] -
                (
                  {
                    FIXED_PRICE: 1,
                    NTH_FREE: 2,
                    POINTS_MULTIPLIER: 3,
                  } as const
                )[b.kind],
            )
        : [];
      const appliedPromos: ActivePromotionRule[] = [];
      for (const promo of applicablePromos) {
        if (promo.kind === 'POINTS_MULTIPLIER') {
          appliedPromos.push(promo);
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
            appliedPromos.push(promo);
          }
          continue;
        }
        if (promo.kind === 'FIXED_PRICE') {
          appliedPromos.push(promo);
        }
      }
      const applicablePointPromos = shouldApplyPromos
        ? pointPromotions.filter((promo) => {
            if (!matchesPromotion(promo, productId, categoryId)) return false;
            if (hasRequestedPromos && !isRequestedPromo(promo)) return false;
            return true;
          })
        : [];
      const accruePoints =
        item.accruePoints != null
          ? Boolean(item.accruePoints)
          : productInfo?.accruePoints !== false;
      const allowEarnAndPay = productInfo?.allowRedeem !== false;
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
        promotionId: null,
        promotionMultiplier: 1,
        pointPromotions: applicablePointPromos,
        appliedPromotionIds: appliedPromos.length
          ? appliedPromos.map((promo) => promo.id)
          : undefined,
        earnPoints: 0,
        redeemAmount: 0,
        accruePoints,
        allowEarnAndPay,
        redeemPercent: Number.isFinite(productInfo?.redeemPercent)
          ? Number(productInfo?.redeemPercent)
          : 100,
        price: Math.max(0, item.price),
        basePrice:
          item.basePrice != null
            ? Math.max(0, Number(item.basePrice))
            : Math.max(0, Number(item.price)),
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
          AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
        },
      })
      .catch(() => []);
    const rules: ActivePromotionRule[] = [];
    const toRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const pushAll = (value: unknown, target: Set<string>) => {
      if (!Array.isArray(value)) return;
      value.forEach((v) => {
        if (typeof v === 'string' && v.trim()) target.add(v.trim());
      });
    };
    for (const promo of promos) {
      const meta = toRecord(promo.rewardMetadata);
      const promoMeta = toRecord(promo.metadata);
      const productIds = new Set<string>();
      const categoryIds = new Set<string>();
      pushAll(meta.productIds, productIds);
      pushAll(meta.categoryIds, categoryIds);
      const hasTargets = productIds.size > 0 || categoryIds.size > 0;

      const kindRaw =
        typeof meta.kind === 'string' ? meta.kind.toUpperCase() : '';
      const pointsRuleTypeRaw =
        typeof meta.pointsRuleType === 'string'
          ? meta.pointsRuleType.toLowerCase()
          : '';
      let kind: ActivePromotionRule['kind'] | null = null;
      let pointsRuleType: ActivePromotionRule['pointsRuleType'] | undefined;
      let pointsValue: number | undefined;
      let buyQty: number | undefined;
      let freeQty: number | undefined;
      let fixedPrice: number | undefined;

      if (promo.rewardType === PromotionRewardType.POINTS) {
        if (!hasTargets) {
          continue;
        }
        if (
          pointsRuleTypeRaw !== 'multiplier' &&
          pointsRuleTypeRaw !== 'percent' &&
          pointsRuleTypeRaw !== 'fixed'
        ) {
          continue;
        }
        const rawValue = Number(meta.pointsValue);
        if (!Number.isFinite(rawValue) || rawValue <= 0) continue;
        const normalized =
          pointsRuleTypeRaw === 'fixed' ? Math.floor(rawValue) : rawValue;
        if (!Number.isFinite(normalized) || normalized <= 0) continue;
        kind = 'POINTS_MULTIPLIER';
        pointsRuleType =
          pointsRuleTypeRaw as ActivePromotionRule['pointsRuleType'];
        pointsValue = normalized;
      }

      const buyRaw = meta.buyQty;
      const freeRaw = meta.freeQty;
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
      if (kind === null && kindRaw === 'NTH_FREE' && buy !== null) {
        kind = 'NTH_FREE';
        buyQty = buy ?? 1;
        freeQty = free;
      }

      const fixedPriceRaw = meta.price;
      const fixedParsed = Number(fixedPriceRaw);
      if (
        kind === null &&
        Number.isFinite(fixedParsed) &&
        fixedParsed >= 0 &&
        kindRaw === 'FIXED_PRICE'
      ) {
        kind = 'FIXED_PRICE';
        fixedPrice = Math.max(0, fixedParsed);
      }

      if (!kind) continue;
      rules.push({
        id: promo.id,
        name: promo.name,
        kind,
        pointsRuleType,
        pointsValue,
        segmentId: promo.segmentId ?? null,
        usageLimit: this.normalizeUsageLimit(promoMeta?.usageLimit ?? null),
        buyQty,
        freeQty,
        fixedPrice,
        productIds,
        categoryIds,
      });
    }
    return rules;
  }

  private async filterPromotionsForCustomer(params: {
    merchantId: string;
    promotions: ActivePromotionRule[];
    customerId?: string | null;
  }) {
    const { merchantId, promotions } = params;
    if (!promotions.length) return promotions;
    const customerId =
      typeof params.customerId === 'string' && params.customerId.trim()
        ? params.customerId.trim()
        : null;
    if (!customerId) {
      return promotions.filter(
        (promo) =>
          !promo.segmentId &&
          (!promo.usageLimit || promo.usageLimit === 'unlimited'),
      );
    }
    await this.ensureCustomerContext(merchantId, customerId);
    const segmentIds = Array.from(
      new Set(
        promotions
          .map((promo) => promo.segmentId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const usagePromoIds = promotions
      .filter((promo) => promo.usageLimit && promo.usageLimit !== 'unlimited')
      .map((promo) => promo.id);
    type SegmentRow = {
      id: string;
      systemKey: string | null;
      isSystem: boolean | null;
      rules: Prisma.JsonValue | null;
    };
    type MembershipRow = { segmentId: string };
    type UsageRow = {
      promotionId: string;
      purchasesCount: number | null;
      lastPurchaseAt: Date | null;
    };
    const segmentsPromise: Promise<SegmentRow[]> = segmentIds.length
      ? this.prisma.customerSegment
          .findMany({
            where: { id: { in: segmentIds }, merchantId },
            select: {
              id: true,
              systemKey: true,
              isSystem: true,
              rules: true,
            },
          })
          .catch(() => [] as SegmentRow[])
      : Promise.resolve([] as SegmentRow[]);
    const membershipsPromise: Promise<MembershipRow[]> = segmentIds.length
      ? this.prisma.segmentCustomer
          .findMany({
            where: { segmentId: { in: segmentIds }, customerId },
            select: { segmentId: true },
          })
          .catch(() => [] as MembershipRow[])
      : Promise.resolve([] as MembershipRow[]);
    const usageStatsPromise: Promise<UsageRow[]> = usagePromoIds.length
      ? this.prisma.promotionParticipant
          .findMany({
            where: {
              merchantId,
              customerId,
              promotionId: { in: usagePromoIds },
            },
            select: {
              promotionId: true,
              purchasesCount: true,
              lastPurchaseAt: true,
            },
          })
          .catch(() => [] as UsageRow[])
      : Promise.resolve([] as UsageRow[]);
    const [segments, memberships, usageStats] = await Promise.all([
      segmentsPromise,
      membershipsPromise,
      usageStatsPromise,
    ]);
    const toRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const segmentAllSet = new Set(
      segments
        .filter((seg) => {
          const rules = toRecord(seg?.rules);
          return (
            seg?.systemKey === 'all-customers' ||
            (seg?.isSystem && rules.kind === 'all') ||
            rules.kind === 'all'
          );
        })
        .map((seg) => seg.id),
    );
    const memberSet = new Set(memberships.map((entry) => entry.segmentId));
    type UsageStats = { purchasesCount: number; lastPurchaseAt: Date | null };
    const usageMap = new Map<string, UsageStats>(
      usageStats.map((entry): [string, UsageStats] => [
        entry.promotionId,
        {
          purchasesCount: Number(entry.purchasesCount ?? 0),
          lastPurchaseAt: entry.lastPurchaseAt
            ? new Date(entry.lastPurchaseAt)
            : null,
        },
      ]),
    );
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const startOfMonth = new Date(
      startOfDay.getFullYear(),
      startOfDay.getMonth(),
      1,
    );
    return promotions.filter((promo) => {
      if (promo.segmentId) {
        if (segmentAllSet.has(promo.segmentId)) {
          // pass
        } else if (!memberSet.has(promo.segmentId)) {
          return false;
        }
      }
      if (promo.usageLimit && promo.usageLimit !== 'unlimited') {
        const stats = usageMap.get(promo.id);
        if (stats) {
          const hasPurchases = (stats.purchasesCount ?? 0) > 0;
          const lastPurchase = stats.lastPurchaseAt;
          if (promo.usageLimit === 'once_per_client') {
            if (hasPurchases || lastPurchase) return false;
          } else if (!lastPurchase && hasPurchases) {
            return false;
          } else if (lastPurchase) {
            if (
              promo.usageLimit === 'once_per_day' &&
              lastPurchase >= startOfDay
            ) {
              return false;
            }
            if (
              promo.usageLimit === 'once_per_week' &&
              lastPurchase >= startOfWeek
            ) {
              return false;
            }
            if (
              promo.usageLimit === 'once_per_month' &&
              lastPurchase >= startOfMonth
            ) {
              return false;
            }
          }
        }
      }
      return true;
    });
  }

  async calculateAction(params: {
    merchantId: string;
    items: PositionInput[];
    customerId?: string | null;
  }) {
    const customerId =
      typeof params.customerId === 'string' && params.customerId.trim()
        ? params.customerId.trim()
        : null;
    const resolved = await this.resolvePositions(
      params.merchantId,
      params.items,
      customerId,
    );
    if (!resolved.length) {
      return { positions: [], info: [] as string[] };
    }
    let promotions = await this.loadActivePromotionRules(
      params.merchantId,
      new Date(),
    );
    promotions = await this.filterPromotionsForCustomer({
      merchantId: params.merchantId,
      promotions,
      customerId,
    });
    const infoSet = new Set<string>();
    const priority: Record<ActivePromotionRule['kind'], number> = {
      FIXED_PRICE: 1,
      NTH_FREE: 2,
      POINTS_MULTIPLIER: 3,
    };
    const roundCurrency = (v: number) => Math.round(v * 100) / 100;

    // Используем flatMap для возможности разбиения позиций (NTH_FREE)
    const positions = resolved.flatMap((item) => {
      const idProduct =
        item.externalId ?? item.productId ?? item.resolvedProductId ?? null;
      const itemLabel = item.name ?? idProduct ?? 'товар';
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
      const appliedPromos: ActivePromotionRule[] = [];
      const appliedPromoIds = new Set<string>();
      const originalPrice = Math.max(0, Number(item.price ?? 0));
      const normalizedOriginal = roundCurrency(originalPrice);
      let unitPrice = originalPrice;

      // Для NTH_FREE: кол-во бесплатных единиц
      let freebies = 0;
      let nthFreePromoApplied = false;

      for (const promo of applicable) {
        if (promo.kind === 'POINTS_MULTIPLIER') {
          if (appliedPromoIds.has(promo.id)) continue;
          appliedPromoIds.add(promo.id);
          appliedPromos.push(promo);
          const ruleType = promo.pointsRuleType ?? 'multiplier';
          const rawValue = Number(promo.pointsValue ?? 0);
          const roundedValue =
            Number.isFinite(rawValue) && rawValue > 0
              ? Math.round(rawValue * 100) / 100
              : 0;
          const suffix =
            ruleType === 'percent' && roundedValue
              ? ` (${roundedValue}% от цены)`
              : ruleType === 'fixed' && roundedValue
                ? ` (${roundedValue} баллов)`
                : ruleType === 'multiplier' && roundedValue
                  ? ` (x${roundedValue})`
                  : '';
          infoSet.add(
            `Применена акция: ${promo.name}${suffix} для товара "${itemLabel}"`,
          );
          continue;
        }
        if (promo.kind === 'NTH_FREE') {
          if (appliedPromoIds.has(promo.id)) continue;
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
            appliedPromoIds.add(promo.id);
            appliedPromos.push(promo);
            infoSet.add(
              `Применена акция: ${promo.name} — ${freebies} шт. бесплатно для товара "${itemLabel}"`,
            );
          }
          continue;
        }
        if (promo.kind === 'FIXED_PRICE') {
          if (appliedPromoIds.has(promo.id)) continue;
          const fixed = Math.max(
            0,
            Math.min(Number.MAX_SAFE_INTEGER, promo.fixedPrice ?? unitPrice),
          );
          unitPrice = fixed;
          appliedPromoIds.add(promo.id);
          appliedPromos.push(promo);
          infoSet.add(
            `Применена акция: ${promo.name} — цена ${roundCurrency(fixed)} вместо ${normalizedOriginal} для товара "${itemLabel}"`,
          );
        }
      }

      const actionsAll = appliedPromos.map((promo) => promo.id);
      const actionNamesAll = appliedPromos.map((promo) => promo.name);
      const actionsWithoutNth = appliedPromos.filter(
        (promo) => promo.kind !== 'NTH_FREE',
      );
      const actionsPaid = actionsWithoutNth.map((promo) => promo.id);
      const actionNamesPaid = actionsWithoutNth.map((promo) => promo.name);
      const resolveBasePrice = (price: number) =>
        roundCurrency(price) !== normalizedOriginal && appliedPromos.length
          ? normalizedOriginal
          : null;

      // Если есть бесплатные позиции — разбиваем на две записи (как GMB)
      if (nthFreePromoApplied && freebies > 0 && freebies < item.qty) {
        const paidQty = item.qty - freebies;
        const result: Array<Record<string, unknown>> = [];
        // Бесплатная позиция
        result.push({
          id_product: idProduct,
          name: item.name ?? null,
          qty: freebies,
          price: 0,
          base_price: resolveBasePrice(0),
          actions: actionsAll,
          actions_names: actionNamesAll,
        });
        // Платная позиция
        result.push({
          id_product: idProduct,
          name: item.name ?? null,
          qty: paidQty,
          price: unitPrice,
          base_price: resolveBasePrice(unitPrice),
          actions: actionsPaid,
          actions_names: actionNamesPaid,
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
            base_price: resolveBasePrice(0),
            actions: actionsAll,
            actions_names: actionNamesAll,
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
          base_price: resolveBasePrice(unitPrice),
          actions: actionsAll,
          actions_names: actionNamesAll,
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
    opts?: { allowEarn?: boolean },
  ) {
    if (!items.length) return 0;
    const allowEarn = opts?.allowEarn !== false;
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
      const allowItemEarn = allowEarn && item.accruePoints !== false;
      const earnBase = allowItemEarn
        ? Math.max(0, item.amount - redeemShare)
        : 0;
      const basePoints = allowItemEarn
        ? Math.floor((earnBase * earnBps) / 10000)
        : 0;
      let itemEarn = basePoints;
      let selectedPromo: ActivePromotionRule | null = null;
      if (
        allowItemEarn &&
        item.pointPromotions &&
        item.pointPromotions.length
      ) {
        const qty = Math.max(0, Number(item.qty ?? 0));
        let bestPoints = 0;
        for (const promo of item.pointPromotions) {
          if (promo.kind !== 'POINTS_MULTIPLIER') continue;
          const ruleType = promo.pointsRuleType ?? 'multiplier';
          let points = basePoints;
          if (ruleType === 'multiplier') {
            const mult = promo.pointsValue ?? 0;
            if (mult > 0) points = Math.floor(basePoints * mult);
          } else if (ruleType === 'percent') {
            const percent = Number(promo.pointsValue ?? 0);
            if (percent > 0) {
              points = Math.floor((earnBase * percent) / 100);
            }
          } else if (ruleType === 'fixed') {
            const fixed = Number(promo.pointsValue ?? 0);
            if (fixed > 0) {
              points = Math.floor(fixed * qty);
            }
          }
          if (points > bestPoints) {
            bestPoints = points;
            selectedPromo = promo;
          }
        }
        itemEarn = Math.max(0, bestPoints);
      } else if (allowItemEarn) {
        const multiplier =
          item.promotionMultiplier && item.promotionMultiplier > 0
            ? item.promotionMultiplier
            : 1;
        itemEarn = Math.floor(basePoints * multiplier);
      } else {
        itemEarn = 0;
      }
      if (allowItemEarn && selectedPromo) {
        item.promotionId = selectedPromo.id;
        item.appliedPointPromotionId = selectedPromo.id;
        if (selectedPromo.pointsRuleType === 'multiplier') {
          const mult = selectedPromo.pointsValue ?? 1;
          item.promotionMultiplier = mult > 0 ? mult : 1;
        } else {
          item.promotionMultiplier = 1;
        }
        item.promotionPointsBonus = Math.max(0, itemEarn - basePoints);
      } else if (allowItemEarn) {
        item.promotionPointsBonus = Math.max(0, itemEarn - basePoints);
        if (!item.promotionMultiplier || item.promotionMultiplier <= 0) {
          item.promotionMultiplier = 1;
        }
      } else {
        item.promotionPointsBonus = 0;
      }
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
        metadata:
          item.basePrice != null ||
          item.appliedPromotionIds?.length ||
          item.appliedPointPromotionId ||
          item.promotionPointsBonus != null
            ? {
                basePrice: item.basePrice ?? null,
                promotionIds: item.appliedPromotionIds ?? [],
                pointPromotionId: item.appliedPointPromotionId ?? null,
                promotionPointsBonus: item.promotionPointsBonus ?? null,
              }
            : Prisma.JsonNull,
        createdAt: now,
      })),
    });
  }

  // ===== Referral rewards awarding =====
  private async applyReferralRewards(
    tx: PrismaTx,
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
    type LevelRewardConfig = {
      level?: number | null;
      reward?: number | null;
      enabled?: boolean | null;
    };
    const lvCfgArr: LevelRewardConfig[] = Array.isArray(program.levelRewards)
      ? (program.levelRewards as LevelRewardConfig[])
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
          await tx.wallet.update({
            where: { id: w.id },
            data: { balance: { increment: points } },
          });
          await tx.transaction.create({
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
      if (!parent) break;
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
    tx: PrismaTx,
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
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      const rewardMeta = reward?.metadata;
      let rollbackBuyerId: string | null = null;
      if (
        rewardMeta &&
        typeof rewardMeta === 'object' &&
        !Array.isArray(rewardMeta)
      ) {
        const rawBuyerId = (rewardMeta as Record<string, unknown>).buyerId;
        if (typeof rawBuyerId === 'string') {
          const trimmed = rawBuyerId.trim();
          if (trimmed) rollbackBuyerId = trimmed;
        } else if (
          typeof rawBuyerId === 'number' ||
          typeof rawBuyerId === 'bigint'
        ) {
          rollbackBuyerId = String(rawBuyerId);
        }
      }
      await tx.transaction.create({
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
    tx: PrismaTx,
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
    tx: PrismaTx,
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
    let resolvedOutletId = outletId;
    if (resolvedOutletId) {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: resolvedOutletId, merchantId },
        select: { id: true },
      });
      if (!outlet) resolvedOutletId = null;
    }
    let resolvedStaffId = staffId;
    if (resolvedStaffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: resolvedStaffId, merchantId },
        select: { id: true },
      });
      if (!staff) resolvedStaffId = null;
    }

    // Read registration mechanic from settings
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const rules = asRecord(settings?.rulesJson);
    const reg = asRecord(rules?.registration);
    const enabled =
      reg && Object.prototype.hasOwnProperty.call(reg, 'enabled')
        ? Boolean(reg.enabled)
        : true;
    const pointsRaw = reg && reg.points != null ? Number(reg.points) : 0;
    const points = Number.isFinite(pointsRaw)
      ? Math.max(0, Math.floor(pointsRaw))
      : 0;
    const ttlDaysRaw = reg && reg.ttlDays != null ? Number(reg.ttlDays) : null;
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw != null && ttlDaysRaw > 0
        ? Math.floor(Number(ttlDaysRaw))
        : null;
    const delayDaysRaw =
      reg && reg.delayDays != null ? Number(reg.delayDays) : 0;
    const delayHoursRaw =
      reg && reg.delayHours != null ? Number(reg.delayHours) : null;
    const delayMs =
      Number.isFinite(delayHoursRaw) &&
      delayHoursRaw != null &&
      delayHoursRaw > 0
        ? Math.floor(Number(delayHoursRaw)) * 60 * 60 * 1000
        : Number.isFinite(delayDaysRaw) &&
            delayDaysRaw != null &&
            delayDaysRaw > 0
          ? Math.floor(Number(delayDaysRaw)) * 24 * 60 * 60 * 1000
          : 0;

    // Если клиент приглашён по рефералу и у активной программы выключено суммирование с регистрацией — запрещаем выдачу
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

    if (!enabled || points <= 0) {
      throw new BadRequestException(
        'registration bonus disabled or zero points',
      );
    }

    const enabledAtRaw = reg && reg.enabledAt != null ? reg.enabledAt : null;
    let enabledAt: Date | null = null;
    if (enabledAtRaw) {
      let parsed: Date | null = null;
      if (enabledAtRaw instanceof Date) {
        parsed = enabledAtRaw;
      } else if (
        typeof enabledAtRaw === 'string' ||
        typeof enabledAtRaw === 'number'
      ) {
        const candidate = new Date(enabledAtRaw);
        if (!Number.isNaN(candidate.getTime())) parsed = candidate;
      }
      if (parsed) enabledAt = parsed;
    }
    if (enabledAt) {
      const customerMeta = await this.prisma.customer.findFirst({
        where: { id: customerId, merchantId },
        select: { createdAt: true },
      });
      if (!customerMeta) throw new BadRequestException('customer not found');
      if (customerMeta.createdAt < enabledAt) {
        const walletEx = await this.prisma.wallet.findFirst({
          where: { merchantId, customerId, type: WalletType.POINTS },
        });
        return {
          ok: true,
          alreadyGranted: true,
          pointsIssued: 0,
          pending: false,
          maturesAt: null,
          pointsExpireInDays: ttlDays,
          expiresInDays: ttlDays,
          pointsExpireAt: null,
          balance: walletEx?.balance ?? 0,
        } as const;
      }
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
        expiresInDays: ttlDays,
        pointsExpireAt: existingLot?.expiresAt
          ? existingLot.expiresAt.toISOString()
          : null,
        balance: walletEx?.balance ?? 0,
      } as const;
    }

    let idempotencyCreated = false;
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          merchantId,
          scope: 'registration_bonus',
          key: customerId,
        },
      });
      idempotencyCreated = true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const retryTxn = await this.prisma.transaction.findFirst({
          where: { merchantId, customerId, orderId: 'registration_bonus' },
        });
        const retryLot = await this.prisma.earnLot.findFirst({
          where: { merchantId, customerId, orderId: 'registration_bonus' },
        });
        if (retryTxn || retryLot) {
          const walletEx = await this.prisma.wallet.findFirst({
            where: { merchantId, customerId, type: WalletType.POINTS },
          });
          return {
            ok: true,
            alreadyGranted: true,
            pointsIssued: 0,
            pending: !!(retryLot && retryLot.status === 'PENDING'),
            maturesAt: retryLot?.maturesAt
              ? retryLot.maturesAt.toISOString()
              : null,
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: retryLot?.expiresAt
              ? retryLot.expiresAt.toISOString()
              : null,
            balance: walletEx?.balance ?? 0,
          } as const;
        }
        throw new ConflictException('Регистрационный бонус уже обрабатывается');
      }
      throw error;
    }

    try {
      const context = await this.ensureCustomerContext(merchantId, customerId);
      if (context.accrualsBlocked) {
        throw new BadRequestException(
          'Начисления заблокированы администратором',
        );
      }
    } catch (error) {
      if (idempotencyCreated) {
        await this.prisma.idempotencyKey
          .delete({
            where: {
              merchantId_scope_key: {
                merchantId,
                scope: 'registration_bonus',
                key: customerId,
              },
            },
          })
          .catch(() => {});
      }
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Ensure wallet
        let wallet = await tx.wallet.findFirst({
          where: { merchantId, customerId, type: WalletType.POINTS },
        });
        if (!wallet)
          wallet = await tx.wallet.create({
            data: {
              merchantId,
              customerId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });

        const now = new Date();

        if (delayMs > 0) {
          // Create pending lot
          const maturesAt = new Date(now.getTime() + delayMs);
          const expiresAt = ttlDays
            ? new Date(maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000)
            : null;
          const earnLot =
            (tx as OptionalModelsClient).earnLot ?? this.prisma.earnLot;
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
              outletId: resolvedOutletId,
              staffId: resolvedStaffId,
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
                outletId: resolvedOutletId ?? null,
                staffId: resolvedStaffId ?? null,
              },
            },
          });

          return {
            ok: true,
            pointsIssued: points,
            pending: true,
            maturesAt: maturesAt.toISOString(),
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
            balance: (await tx.wallet.findUnique({ where: { id: wallet.id } }))!
              .balance,
          } as const;
        } else {
          // Immediate award
          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: points } },
            select: { balance: true },
          });
          const balance = updatedWallet.balance;

          await tx.transaction.create({
            data: {
              merchantId,
              customerId,
              type: TxnType.EARN,
              amount: points,
              orderId: 'registration_bonus',
              outletId: resolvedOutletId,
              staffId: resolvedStaffId,
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
                outletId: resolvedOutletId,
                staffId: resolvedStaffId,
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
            const earnLot =
              (tx as OptionalModelsClient).earnLot ?? this.prisma.earnLot;
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
                outletId: resolvedOutletId,
                staffId: resolvedStaffId,
                status: 'ACTIVE',
              },
            });
          }

          await tx.eventOutbox.create({
            data: {
              merchantId,
              eventType: 'loyalty.registration.awarded',
              payload: {
                merchantId,
                customerId,
                points,
                outletId: resolvedOutletId ?? null,
                staffId: resolvedStaffId ?? null,
              },
            },
          });
          await tx.eventOutbox.create({
            data: {
              merchantId,
              eventType: 'notify.registration_bonus',
              payload: {
                merchantId,
                customerId,
                points,
              },
            },
          });

          return {
            ok: true,
            pointsIssued: points,
            pending: false,
            maturesAt: null,
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: ttlDays
              ? new Date(
                  now.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                ).toISOString()
              : null,
            balance,
          } as const;
        }
      });
    } catch (error) {
      if (idempotencyCreated) {
        await this.prisma.idempotencyKey
          .delete({
            where: {
              merchantId_scope_key: {
                merchantId,
                scope: 'registration_bonus',
                key: customerId,
              },
            },
          })
          .catch(() => {});
      }
      throw error;
    }
  }

  async redeem(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    const context = await this.ensureCustomerContext(merchantId, customerId);
    if (context.redemptionsBlocked) {
      throw new BadRequestException('Списания заблокированы администратором');
    }
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
      const updated = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (!updated.count) {
        throw new BadRequestException('Insufficient points');
      }
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

    const context = await this.ensureCustomerContext(merchantId, customerId);
    if (context.accrualsBlocked) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
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

      let balance =
        (await tx.wallet.findUnique({ where: { id: wallet.id } }))?.balance ??
        0;
      if (points > 0) {
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: points } },
          select: { balance: true },
        });
        balance = updatedWallet.balance;
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
          metadata: {
            source: 'PROMOCODE',
            promoCodeId: result.promoCode.id,
            code: result.promoCode.code ?? null,
          } as Prisma.JsonObject,
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
        const earnLot =
          (tx as OptionalModelsClient).earnLot ?? this.prisma.earnLot;
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

  private async unconsumeLots(
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

  private async revokeLots(
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

  private async resolveOutletContext(
    merchantId: string,
    input: { outletId?: string | null },
  ) {
    const { outletId } = input;
    if (!outletId) return { outletId: null };
    try {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: outletId, merchantId },
        select: { id: true },
      });
      return { outletId: outlet?.id ?? null };
    } catch {
      return { outletId: null };
    }
  }

  private async resolveTierRatesForCustomer(
    merchantId: string,
    customerId: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    try {
      try {
        await this.refreshTierAssignmentIfExpired(
          prisma,
          merchantId,
          customerId,
        );
      } catch {}
      let assignment = await prisma.loyaltyTierAssignment.findFirst({
        where: {
          merchantId,
          customerId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (assignment?.source === 'promocode' && !assignment.expiresAt) {
        const promoCodeIdRaw =
          assignment.metadata &&
          typeof assignment.metadata === 'object' &&
          !Array.isArray(assignment.metadata)
            ? (assignment.metadata as Record<string, unknown>).promoCodeId
            : null;
        const promoCodeId =
          typeof promoCodeIdRaw === 'string' && promoCodeIdRaw.trim()
            ? promoCodeIdRaw
            : null;
        let expiresInDays: number | null = null;
        if (promoCodeId) {
          try {
            const promo = await prisma.promoCode.findUnique({
              where: { id: promoCodeId },
              select: { metadata: true },
            });
            const meta =
              promo?.metadata &&
              typeof promo.metadata === 'object' &&
              !Array.isArray(promo.metadata)
                ? (promo.metadata as Record<string, unknown>)
                : null;
            const level =
              meta &&
              typeof meta.level === 'object' &&
              meta.level !== null &&
              !Array.isArray(meta.level)
                ? (meta.level as Record<string, unknown>)
                : null;
            const raw = level?.expiresInDays;
            if (
              (typeof raw === 'string' || typeof raw === 'number') &&
              Number.isFinite(Number(raw)) &&
              Number(raw) >= 0
            ) {
              expiresInDays = Math.floor(Number(raw));
            }
          } catch {}
        }
        if (expiresInDays == null) {
          expiresInDays = DEFAULT_LEVELS_PERIOD_DAYS;
        }
        if (expiresInDays > 0) {
          const assignedBase = assignment.assignedAt ?? new Date();
          const promoExpiresAt = new Date(
            assignedBase.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
          );
          try {
            await prisma.loyaltyTierAssignment.update({
              where: {
                merchantId_customerId: {
                  merchantId,
                  customerId,
                },
              },
              data: { expiresAt: promoExpiresAt },
            });
          } catch {}
          if (promoExpiresAt.getTime() <= Date.now()) {
            try {
              await this.recomputeTierProgress(prisma, {
                merchantId,
                customerId,
              });
            } catch {}
            assignment = await prisma.loyaltyTierAssignment.findFirst({
              where: {
                merchantId,
                customerId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
              orderBy: { assignedAt: 'desc' },
            });
          } else {
            assignment = { ...assignment, expiresAt: promoExpiresAt };
          }
        }
      }
      let tier: LoyaltyTier | null = null;
      if (assignment) {
        tier = await prisma.loyaltyTier.findUnique({
          where: { id: assignment.tierId },
        });
      }
      if (!tier) {
        tier = await prisma.loyaltyTier.findFirst({
          where: { merchantId, isInitial: true },
          orderBy: { thresholdAmount: 'asc' },
        });
      }
      if (!tier) {
        return { earnBps: 0, redeemLimitBps: 0, tierMinPayment: null };
      }
      const earnBps =
        typeof tier.earnRateBps === 'number'
          ? Math.max(0, Math.floor(Number(tier.earnRateBps)))
          : 0;
      const redeemLimitBps =
        typeof tier.redeemRateBps === 'number'
          ? Math.max(0, Math.floor(Number(tier.redeemRateBps)))
          : 0;
      let tierMinPayment: number | null = null;
      const meta = tier.metadata ?? null;
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        const record = meta as Record<string, unknown>;
        const raw = record.minPaymentAmount ?? record.minPayment;
        if (raw != null) {
          const mp = Number(raw);
          if (Number.isFinite(mp) && mp >= 0) tierMinPayment = Math.round(mp);
        }
      }
      return { earnBps, redeemLimitBps, tierMinPayment };
    } catch {
      return { earnBps: 0, redeemLimitBps: 0, tierMinPayment: null };
    }
  }

  // ===== Levels integration (Wave 2) =====
  // ————— вспомогалки для идемпотентности по существующему hold —————
  private quoteFromExistingHold(
    mode: Mode,
    hold: {
      id: string;
      redeemAmount?: number | null;
      total?: number | null;
      earnPoints?: number | null;
    },
  ) {
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
    const accrualsBlocked = Boolean(customer.accrualsBlocked);
    const redemptionsBlocked = Boolean(customer.redemptionsBlocked);
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
    } = await this.getSettings(dto.merchantId);
    const rulesConfig =
      rulesJson && typeof rulesJson === 'object' && !Array.isArray(rulesJson)
        ? (rulesJson as Record<string, unknown>)
        : {};
    const allowSameReceipt = Boolean(rulesConfig.allowEarnRedeemSameReceipt);
    const allowSameReceiptForCustomer = allowSameReceipt && !accrualsBlocked;
    const modeUpper = String(dto.mode).toUpperCase();

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
    effectiveOutletId = outletCtx.outletId ?? effectiveOutletId ?? null;
    const resolvedDeviceId = deviceCtx?.id ?? null;

    let resolvedPositions: ResolvedPosition[] = [];
    const rawPositions = this.sanitizePositions(
      dto.positions as PositionInput[] | undefined,
    );
    if (rawPositions.length) {
      resolvedPositions = await this.resolvePositions(
        dto.merchantId,
        rawPositions,
        customer.id,
      );
    }
    const { total: sanitizedTotal, eligibleAmount } =
      this.computeTotalsFromPositions(
        Math.max(0, Math.floor(Number(dto.total ?? 0))),
        resolvedPositions,
      );
    const { earnBps, redeemLimitBps, tierMinPayment } =
      await this.resolveTierRatesForCustomer(dto.merchantId, customer.id);

    if (modeUpper === 'REDEEM' && redemptionsBlocked) {
      return {
        canRedeem: false,
        discountToApply: 0,
        pointsToBurn: 0,
        finalPayable: sanitizedTotal,
        holdId: undefined,
        message: 'Списания заблокированы администратором',
      };
    }
    if (modeUpper !== 'REDEEM' && accrualsBlocked) {
      return {
        canEarn: false,
        pointsToEarn: 0,
        holdId: undefined,
        message: 'Начисления заблокированы администратором',
      };
    }
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
              existing.outletId = effectiveOutletId;
            } catch {}
          }
          // идемпотентно отдадим тот же расчёт/holdId
          return this.quoteFromExistingHold(dto.mode, existing);
        }
        // уже зафиксирован или отменён — QR повторно использовать нельзя
        throw new BadRequestException(
          'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
        );
      }

      const isShortCode = qr.kind === 'short';
      const now = new Date();
      if (isShortCode) {
        const nonce = await this.prisma.qrNonce.findUnique({
          where: { jti: qr.jti },
        });
        if (!nonce) {
          throw new BadRequestException('Bad QR token');
        }
        if (nonce.expiresAt && nonce.expiresAt.getTime() <= now.getTime()) {
          try {
            await this.prisma.qrNonce.delete({ where: { jti: qr.jti } });
          } catch {}
          throw new BadRequestException(
            'JWTExpired: "exp" claim timestamp check failed',
          );
        }
        if (nonce.usedAt) {
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
                  again.outletId = effectiveOutletId;
                } catch {}
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
          }
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
        const updated = await this.prisma.qrNonce.updateMany({
          where: { jti: qr.jti, usedAt: null },
          data: { usedAt: now },
        });
        if (!updated.count) {
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
                  again.outletId = effectiveOutletId;
                } catch {}
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
            throw new BadRequestException(
              'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
            );
          }
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
      } else {
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
        } catch {
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
                  again.outletId = effectiveOutletId;
                } catch {}
              }
              return this.quoteFromExistingHold(dto.mode, again);
            }
            throw new BadRequestException(
              'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
            );
          }
          // иначе считаем, что QR использован
          throw new BadRequestException(
            'Этот QR уже использован. Попросите клиента обновить QR в приложении.',
          );
        }
      }
    }

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
        };
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
      const manualRedeemAmount = this.sanitizeManualAmount(
        dto.redeemAmount ?? null,
      );
      const manualRedeemCap =
        manualRedeemAmount != null && manualRedeemAmount > 0
          ? manualRedeemAmount
          : Number.MAX_SAFE_INTEGER;
      const computeRedeemQuote = (walletBalance: number) => {
        const discountToApply = Math.min(
          walletBalance,
          remainingByOrder || limit,
          capLeft,
          allowedByMinPayment,
          manualRedeemCap,
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
            allowSameReceiptForCustomer ? earnBps : 0,
            discountToApply,
            { allowEarn: allowSameReceiptForCustomer },
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
        } else if (allowSameReceiptForCustomer) {
          appliedRedeem = Math.max(0, Math.floor(Number(discountToApply) || 0));
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
          appliedRedeem = Math.max(0, Math.floor(Number(discountToApply) || 0));
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
          orderId: { not: null },
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
          orderId: { not: null },
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
      const allowEarn = !(
        tierMinPayment != null && sanitizedTotal < tierMinPayment
      );
      let totalFromItems = this.applyEarnAndRedeemToItems(
        itemsForCalc,
        eligibleBps,
        0,
        { allowEarn },
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
              item.earnPoints != null && Number.isFinite(item.earnPoints)
                ? Math.max(0, item.earnPoints)
                : Math.max(0, item.amount || 0) *
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
      expectedMerchantId?: string | null;
    },
  ) {
    const hold = await this.prisma.hold.findUnique({
      where: { id: holdId },
      include: { items: true },
    });
    if (!hold) throw new BadRequestException('Hold not found');
    const expectedMerchantId = opts?.expectedMerchantId
      ? String(opts.expectedMerchantId).trim()
      : '';
    if (expectedMerchantId && hold.merchantId !== expectedMerchantId) {
      throw new ForbiddenException('Hold belongs to another merchant');
    }
    if (hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Код истёк по времени. Попросите клиента обновить его в приложении и попробуйте ещё раз.',
      );
    }
    const context = await this.ensureCustomerContext(
      hold.merchantId,
      hold.customerId,
    );
    const accrualsBlocked = Boolean(context.accrualsBlocked);
    const redemptionsBlocked = Boolean(context.redemptionsBlocked);
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
    if (hold.orderId && hold.orderId !== orderId) {
      throw new ConflictException('Hold already bound to another order');
    }

    if (accrualsBlocked && hold.mode === 'EARN') {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    if (redemptionsBlocked && hold.mode === 'REDEEM') {
      throw new BadRequestException('Списания заблокированы администратором');
    }
    if (
      accrualsBlocked &&
      manualEarnOverride != null &&
      manualEarnOverride > 0
    ) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    if (
      redemptionsBlocked &&
      manualRedeemOverride != null &&
      manualRedeemOverride > 0
    ) {
      throw new BadRequestException('Списания заблокированы администратором');
    }

    const positionsOverrideInput = this.sanitizePositions(
      (opts?.positions as PositionInput[]) ?? [],
    );
    const positionsOverrideResolved = positionsOverrideInput.length
      ? await this.resolvePositions(
          hold.merchantId,
          positionsOverrideInput,
          hold.customerId,
        )
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
        const claim = await tx.hold.updateMany({
          where: {
            id: hold.id,
            status: HoldStatus.PENDING,
            OR: [{ orderId: null }, { orderId }],
          },
          data: { status: HoldStatus.COMMITTED, orderId },
        });
        if (claim.count === 0) {
          const current = await tx.hold.findUnique({
            where: { id: hold.id },
            select: { status: true, orderId: true },
          });
          if (current?.orderId && current.orderId !== orderId) {
            throw new ConflictException('Hold already bound to another order');
          }
          if (current?.status && current.status !== HoldStatus.PENDING) {
            const committed = await tx.receipt.findUnique({
              where: {
                merchantId_orderId: { merchantId: hold.merchantId, orderId },
              },
            });
            if (committed) {
              return {
                ok: true,
                customerId: context.customerId,
                alreadyCommitted: true,
                receiptId: committed.id,
                redeemApplied: committed.redeemApplied,
                earnApplied: committed.earnApplied,
              };
            }
            throw new ConflictException('Hold already finished');
          }
        }

        // Накапливаем применённые суммы для чека
        let appliedRedeem = 0;
        let appliedEarn = 0;
        let redeemTxId: string | null = null;
        let earnTxId: string | null = null;
        const createdEarnLotIds: string[] = [];
        let promoResult: PromoCodeApplyResult | null = null;
        if (opts?.promoCode && hold.customerId && manualEarnOverride == null) {
          if (accrualsBlocked) {
            throw new BadRequestException(
              'Начисления заблокированы администратором',
            );
          }
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
        const holdItemsRaw = (hold as { items?: unknown }).items;
        const hasSavedItems =
          Array.isArray(holdItemsRaw) && holdItemsRaw.length > 0;
        const shouldOverrideItems =
          positionsOverrideResolved.length > 0 && !hasSavedItems;
        const holdItemsSource: unknown[] = Array.isArray(holdItemsRaw)
          ? holdItemsRaw
          : [];

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
          : holdItemsSource.map((item) => {
              const record =
                item && typeof item === 'object' && !Array.isArray(item)
                  ? (item as Record<string, unknown>)
                  : {};
              const metaValue = record.metadata;
              const meta =
                metaValue &&
                typeof metaValue === 'object' &&
                !Array.isArray(metaValue)
                  ? (metaValue as Record<string, unknown>)
                  : {};
              const promoIds = Array.isArray(meta.promotionIds)
                ? meta.promotionIds.filter(
                    (value): value is string =>
                      typeof value === 'string' && value.trim().length > 0,
                  )
                : undefined;
              const basePriceRaw = Number(meta.basePrice ?? NaN);
              const basePrice =
                Number.isFinite(basePriceRaw) && basePriceRaw >= 0
                  ? basePriceRaw
                  : undefined;
              const pointPromotionId =
                typeof meta.pointPromotionId === 'string'
                  ? meta.pointPromotionId
                  : null;
              const promoBonusRaw = Number(meta.promotionPointsBonus ?? NaN);
              const promotionPointsBonus = Number.isFinite(promoBonusRaw)
                ? promoBonusRaw
                : undefined;
              const productId =
                typeof record.productId === 'string'
                  ? record.productId
                  : undefined;
              const categoryId =
                typeof record.categoryId === 'string'
                  ? record.categoryId
                  : undefined;
              const externalId =
                typeof record.externalId === 'string'
                  ? record.externalId
                  : undefined;
              const name =
                typeof record.name === 'string' ? record.name : undefined;
              const promotionId =
                typeof record.promotionId === 'string'
                  ? record.promotionId
                  : null;
              const promoMultiplierRaw = record.promotionMultiplier;
              const promotionMultiplier =
                promoMultiplierRaw &&
                Number.isFinite(Number(promoMultiplierRaw))
                  ? Number(promoMultiplierRaw) / 10000
                  : 1;
              return {
                productId,
                categoryId,
                resolvedProductId: productId ?? null,
                resolvedCategoryId: categoryId ?? null,
                externalId,
                name,
                qty: Number(record.qty ?? 0),
                price: Number(record.price ?? 0),
                amount: Math.max(0, Number(record.amount ?? 0)),
                promotionId,
                promotionMultiplier,
                appliedPromotionIds: promoIds,
                appliedPointPromotionId: pointPromotionId,
                promotionPointsBonus,
                accruePoints:
                  record.accruePoints != null
                    ? Boolean(record.accruePoints)
                    : true,
                earnPoints:
                  record.earnPoints != null
                    ? Math.max(0, Math.floor(Number(record.earnPoints)))
                    : 0,
                redeemAmount:
                  record.redeemAmount != null
                    ? Math.max(0, Math.floor(Number(record.redeemAmount)))
                    : 0,
                basePrice,
              };
            });

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
          let amount = Math.min(fresh!.balance, redeemTarget);
          appliedRedeem = amount;
          if (amount > 0) {
            let updated = await tx.wallet.updateMany({
              where: { id: wallet.id, balance: { gte: amount } },
              data: { balance: { decrement: amount } },
            });
            if (!updated.count) {
              const retryFresh = await tx.wallet.findUnique({
                where: { id: wallet.id },
              });
              amount = Math.min(retryFresh?.balance ?? 0, redeemTarget);
              appliedRedeem = amount;
              if (amount > 0) {
                updated = await tx.wallet.updateMany({
                  where: { id: wallet.id, balance: { gte: amount } },
                  data: { balance: { decrement: amount } },
                });
              }
            }
            if (!updated.count) {
              throw new BadRequestException('Insufficient points');
            }
          }
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
        const baseEarnFromHold = accrualsBlocked
          ? 0
          : manualEarnOverride != null
            ? manualEarnOverride
            : Math.max(0, Math.floor(Number(hold.earnPoints || 0)));
        const promoBonus =
          accrualsBlocked || manualEarnOverride != null
            ? 0
            : promoResult
              ? Math.max(0, Math.floor(Number(promoResult.pointsIssued || 0)))
              : 0;
        // Доп. начисление при списании, если включено allowEarnRedeemSameReceipt
        let extraEarn = 0;
        if (!accrualsBlocked) {
          try {
            const msRules = await tx.merchantSettings.findUnique({
              where: { merchantId: hold.merchantId },
            });
            const rules =
              msRules?.rulesJson &&
              typeof msRules.rulesJson === 'object' &&
              !Array.isArray(msRules.rulesJson)
                ? (msRules.rulesJson as Record<string, unknown>)
                : {};
            const allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
            if (
              manualEarnOverride == null &&
              hold.mode === 'REDEEM' &&
              allowSame &&
              baseEarnFromHold === 0
            ) {
              const { earnDailyCap } = await this.getSettings(hold.merchantId);
              let earnBpsEff = 0;
              let tierMinPaymentLocal: number | null = null;
              try {
                const tierRates = await this.resolveTierRatesForCustomer(
                  hold.merchantId,
                  hold.customerId,
                  tx,
                );
                earnBpsEff = tierRates.earnBps;
                tierMinPaymentLocal = tierRates.tierMinPayment;
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
                      orderId: { not: null },
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
        }
        const appliedEarnTotal = baseEarnFromHold + promoBonus + extraEarn;

        if (appliedEarnTotal > 0) {
          // Проверяем, требуется ли задержка начисления. В юнит-тестах tx может не иметь merchantSettings — делаем fallback на this.prisma.
          const settingsClient = tx as OptionalModelsClient;
          const settings = await (
            settingsClient.merchantSettings ?? this.prisma.merchantSettings
          ).findUnique({
            where: { merchantId: hold.merchantId },
          });
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
                (tx as OptionalModelsClient).earnLot ??
                (this.prisma as OptionalModelsClient).earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  const createdLot = await earnLot.create({
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
                    select: { id: true },
                  });
                  if (createdLot?.id) createdEarnLotIds.push(createdLot.id);
                }
                if (promoBonus > 0) {
                  const promoExpiresAt = promoExpireDays
                    ? new Date(
                        maturesAt.getTime() +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  const createdPromoLot = await earnLot.create({
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
                      deviceId: hold.deviceId ?? null,
                      status: 'PENDING',
                      createdAt: operationDateObj,
                    },
                    select: { id: true },
                  });
                  if (createdPromoLot?.id)
                    createdEarnLotIds.push(createdPromoLot.id);
                }
                if (extraEarn > 0) {
                  const expiresAtStd =
                    ttlDays > 0
                      ? new Date(
                          maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                        )
                      : null;
                  const createdExtraLot = await earnLot.create({
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
                    select: { id: true },
                  });
                  if (createdExtraLot?.id)
                    createdEarnLotIds.push(createdExtraLot.id);
                }
              }
            }
            const scheduledPayload: Record<string, unknown> = {
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
            };
            if (promoResult && opts?.promoCode) {
              scheduledPayload.promoCode = {
                promoCodeId: opts.promoCode.promoCodeId,
                code: opts.promoCode.code ?? null,
                points: promoBonus,
                expiresInDays: promoExpireDays,
              };
            }
            await tx.eventOutbox.create({
              data: {
                merchantId: hold.merchantId,
                eventType: 'loyalty.earn.scheduled',
                createdAt: operationDateObj,
                payload: scheduledPayload as Prisma.InputJsonValue,
              },
            });
          } else {
            // Немедленное начисление
            if (appliedEarn > 0) {
              await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: appliedEarn } },
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
                (tx as OptionalModelsClient).earnLot ??
                (this.prisma as OptionalModelsClient).earnLot;
              if (earnLot?.create) {
                if (baseEarnFromHold > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  const createdLot = await earnLot.create({
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
                    select: { id: true },
                  });
                  if (createdLot?.id) createdEarnLotIds.push(createdLot.id);
                }
                if (promoBonus > 0) {
                  const expiresPromo = promoExpireDays
                    ? new Date(
                        operationTimestamp +
                          promoExpireDays * 24 * 60 * 60 * 1000,
                      )
                    : null;
                  const createdPromoLot = await earnLot.create({
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
                    select: { id: true },
                  });
                  if (createdPromoLot?.id)
                    createdEarnLotIds.push(createdPromoLot.id);
                }
                if (extraEarn > 0) {
                  let expires: Date | null = null;
                  if (ttlDays > 0)
                    expires = new Date(
                      operationTimestamp + ttlDays * 24 * 60 * 60 * 1000,
                    );
                  const createdExtraLot = await earnLot.create({
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
                    select: { id: true },
                  });
                  if (createdExtraLot?.id)
                    createdEarnLotIds.push(createdExtraLot.id);
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
            ? holdItemsResolved.map((item, idx) => {
                const explicitEarn =
                  item.earnPoints != null && Number.isFinite(item.earnPoints)
                    ? Math.max(0, Math.floor(item.earnPoints))
                    : null;
                if (explicitEarn && explicitEarn > 0) return explicitEarn;
                return Math.max(
                  0,
                  Math.floor(
                    Math.max(0, item.amount - (redeemShares[idx] ?? 0)) *
                      Math.max(1, item.promotionMultiplier || 1),
                  ),
                );
              })
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
        if (createdEarnLotIds.length > 0) {
          await tx.earnLot.updateMany({
            where: { id: { in: createdEarnLotIds } },
            data: { receiptId: created.id },
          });
        }

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
              metadata:
                item.basePrice != null ||
                item.appliedPromotionIds?.length ||
                item.appliedPointPromotionId ||
                item.promotionPointsBonus != null
                  ? {
                      basePrice: item.basePrice ?? null,
                      promotionIds:
                        item.appliedPromotionIds ??
                        (item.promotionId ? [item.promotionId] : []),
                      pointPromotionId: item.appliedPointPromotionId ?? null,
                      promotionPointsBonus: item.promotionPointsBonus ?? null,
                    }
                  : Prisma.JsonNull,
            },
          });
          receiptItemsCreated.push({
            id: receiptItem.id,
            redeemApplied: redeemAppliedItem,
            earnApplied: earnAppliedItem,
            item,
          });
        }

        const promotionIds = new Set<string>();
        for (const item of holdItemsResolved) {
          const fromMeta = item.appliedPromotionIds ?? [];
          if (fromMeta.length) {
            fromMeta.forEach((id) => promotionIds.add(id));
          } else if (item.promotionId) {
            promotionIds.add(item.promotionId);
          }
        }
        if (promotionIds.size > 0) {
          const promos = await tx.loyaltyPromotion.findMany({
            where: {
              merchantId: hold.merchantId,
              id: { in: Array.from(promotionIds) },
            },
            select: { id: true, rewardType: true },
          });
          const promoTypeMap = new Map(
            promos.map((promo) => [promo.id, promo.rewardType]),
          );
          const metrics = new Map<
            string,
            {
              revenue: number;
              paidAmount: number;
              discountCost: number;
              pointsCost: number;
              purchases: number;
            }
          >();
          for (const item of holdItemsResolved) {
            const qty = Math.max(0, Number(item.qty ?? 0));
            if (!qty) continue;
            const basePrice =
              item.basePrice != null
                ? Math.max(0, Number(item.basePrice))
                : Math.max(0, Number(item.price ?? 0));
            const baseAmount = Math.max(0, Math.round(basePrice * qty));
            const paidAmount = Math.max(
              0,
              Math.floor(Number(item.amount ?? 0)),
            );
            const discountAmount = Math.max(0, baseAmount - paidAmount);
            const appliedIds = item.appliedPromotionIds?.length
              ? item.appliedPromotionIds
              : item.promotionId
                ? [item.promotionId]
                : [];
            const pointPromoId =
              item.appliedPointPromotionId ?? item.promotionId ?? null;
            for (const promoId of appliedIds) {
              const rewardType = promoTypeMap.get(promoId);
              if (!rewardType) continue;
              if (
                rewardType === PromotionRewardType.POINTS &&
                pointPromoId &&
                promoId !== pointPromoId
              ) {
                continue;
              }
              const entry = metrics.get(promoId) ?? {
                revenue: 0,
                paidAmount: 0,
                discountCost: 0,
                pointsCost: 0,
                purchases: 0,
              };
              entry.revenue += paidAmount;
              entry.paidAmount += paidAmount;
              if (rewardType === PromotionRewardType.POINTS) {
                entry.pointsCost += Math.max(
                  0,
                  Math.floor(Number(item.promotionPointsBonus ?? 0)),
                );
              } else {
                entry.discountCost += discountAmount;
              }
              metrics.set(promoId, entry);
            }
          }
          for (const promoId of metrics.keys()) {
            const entry = metrics.get(promoId);
            if (entry) entry.purchases = 1;
          }
          for (const [promoId, entry] of metrics.entries()) {
            await tx.loyaltyPromotionMetric.upsert({
              where: { promotionId: promoId },
              create: {
                promotionId: promoId,
                merchantId: hold.merchantId,
                participantsCount: entry.purchases,
                revenueGenerated: entry.revenue,
                pointsIssued: entry.pointsCost,
                pointsRedeemed: entry.discountCost,
              },
              update: {
                participantsCount: { increment: entry.purchases },
                revenueGenerated: { increment: entry.revenue },
                pointsIssued: { increment: entry.pointsCost },
                pointsRedeemed: { increment: entry.discountCost },
              },
            });
            if (hold.customerId) {
              await tx.promotionParticipant.upsert({
                where: {
                  promotionId_customerId: {
                    promotionId: promoId,
                    customerId: hold.customerId,
                  },
                },
                create: {
                  promotionId: promoId,
                  merchantId: hold.merchantId,
                  customerId: hold.customerId,
                  outletId: hold.outletId ?? null,
                  joinedAt: operationDateObj,
                  firstPurchaseAt: operationDateObj,
                  lastPurchaseAt: operationDateObj,
                  purchasesCount: entry.purchases,
                  totalSpent: entry.paidAmount,
                  pointsIssued: entry.pointsCost,
                  pointsRedeemed: entry.discountCost,
                },
                update: {
                  lastPurchaseAt: operationDateObj,
                  purchasesCount: { increment: entry.purchases },
                  totalSpent: { increment: entry.paidAmount },
                  pointsIssued: { increment: entry.pointsCost },
                  pointsRedeemed: { increment: entry.discountCost },
                },
              });
            }
          }
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
        // Пишем событие в outbox (минимально)
        const commitPayload: Record<string, unknown> = {
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
        };
        await tx.eventOutbox.create({
          data: {
            merchantId: hold.merchantId,
            eventType: 'loyalty.commit',
            createdAt: operationDateObj,
            payload: commitPayload as Prisma.InputJsonValue,
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
                at: created.createdAt.toISOString(),
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
    } catch (error) {
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
      throw error;
    }
  }

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

    let existingReceipt: Receipt | null = null;
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
        try {
          await this.upsertHoldItems(
            this.prisma,
            holdId,
            merchantId,
            positionsForHold,
          );
        } catch {}
        try {
          await this.prisma.hold.update({
            where: { id: holdId },
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
        } catch {}
      }
    }

    if (manualRedeem && redeemToSave > balanceBefore) {
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
      invoiceNum: invoiceNum ?? null,
      redeemApplied: commitResult.redeemApplied ?? 0,
      earnApplied: commitResult.earnApplied ?? 0,
      balanceBefore,
      balanceAfter: walletAfter.balance ?? 0,
      alreadyProcessed: Boolean(commitResult.alreadyCommitted),
    };
  }

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

  private async computeIntegrationCalc(params: {
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

    const context = await this.ensureCustomerContext(
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
      this.isAllowSameReceipt(params.merchantId),
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

  async getBaseRatesForCustomer(
    merchantId: string,
    customerId: string,
    _opts?: { outletId?: string | null; eligibleAmount?: number },
  ) {
    const mid = typeof merchantId === 'string' ? merchantId.trim() : '';
    const cid = typeof customerId === 'string' ? customerId.trim() : '';
    if (!mid) throw new BadRequestException('merchantId required');
    if (!cid) throw new BadRequestException('customerId required');

    await ensureBaseTier(this.prisma, mid).catch(() => null);
    const { earnBps, redeemLimitBps, tierMinPayment } =
      await this.resolveTierRatesForCustomer(mid, cid);
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
    let visitFrequencyDays: number | null = null;
    if (visitCount > 1 && firstDate && lastDate) {
      const diffDays = Math.max(
        0,
        Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000),
      );
      if (diffDays > 0) {
        visitFrequencyDays =
          Math.round((diffDays / (visitCount - 1)) * 100) / 100;
      }
    }
    return {
      visitCount,
      totalAmount,
      avgBill,
      visitFrequencyDays,
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
    const deviceCtx = await this.resolveDeviceContext(
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
      if (process.env.EARN_LOTS_FEATURE === '1' && receipt.orderId) {
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
        if (process.env.EARN_LOTS_FEATURE === '1') {
          await this.revokeLots(
            tx,
            merchantId,
            receipt.customerId,
            pointsToRevoke,
            { orderId: receipt.orderId, receiptId: receipt.id },
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
    const formatDevice = (device?: { code?: string | null }): string | null => {
      if (!device?.code) return null;
      const code = device.code.trim();
      return code.length > 0 ? code : null;
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
    const whereTx: Prisma.TransactionWhereInput = {
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
        device: { select: { code: true } },
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
        staffId: string | null;
        deviceCode: string | null;
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
          outlet: { select: { name: true } },
          staff: { select: { firstName: true, lastName: true, login: true } },
          staffId: true,
          device: { select: { code: true } },
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
          staffId: receipt.staffId ?? null,
          deviceCode: formatDevice(receipt.device ?? undefined),
          customerName: formatCustomer(receipt.customer ?? undefined),
          outletName: receipt.outlet?.name?.trim() || null,
        });
      }
    }

    const normalizedTxs = txItems.map((entity) => {
      const orderId =
        typeof entity.orderId === 'string' && entity.orderId.trim().length > 0
          ? entity.orderId.trim()
          : null;
      const receiptMeta = orderId ? receiptMetaByOrderId.get(orderId) : null;
      const staffName =
        formatStaff(entity.staff ?? undefined) ||
        receiptMeta?.staffName ||
        formatDevice(entity.device ?? undefined) ||
        receiptMeta?.deviceCode ||
        null;
      return {
        id: entity.id,
        mode: 'TXN' as const,
        type: entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId ? (receiptMeta?.receiptNumber ?? null) : null,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
        outletName: entity.outlet?.name ?? null,
        purchaseAmount: orderId ? (receiptMeta?.total ?? null) : null,
        earnApplied: orderId ? (receiptMeta?.earnApplied ?? null) : null,
        redeemApplied: orderId ? (receiptMeta?.redeemApplied ?? null) : null,
        staffId: entity.staffId ?? receiptMeta?.staffId ?? null,
        staffName,
        customerName:
          formatCustomer(entity.customer ?? undefined) ||
          receiptMeta?.customerName ||
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
          staffId: meta.staffId ?? null,
          staffName: meta.staffName ?? meta.deviceCode ?? null,
          customerName: meta.customerName ?? null,
        };
      },
    );

    type RefundGroup = {
      earn: number;
      redeem: number;
      createdAt: string;
      receiptNumber: string | null;
      staffId: string | null;
      staffName: string | null;
      customerName: string | null;
    };
    const refundGrouped = new Map<string, RefundGroup>();
    for (const tx of normalizedTxs) {
      if (tx.type !== TxnType.REFUND) continue;
      const orderId = tx.orderId ?? 'unknown';
      const group = refundGrouped.get(orderId) ?? {
        earn: 0,
        redeem: 0,
        createdAt: tx.createdAt,
        receiptNumber: tx.receiptNumber ?? null,
        staffId: tx.staffId ?? null,
        staffName: tx.staffName ?? null,
        customerName: tx.customerName ?? null,
      };
      const amount = Number(tx.amount ?? 0);
      if (amount > 0) group.redeem += amount;
      else if (amount < 0) group.earn += Math.abs(amount);
      if (tx.createdAt > group.createdAt) group.createdAt = tx.createdAt;
      if (!group.receiptNumber && tx.receiptNumber)
        group.receiptNumber = tx.receiptNumber;
      if (!group.staffId && tx.staffId) group.staffId = tx.staffId;
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
          staffId: meta.staffId ?? receiptMeta?.staffId ?? null,
          staffName:
            meta.staffName ??
            receiptMeta?.staffName ??
            receiptMeta?.deviceCode ??
            null,
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
    const whereTx: Prisma.TransactionWhereInput = { merchantId, customerId };
    if (before) whereTx.createdAt = { lt: before };
    if (filters?.outletId) whereTx.outletId = filters.outletId;
    if (filters?.staffId) whereTx.staffId = filters.staffId;
    const txItems = await this.prisma.transaction.findMany({
      where: whereTx,
      orderBy: { createdAt: 'desc' },
      take: hardLimit,
      include: {
        device: { select: { code: true } },
        reviews: { select: { id: true, rating: true, createdAt: true } },
      },
    });

    // Отмеченные закрытые окна отзыва (кросс-девайс подавление показа)
    const reviewDismissedByTxId = new Map<string, string>();
    const txIds = txItems.map((item) => item.id).filter(Boolean);
    if (txIds.length > 0) {
      try {
        type LoyaltyRealtimeRecord = {
          transactionId?: string | null;
          emittedAt?: unknown;
          createdAt?: unknown;
          updatedAt?: unknown;
          payload?: unknown;
        };
        const optionalClient = this.prisma as OptionalModelsClient;
        const records =
          ((await optionalClient.loyaltyRealtimeEvent?.findMany?.({
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
          })) as LoyaltyRealtimeRecord[]) || [];
        const normalizeDate = (value: unknown): string | null => {
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
            record.payload &&
            typeof record.payload === 'object' &&
            !Array.isArray(record.payload)
              ? (record.payload as Record<string, unknown>)
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
    const whereLots: Prisma.EarnLotWhereInput = {
      merchantId,
      customerId,
      status: 'PENDING',
    };
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
        total: number | null;
        redeemApplied: number | null;
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
          redeemApplied: true,
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
          total:
            typeof receipt.total === 'number' && Number.isFinite(receipt.total)
              ? receipt.total
              : null,
          redeemApplied:
            typeof receipt.redeemApplied === 'number' &&
            Number.isFinite(receipt.redeemApplied)
              ? receipt.redeemApplied
              : null,
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
      const metadataValue = entity.metadata;
      const metadata =
        metadataValue &&
        typeof metadataValue === 'object' &&
        !Array.isArray(metadataValue)
          ? (metadataValue as Record<string, unknown>)
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
            ? ('REGISTRATION' as const)
            : entity.type,
        amount: entity.amount,
        orderId,
        receiptNumber: orderId
          ? (receiptMetaByOrderId.get(orderId)?.receiptNumber ?? null)
          : null,
        receiptTotal: orderId
          ? (receiptMetaByOrderId.get(orderId)?.total ?? null)
          : null,
        redeemApplied: orderId
          ? (receiptMetaByOrderId.get(orderId)?.redeemApplied ?? null)
          : null,
        customerId: entity.customerId,
        createdAt: entity.createdAt.toISOString(),
        outletId: entity.outletId ?? null,
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
      select: {
        id: true,
        merchantId: true,
        accrualsBlocked: true,
        redemptionsBlocked: true,
      },
    });
    if (!customer || customer.merchantId !== merchantId) {
      throw new BadRequestException('customer not found');
    }
    return {
      customerId: customer.id,
      accrualsBlocked: Boolean(customer.accrualsBlocked),
      redemptionsBlocked: Boolean(customer.redemptionsBlocked),
    };
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
    tx: PrismaClientLike,
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
    let allowSame = false;
    try {
      const settings = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { rulesJson: true },
      });
      const rules =
        settings &&
        typeof settings.rulesJson === 'object' &&
        !Array.isArray(settings.rulesJson)
          ? (settings.rulesJson as Record<string, unknown>)
          : null;
      if (rules) {
        allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
      }
    } catch {}
    return allowSame;
  }

  private async recomputeTierProgress(
    tx: PrismaClientLike,
    params: { merchantId: string; customerId: string },
  ) {
    let periodDays = DEFAULT_LEVELS_PERIOD_DAYS;
    try {
      const settingsClient = tx as OptionalModelsClient;
      const settings = await (
        settingsClient.merchantSettings ?? this.prisma.merchantSettings
      ).findUnique({
        where: { merchantId: params.merchantId },
        select: { rulesJson: true },
      });
      const rules =
        settings?.rulesJson &&
        typeof settings.rulesJson === 'object' &&
        !Array.isArray(settings.rulesJson)
          ? (settings.rulesJson as Record<string, unknown>)
          : null;
      periodDays = normalizeLevelsPeriodDays(
        rules?.levelsPeriodDays,
        DEFAULT_LEVELS_PERIOD_DAYS,
      );
    } catch {}
    const metric: 'earn' | 'redeem' | 'transactions' = DEFAULT_LEVELS_METRIC;
    const tiers = await tx.loyaltyTier.findMany({
      where: { merchantId: params.merchantId },
      orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
    });
    const visibleTiers = tiers.filter((tier) => !tier.isHidden);
    if (!visibleTiers.length) return;
    const levelRules = visibleTiers.map((tier) => toLevelRule(tier));
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
      periodDays,
    });
  }

  private async promoteTierIfEligible(
    tx: PrismaClientLike,
    params: {
      merchantId: string;
      customerId: string;
      progress: number;
      levelRules?: LevelRule[];
      tiers?: LoyaltyTier[];
      periodDays?: number;
    },
  ) {
    const tiers =
      params.tiers ??
      (await tx.loyaltyTier.findMany({
        where: { merchantId: params.merchantId },
        orderBy: [{ thresholdAmount: 'asc' }, { createdAt: 'asc' }],
      }));
    if (!tiers.length) return;
    const visibleTiers = tiers.filter((tier) => !tier.isHidden);
    if (!visibleTiers.length) return;
    const levelRules =
      params.levelRules ?? visibleTiers.map((tier) => toLevelRule(tier));
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
    const basePeriodDays = normalizeLevelsPeriodDays(
      params.periodDays,
      DEFAULT_LEVELS_PERIOD_DAYS,
    );
    if (currentAssign?.source === 'manual') {
      if (!currentAssign.expiresAt || currentAssign.expiresAt > new Date()) {
        return;
      }
    }
    if (currentAssign?.source === 'promocode') {
      if (!currentAssign.expiresAt || currentAssign.expiresAt > new Date()) {
        return;
      }
    }
    if (currentAssign?.tier?.isHidden) return;
    if (currentAssign?.tierId === target.id) return;
    const assignedAt = new Date();
    const expiresAt = new Date(
      assignedAt.getTime() + basePeriodDays * 24 * 60 * 60 * 1000,
    );
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
        expiresAt,
        source: 'auto',
      },
      create: {
        merchantId: params.merchantId,
        customerId: params.customerId,
        tierId: target.id,
        assignedAt,
        expiresAt,
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
