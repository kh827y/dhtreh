import { BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import {
  PromoCodesService,
} from '../../promocodes/promocodes.service';
import { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import { LoyaltyContextService } from './loyalty-context.service';
import { LoyaltyTierService } from './loyalty-tier.service';
import { LoyaltyLotsService } from './loyalty-lots.service';
import { LoyaltyQueriesService } from './loyalty-queries.service';
import { LoyaltyReferralService } from './loyalty-referrals.service';
import { LoyaltyRegistrationService } from './loyalty-registration.service';
import type {
  ActivePromotionRule,
  OptionalModelsClient,
  PositionInput,
  PrismaClientLike,
  PrismaTx,
  ResolvedPosition,
} from './loyalty-ops.types';
import { safeExecAsync } from '../../../shared/safe-exec';
import {
  HoldStatus,
  TxnType,
  WalletType,
  LedgerAccount,
  Prisma,
  PromotionStatus,
  PromotionRewardType,
} from '@prisma/client';

export class LoyaltyOpsBase {
  protected readonly logger = new Logger('LoyaltyService');
  private readonly referrals: LoyaltyReferralService;
  private readonly registration: LoyaltyRegistrationService;
  private readonly lots: LoyaltyLotsService;
  private readonly queries: LoyaltyQueriesService;

  protected async bestEffort(
    message: string,
    action: () => Promise<unknown>,
    level: 'warn' | 'debug' = 'warn',
  ) {
    const logger =
      level === 'debug'
        ? { warn: this.logger.debug.bind(this.logger) }
        : this.logger;
    await safeExecAsync(action, async () => undefined, logger, message);
  }

  protected async tryUpdateHoldOutlet(
    holdId: string,
    outletId: string,
    context: string,
  ): Promise<boolean> {
    const updated = await safeExecAsync(
      () =>
        this.prisma.hold.update({
          where: { id: holdId },
          data: { outletId },
        }),
      async () => null,
      { warn: this.logger.debug.bind(this.logger) },
      `quote: ${context} update hold outlet`,
    );
    return !!updated;
  }

  // Simple wrappers for modules that directly earn/redeem points without QR/holds
  async earn(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    const context = await this.context.ensureCustomerContext(merchantId, customerId);
    if (context.accrualsBlocked) {
      throw new BadRequestException('Начисления заблокированы администратором');
    }
    await this.bestEffort(
      'earn: ensure merchant stub',
      async () => {
        await this.prisma.merchant.upsert({
          where: { id: merchantId },
          update: {},
          create: { id: merchantId, name: merchantId, initialName: merchantId },
        });
      },
      'debug',
    );

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

  protected sanitizePositions(raw?: PositionInput[] | null): PositionInput[] {
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

  protected normalizeUsageLimit(
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

  protected async resolvePositions(
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

  protected computeEligibleAmountFromPositions(
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

  protected computeTotalsFromPositions(
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

  protected async loadActivePromotionRules(
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

  protected async filterPromotionsForCustomer(params: {
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
    await this.context.ensureCustomerContext(merchantId, customerId);
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

  protected allocateProRata(amounts: number[], target: number): number[] {
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

  protected allocateByWeight(weights: number[], total: number) {
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

  protected normalizePercent(value: unknown, fallback = 100) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(100, Math.max(0, Math.round(num)));
  }

  protected computeRedeemCaps(items: ResolvedPosition[]) {
    return items.map((item) => {
      if (item.allowEarnAndPay === false) return 0;
      const amount = Math.max(0, Math.floor(Number(item.amount || 0)));
      if (amount <= 0) return 0;
      const percent = this.normalizePercent(item.redeemPercent, 100);
      return Math.floor((amount * percent) / 100);
    });
  }

  protected allocateProRataWithCaps(
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

  protected applyEarnAndRedeemToItems(
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

  protected async upsertHoldItems(
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
  protected async applyReferralRewards(
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
    return this.referrals.applyReferralRewards(tx, ctx);
  }

  protected async rollbackReferralRewards(
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
    return this.referrals.rollbackReferralRewards(tx, params);
  }

  protected async loadReferralRewardsForCustomer(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
  ) {
    return this.referrals.loadReferralRewardsForCustomer(
      tx,
      merchantId,
      customerId,
    );
  }

  protected async reopenReferralAfterRefund(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
  ) {
    return this.referrals.reopenReferralAfterRefund(tx, merchantId, customerId);
  }

  async grantRegistrationBonus(params: {
    merchantId?: string;
    customerId?: string;
    outletId?: string | null;
    staffId?: string | null;
  }) {
    return this.registration.grantRegistrationBonus(params);
  }

  async redeem(params: {
    customerId: string;
    merchantId: string;
    amount: number;
    orderId?: string;
  }) {
    const { customerId, merchantId, amount, orderId } = params;
    if (amount <= 0) throw new BadRequestException('Amount must be > 0');
    const context = await this.context.ensureCustomerContext(merchantId, customerId);
    if (context.redemptionsBlocked) {
      throw new BadRequestException('Списания заблокированы администратором');
    }
    await this.bestEffort(
      'redeem: ensure merchant stub',
      async () => {
        await this.prisma.merchant.upsert({
          where: { id: merchantId },
          update: {},
          create: { id: merchantId, name: merchantId, initialName: merchantId },
        });
      },
      'debug',
    );

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

    const context = await this.context.ensureCustomerContext(merchantId, customerId);
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
      await this.tiers.refreshTierAssignmentIfExpired(tx, merchantId, customerId);

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

      if (this.config.isLedgerEnabled() && points > 0) {
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

      if (this.config.isEarnLotsEnabled() && points > 0) {
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
    protected prisma: PrismaService,
    protected metrics: MetricsService,
    protected promoCodes: PromoCodesService,
    protected staffNotifications: TelegramStaffNotificationsService,
    protected staffMotivation: StaffMotivationEngine,
    protected context: LoyaltyContextService,
    protected tiers: LoyaltyTierService,
    protected readonly config: AppConfigService,
  ) {
    this.referrals = new LoyaltyReferralService(
      this.prisma,
      this.metrics,
      this.config,
    );
    this.registration = new LoyaltyRegistrationService(
      this.prisma,
      this.metrics,
      this.context,
      this.config,
      this.logger,
    );
    this.lots = new LoyaltyLotsService(this.prisma);
    this.queries = new LoyaltyQueriesService(
      this.prisma,
      this.tiers,
      this.staffMotivation,
      this.logger,
    );
  }

  // ===== Earn Lots helpers (optional feature) =====
  protected async consumeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    return this.lots.consumeLots(tx, merchantId, customerId, amount, ctx);
  }

  protected async unconsumeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    return this.lots.unconsumeLots(tx, merchantId, customerId, amount, ctx);
  }

  protected async revokeLots(
    tx: PrismaTx,
    merchantId: string,
    customerId: string,
    amount: number,
    ctx: { orderId?: string | null; receiptId?: string | null },
  ) {
    return this.lots.revokeLots(tx, merchantId, customerId, amount, ctx);
  }

  protected sanitizeManualAmount(value?: number | null): number | null {
    if (value == null) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.floor(num));
  }

  protected normalizePhoneOptional(phone?: string | null): string | null {
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

  protected async ensurePointsWallet(merchantId: string, customerId: string) {
    return this.lots.ensurePointsWallet(merchantId, customerId);
  }

  protected async checkManualIntegrationCaps(params: {
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

  protected async getSettings(merchantId: string) {
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

  async balance(merchantId: string, customerId: string) {
    return this.queries.balance(merchantId, customerId);
  }

  async getBaseRatesForCustomer(
    merchantId: string,
    customerId: string,
    _opts?: { outletId?: string | null; eligibleAmount?: number },
  ) {
    return this.queries.getBaseRatesForCustomer(merchantId, customerId, _opts);
  }

  async getCustomerAnalytics(merchantId: string, customerId: string) {
    return this.queries.getCustomerAnalytics(merchantId, customerId);
  }

  async getStaffMotivationConfig(merchantId: string) {
    return this.queries.getStaffMotivationConfig(merchantId);
  }

  async getStaffMotivationLeaderboard(
    merchantId: string,
    options?: { outletId?: string | null; limit?: number },
  ) {
    return this.queries.getStaffMotivationLeaderboard(merchantId, options);
  }

  async outletTransactions(
    merchantId: string,
    outletId: string,
    limit = 20,
    before?: Date,
  ) {
    return this.queries.outletTransactions(merchantId, outletId, limit, before);
  }

  async transactions(
    merchantId: string,
    customerId: string,
    limit = 20,
    before?: Date,
    filters?: { outletId?: string | null; staffId?: string | null },
  ) {
    return this.queries.transactions(
      merchantId,
      customerId,
      limit,
      before,
      filters,
    );
  }

}
