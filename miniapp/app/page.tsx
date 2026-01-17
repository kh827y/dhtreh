"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Onboarding, { type OnboardingForm } from "../components/Onboarding";
import QRCodeOverlay from "../components/QRCodeOverlay";
import TransactionHistory, {
  type Transaction as HistoryTransaction,
  type TransactionType as HistoryType,
} from "../components/TransactionHistory";
import PromoDetailModal, { type PromoDetail } from "../components/PromoDetailModal";
import Toast from "../components/Toast";
import { RegistrationGate } from "../components/RegistrationGate";
import {
  balance,
  bootstrap,
  consentGet,
  consentSet,
  levels,
  mechanicsLevels,
  transactions,
  mintQr,
  referralLink,
  referralActivate,
  promoCodeApply,
  promotionsList,
  promotionClaim,
  profileGet,
  profilePhoneStatus,
  profileSave,
  teleauth,
  type PromotionItem,
  type CustomerProfile,
} from "../lib/api";
import { useMiniappAuthContext } from "../lib/MiniappAuthContext";
import { isValidInitData, waitForInitData } from "../lib/useMiniapp";
import { getProgressPercent, type LevelInfo } from "../lib/levels";
import { getTransactionMeta } from "../lib/transactionMeta";
import { subscribeToLoyaltyEvents } from "../lib/loyaltyEvents";
import { type TransactionItem } from "../lib/reviewUtils";
import { writeTxCache } from "../lib/txCache";
import { getTelegramWebApp } from "../lib/telegram";
import {
  QrCode,
  Gift,
  UserPlus,
  Settings,
  ChevronLeft,
  Bell,
  ChevronRight,
  Wallet,
  Percent,
  Share,
  Copy,
  Check,
  Info,
  MessageCircleQuestion,
  Loader2,
  ScanLine,
  Trophy,
  BellOff,
  Sparkles,
  Zap,
  Clock,
  Tag,
  ShoppingBag,
  Package,
  Coins,
  X,
} from "lucide-react";

const PHONE_NOT_LINKED_MESSAGE = "Вы не привязали номер, попробуйте еще раз";
const PHONE_PENDING_MESSAGE = "Телеграм еще передает номер, попробуйте через несколько секунд.";
const REFERRAL_SHARE_FALLBACK =
  "Переходите по ссылке {link} и получите {bonusamount} бонусов на баланс в программе лояльности {businessname}.";
const REFERRAL_PLACEHOLDER_REGEX = /\{businessname\}|\{bonusamount\}|\{code\}|\{link\}/gi;
const TELEGRAM_SHARE_URL = "https://t.me/share/url";

const BONUS_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-blue-500 to-indigo-500",
];
const PRODUCT_ACCENTS = [
  "bg-indigo-100",
  "bg-rose-100",
  "bg-emerald-100",
  "bg-amber-100",
];
const TX_PAGE_LIMIT = 20;

type MechanicsLevel = {
  id?: string;
  name?: string;
  threshold?: number;
  cashbackPercent?: number | null;
  benefits?: { cashbackPercent?: number | null; [key: string]: unknown } | null;
  rewardPercent?: number | null;
  redeemRateBps?: number | null;
};

type ReferralTemplateContext = {
  merchantName: string;
  bonusAmount: number;
  code: string;
  link: string;
};

type ReferralInfo = {
  code: string;
  link: string;
  description: string;
  merchantName: string;
  friendReward: number;
  inviterReward: number;
  shareMessageTemplate?: string;
};

type MiniappCache = {
  balance?: number | null;
  levelInfo?: LevelInfo | null;
  levelCatalog?: MechanicsLevel[];
  cashbackPercent?: number | null;
  referralEnabled?: boolean;
  referralInfo?: ReferralInfo | null;
  bonusCount?: number | null;
};

type ViewState = "HOME" | "HISTORY" | "PROMOS" | "INVITE" | "SETTINGS" | "ABOUT";

type PromoBadge = {
  icon: ComponentType<{ size?: number; className?: string }>;
  text: string;
  color: string;
};

const profileStorageKey = (merchantId: string, tgId: string | null) =>
  tgId ? `miniapp.profile.v3:${merchantId}:${tgId}` : null;
const profilePendingKey = (merchantId: string, tgId: string | null) =>
  tgId ? `miniapp.profile.pending.v2:${merchantId}:${tgId}` : null;
const localCustomerKey = (merchantId: string, tgId: string | null) =>
  tgId ? `miniapp.customerId.v2:${merchantId}:${tgId}` : null;
const onboardKey = (merchantId: string, tgId: string | null) =>
  tgId ? `miniapp.onboarded.v2:${merchantId}:${tgId}` : null;
const cacheStorageKey = (merchantId: string, customerId: string) =>
  `miniapp.cache.v1:${merchantId}:${customerId}`;

const normalizeReferralTemplate = (template: string | null | undefined, fallback: string): string => {
  if (typeof template === "string") {
    const trimmed = template.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
};

const applyReferralPlaceholders = (template: string, ctx: ReferralTemplateContext): string => {
  return template.replace(REFERRAL_PLACEHOLDER_REGEX, (match) => {
    const token = match.toLowerCase();
    if (token === "{businessname}") return ctx.merchantName || "";
    if (token === "{bonusamount}") {
      return ctx.bonusAmount > 0 && Number.isFinite(ctx.bonusAmount) ? String(Math.round(ctx.bonusAmount)) : "";
    }
    if (token === "{code}") return ctx.code || "";
    if (token === "{link}") return ctx.link || "";
    return "";
  });
};

const buildTelegramShareUrl = (text: string): string => {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  const query = params.toString();
  return query ? `${TELEGRAM_SHARE_URL}?${query}` : TELEGRAM_SHARE_URL;
};

function readStoredCustomerId(merchantId?: string | null, tgId?: string | null): string | null {
  if (!merchantId || !tgId || typeof window === "undefined") return null;
  try {
    const key = localCustomerKey(merchantId, tgId);
    if (!key) return null;
    const stored = localStorage.getItem(key);
    if (stored && stored !== "undefined" && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // ignore storage issues
  }
  return null;
}

function readStoredProfile(merchantId?: string | null, tgId?: string | null): {
  form: { name: string; gender: "male" | "female" | ""; birthDate: string };
  completed: boolean;
} {
  const fallback = { name: "", gender: "", birthDate: "" } as const;
  if (typeof window === "undefined" || !merchantId || !tgId) {
    return { form: { ...fallback }, completed: false };
  }
  try {
    const key = profileStorageKey(merchantId, tgId);
    if (!key) return { form: { ...fallback }, completed: false };
    const saved = localStorage.getItem(key);
    if (!saved) return { form: { ...fallback }, completed: false };
    const parsed = JSON.parse(saved) as { name?: string; gender?: "male" | "female"; birthDate?: string };
    const name = typeof parsed?.name === "string" ? parsed.name : "";
    const gender = parsed?.gender === "male" || parsed?.gender === "female" ? parsed.gender : "";
    const birthDate = typeof parsed?.birthDate === "string" ? parsed.birthDate : "";
    const completed = Boolean(name && gender && birthDate);
    return { form: { name, gender, birthDate }, completed };
  } catch {
    return { form: { ...fallback }, completed: false };
  }
}

function readStoredOnboardFlag(merchantId?: string | null, tgId?: string | null): boolean {
  if (!merchantId || !tgId || typeof window === "undefined") return false;
  try {
    const key = onboardKey(merchantId, tgId);
    if (!key) return false;
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function readCachedState(
  merchantId?: string | null,
  customerId?: string | null,
): MiniappCache | null {
  if (!merchantId || !customerId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheStorageKey(merchantId, customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MiniappCache;
  } catch {
    return null;
  }
}

function writeCachedState(
  merchantId: string | null | undefined,
  customerId: string | null | undefined,
  payload: MiniappCache,
) {
  if (!merchantId || !customerId || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheStorageKey(merchantId, customerId),
      JSON.stringify(payload),
    );
  } catch {
    // ignore storage issues
  }
}

function pickCashbackPercent(levelInfo: LevelInfo | null, levelCatalog: MechanicsLevel[]): number | null {
  if (
    levelInfo?.current &&
    typeof levelInfo.current.earnRateBps === "number" &&
    Number.isFinite(levelInfo.current.earnRateBps)
  ) {
    return Math.round((levelInfo.current.earnRateBps / 100) * 100) / 100;
  }
  const currentName = levelInfo?.current?.name;
  if (!currentName) return null;
  const entry = levelCatalog.find((lvl) => (lvl?.name || "").toLowerCase() === currentName.toLowerCase());
  if (!entry) return null;
  if (typeof entry.cashbackPercent === "number") return entry.cashbackPercent;
  if (entry.benefits && typeof entry.benefits.cashbackPercent === "number") return entry.benefits.cashbackPercent;
  if (typeof entry.rewardPercent === "number") return entry.rewardPercent;
  return null;
}

type TelegramUser = {
  id?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

function getTelegramUser(): TelegramUser | null {
  try {
    const tg = getTelegramWebApp();
    const user = tg?.initDataUnsafe?.user;
    if (!user) return null;
    return {
      id: user.id != null ? String(user.id) : undefined,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      photoUrl: user.photo_url,
    };
  } catch {
    return null;
  }
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isShortCode(value: string): boolean {
  return /^\d{9}$/.test(value);
}

function formatShortCode(value: string): string {
  const digits = value.replace(/\D+/g, "");
  if (digits.length !== 9) return value;
  return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

function normalizeTelegramHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@/, "");
}

function formatPromoDuration(startAt?: string | null, endAt?: string | null): string | null {
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (startAt && endAt) return `${formatDate(startAt)} — ${formatDate(endAt)}`;
  if (endAt) return `до ${formatDate(endAt)}`;
  if (startAt) return `с ${formatDate(startAt)}`;
  return null;
}

function formatTransactionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = date
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(/\./g, "")
    .replace(/,/g, "");
  const timePart = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`.trim();
}

function describePromotion(promo: PromotionItem): string {
  const meta =
    promo.rewardMetadata && typeof promo.rewardMetadata === "object"
      ? (promo.rewardMetadata as Record<string, unknown>)
      : {};
  const pointsRuleType = typeof meta.pointsRuleType === "string" ? meta.pointsRuleType : "";
  const pointsValueRaw = meta.pointsValue ?? promo.rewardValue ?? null;
  const pointsValue = Number(pointsValueRaw);

  if (promo.rewardType === "POINTS") {
    if (pointsRuleType === "multiplier" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return `Начисляем в ${pointsValue} раза больше баллов за товары из акции.`;
    }
    if (pointsRuleType === "percent" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return `Вернем ${Math.round(pointsValue)}% от суммы покупки баллами.`;
    }
    if (pointsRuleType === "fixed" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return `Начислим ${Math.round(pointsValue)} баллов за товары из акции.`;
    }
    if (Number.isFinite(pointsValue) && pointsValue > 0) {
      return `Начислим ${Math.round(pointsValue)} баллов за товары из акции.`;
    }
  }

  if (promo.rewardType === "DISCOUNT") {
    const kind = typeof meta.kind === "string" ? meta.kind.toUpperCase() : "";
    if (kind === "NTH_FREE") {
      const buyQty = Number(meta.buyQty ?? 0);
      const freeQty = Number(meta.freeQty ?? 0);
      if (buyQty > 0 && freeQty > 0) {
        return `Купите ${buyQty} шт. товаров из акции, получите ${freeQty} в подарок.`;
      }
      if (buyQty > 0) {
        return `Купите ${buyQty} шт. товаров из акции и получите подарок.`;
      }
      return "Подарок при покупке товаров из акции.";
    }
    if (kind === "FIXED_PRICE") {
      const priceValue = Number(meta.price ?? promo.rewardValue);
      if (Number.isFinite(priceValue) && priceValue >= 0) {
        return `Акционная цена ${Math.round(priceValue)} ₽ на товары из акции.`;
      }
      return "Акционная цена на товары из акции.";
    }
    if (Number.isFinite(pointsValue) && pointsValue > 0) {
      return `Скидка ${Math.round(pointsValue)}% на товары из акции.`;
    }
    return "Скидка на товары из акции.";
  }

  if (promo.rewardType === "CASHBACK") {
    const pct = Number(promo.rewardValue);
    if (Number.isFinite(pct) && pct > 0) {
      return `Вернем ${Math.round(pct)}% от суммы покупки баллами.`;
    }
  }

  if (promo.rewardType === "LEVEL_UP") {
    return "Покупки по акции помогают быстрее повысить уровень.";
  }

  const fallback = promo.description?.trim();
  return fallback || "Специальное предложение";
}

function validateBirthDate(value: string): string | null {
  if (!value) return "Укажите дату рождения";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Укажите корректную дату рождения";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const currentYear = new Date().getFullYear();
  const isRangeValid =
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    year >= 1900 &&
    year <= currentYear &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31;
  if (!isRangeValid) return "Укажите корректную дату рождения";
  const dateObj = new Date(year, month - 1, day);
  const isCalendarValid =
    dateObj.getFullYear() === year &&
    dateObj.getMonth() === month - 1 &&
    dateObj.getDate() === day;
  if (!isCalendarValid) return "Укажите корректную дату рождения";
  return null;
}

function resolvePromoBadge(promo: PromotionItem): PromoBadge | null {
  const meta =
    promo.rewardMetadata && typeof promo.rewardMetadata === "object"
      ? (promo.rewardMetadata as Record<string, unknown>)
      : {};
  const pointsRuleType = typeof meta.pointsRuleType === "string" ? meta.pointsRuleType : "";
  const pointsValueRaw = meta.pointsValue ?? promo.rewardValue;
  const pointsValue = Number(pointsValueRaw);

  if (promo.rewardType === "POINTS") {
    if (pointsRuleType === "multiplier" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return { icon: Zap, text: `x${pointsValue} Баллов`, color: "bg-purple-600 text-white" };
    }
    if (pointsRuleType === "percent" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return { icon: Percent, text: `${pointsValue}% Кэшбэк`, color: "bg-emerald-600 text-white" };
    }
    if (pointsRuleType === "fixed" && Number.isFinite(pointsValue) && pointsValue > 0) {
      return { icon: Coins, text: `+${Math.round(pointsValue)} Б`, color: "bg-yellow-500 text-white" };
    }
    return null;
  }

  if (promo.rewardType === "DISCOUNT") {
    const kind = typeof meta.kind === "string" ? meta.kind.toUpperCase() : "";
    if (kind === "NTH_FREE") {
      const buyQty = Number(meta.buyQty ?? 0);
      const freeQty = Number(meta.freeQty ?? 0);
      const label = buyQty > 0 && freeQty > 0 ? `${buyQty}+${freeQty}` : "Акция";
      return { icon: Package, text: label, color: "bg-pink-500 text-white" };
    }
    if (kind === "FIXED_PRICE") {
      const priceValue = Number(meta.price ?? promo.rewardValue);
      if (Number.isFinite(priceValue) && priceValue >= 0) {
        return { icon: Tag, text: `${Math.round(priceValue)} ₽`, color: "bg-gray-900 text-white" };
      }
    }
  }

  if (promo.rewardType === "CASHBACK") {
    const pct = Number(promo.rewardValue);
    if (Number.isFinite(pct) && pct > 0) {
      return { icon: Percent, text: `${Math.round(pct)}% Кэшбэк`, color: "bg-emerald-600 text-white" };
    }
  }

  return null;
}

function getPromoTargets(promo: PromotionItem): { hasTargets: boolean } {
  const meta =
    promo.rewardMetadata && typeof promo.rewardMetadata === "object"
      ? (promo.rewardMetadata as Record<string, unknown>)
      : {};
  const productIds = Array.isArray(meta.productIds) ? meta.productIds : [];
  const categoryIds = Array.isArray(meta.categoryIds) ? meta.categoryIds : [];
  return { hasTargets: productIds.length > 0 || categoryIds.length > 0 };
}

function mergeTransactionItems(prev: TransactionItem[], next: TransactionItem[]): TransactionItem[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((item) => item.id));
  const merged = [...prev];
  for (const item of next) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}

function resolveTxNextBefore(items: TransactionItem[], nextBefore?: string | null): string | null {
  if (items.length < TX_PAGE_LIMIT) return null;
  if (typeof nextBefore === "string" && nextBefore.trim()) return nextBefore;
  return null;
}

function buildHistoryTransactions(items: TransactionItem[]): HistoryTransaction[] {
  const purchaseGroups = new Map<
    string,
    {
      id: string;
      orderId: string;
      createdAt: string;
      receiptTotal: number | null;
      redeemApplied: number | null;
      cashback: number;
      pointsBurned: number;
    }
  >();
  const refundGroups = new Map<
    string,
    {
      id: string;
      orderId: string;
      createdAt: string;
      receiptTotal: number | null;
      redeemApplied: number | null;
      pointsRestored: number;
      pointsRevoked: number;
    }
  >();
  const singles: Array<{ sortKey: number; tx: HistoryTransaction }> = [];

  const sorted = [...items].filter((item) => !item.canceledAt);
  sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const item of sorted) {
    const meta = getTransactionMeta(item.type, item.source);
    const orderId = typeof item.orderId === "string" && item.orderId.trim() ? item.orderId.trim() : null;
    const typeLower = item.type ? item.type.toLowerCase() : "";
    const isRegistration = typeLower.includes("registration") || orderId === "registration_bonus";

    if (!isRegistration && orderId && (meta.kind === "earn" || meta.kind === "redeem")) {
      const key = `purchase:${orderId}`;
      const group = purchaseGroups.get(key) || {
        id: key,
        orderId,
        createdAt: item.createdAt,
        receiptTotal: item.receiptTotal ?? null,
        redeemApplied: item.redeemApplied ?? null,
        cashback: 0,
        pointsBurned: 0,
      };
      const createdAt = new Date(item.createdAt).getTime();
      if (createdAt > new Date(group.createdAt).getTime()) {
        group.createdAt = item.createdAt;
      }
      if (item.receiptTotal != null) group.receiptTotal = item.receiptTotal;
      if (item.redeemApplied != null) group.redeemApplied = item.redeemApplied;
      if (meta.kind === "earn" && item.amount > 0) {
        group.cashback += Math.max(0, item.amount);
      }
      if (meta.kind === "redeem" && item.amount < 0) {
        group.pointsBurned += Math.max(0, Math.abs(item.amount));
      }
      purchaseGroups.set(key, group);
      continue;
    }

    if (orderId && meta.kind === "refund") {
      const key = `refund:${orderId}`;
      const group = refundGroups.get(key) || {
        id: key,
        orderId,
        createdAt: item.createdAt,
        receiptTotal: item.receiptTotal ?? null,
        redeemApplied: item.redeemApplied ?? null,
        pointsRestored: 0,
        pointsRevoked: 0,
      };
      const createdAt = new Date(item.createdAt).getTime();
      if (createdAt > new Date(group.createdAt).getTime()) {
        group.createdAt = item.createdAt;
      }
      if (item.receiptTotal != null) group.receiptTotal = item.receiptTotal;
      if (item.redeemApplied != null) group.redeemApplied = item.redeemApplied;
      if (item.amount > 0) group.pointsRestored += Math.max(0, item.amount);
      if (item.amount < 0) group.pointsRevoked += Math.max(0, Math.abs(item.amount));
      refundGroups.set(key, group);
      continue;
    }

    const createdAt = item.createdAt;
    const date = formatTransactionDate(createdAt);
    const description = item.comment || undefined;
    let type: HistoryType = "campaign";
    let title = meta.title;
    let cashback = 0;
    let pointsBurned: number | undefined;

    if (item.pending) {
      type = isRegistration ? "signup" : "admin_bonus";
      title = isRegistration ? "Регистрация в программе" : "Начисление";
      const days =
        typeof item.daysUntilMature === "number"
          ? item.daysUntilMature
          : item.maturesAt
            ? Math.max(0, Math.ceil((Date.parse(item.maturesAt) - Date.now()) / (24 * 60 * 60 * 1000)))
            : null;
      const note =
        days === 0
          ? "Баллы будут начислены сегодня"
          : days === 1
            ? "Баллы будут начислены завтра"
            : days != null
              ? `Баллы будут начислены через ${days} дней`
              : "Баллы будут начислены позже";
      singles.push({
        sortKey: new Date(createdAt).getTime(),
        tx: {
          id: item.id,
          title,
          description: note,
          date,
          amount: 0,
          cashback: Math.max(0, item.amount),
          type,
        },
      });
      continue;
    }

    if (meta.kind === "promo") {
      type = "promo";
      cashback = Math.max(0, item.amount);
    } else if (meta.kind === "campaign") {
      type = "campaign";
      cashback = Math.max(0, item.amount);
    } else if (meta.kind === "referral") {
      type = item.amount < 0 ? "referral_refund" : "referral";
      cashback = Math.max(0, Math.abs(item.amount));
    } else if (meta.kind === "burn") {
      type = "expiration";
      cashback = Math.max(0, Math.abs(item.amount));
    } else if (meta.kind === "adjust") {
      if (item.amount < 0) {
        type = "expiration";
        cashback = Math.max(0, Math.abs(item.amount));
      } else {
        type = "admin_bonus";
        cashback = Math.max(0, item.amount);
      }
    } else if (meta.kind === "complimentary") {
      type = "admin_bonus";
      cashback = Math.max(0, item.amount);
    } else if (isRegistration) {
      type = "signup";
      title = "Регистрация в программе";
      const note = description || "Приветственный бонус";
      cashback = Math.max(0, item.amount);
      singles.push({
        sortKey: new Date(createdAt).getTime(),
        tx: {
          id: item.id,
          title,
          description: note,
          date,
          amount: 0,
          cashback,
          pointsBurned,
          type,
        },
      });
      continue;
    } else if (meta.kind === "earn") {
      type = "admin_bonus";
      cashback = Math.max(0, item.amount);
    } else if (meta.kind === "redeem") {
      type = "purchase";
      pointsBurned = Math.max(0, Math.abs(item.amount));
    }

    singles.push({
      sortKey: new Date(createdAt).getTime(),
      tx: {
        id: item.id,
        title,
        description: description || undefined,
        date,
        amount: 0,
        cashback,
        pointsBurned,
        type,
      },
    });
  }

  const grouped: Array<{ sortKey: number; tx: HistoryTransaction }> = [];
  for (const group of purchaseGroups.values()) {
    const amountRaw =
      typeof group.receiptTotal === "number"
        ? Math.max(0, group.receiptTotal - Math.max(0, group.redeemApplied ?? 0))
        : 0;
    grouped.push({
      sortKey: new Date(group.createdAt).getTime(),
      tx: {
        id: group.id,
        title: "Покупка",
        date: formatTransactionDate(group.createdAt),
        amount: amountRaw,
        cashback: Math.max(0, group.cashback),
        pointsBurned: group.pointsBurned > 0 ? group.pointsBurned : undefined,
        type: "purchase",
      },
    });
  }
  for (const group of refundGroups.values()) {
    const amountRaw =
      typeof group.receiptTotal === "number"
        ? Math.max(0, group.receiptTotal - Math.max(0, group.redeemApplied ?? 0))
        : 0;
    grouped.push({
      sortKey: new Date(group.createdAt).getTime(),
      tx: {
        id: group.id,
        title: "Возврат",
        date: formatTransactionDate(group.createdAt),
        amount: amountRaw,
        cashback: Math.max(0, group.pointsRevoked),
        pointsBurned: group.pointsRestored > 0 ? group.pointsRestored : undefined,
        type: "refund",
      },
    });
  }

  const all = [...grouped, ...singles];
  all.sort((a, b) => b.sortKey - a.sortKey);
  return all.map((entry) => entry.tx);
}

function MiniappPage() {
  const auth = useMiniappAuthContext();
  const merchantId = auth.merchantId;
  const setAuthCustomerId = auth.setCustomerId;
  const setAuthTeleOnboarded = auth.setTeleOnboarded;
  const setAuthTeleHasPhone = auth.setTeleHasPhone;
  const teleOnboarded = auth.teleOnboarded;
  const teleHasPhone = auth.teleHasPhone;
  const initData = auth.initData;
  const themeTtl = auth.theme?.ttl;
  const supportTelegram = auth.supportTelegram;
  const settingsReferralEnabled = auth.referralEnabled;

  const [telegramUser] = useState<TelegramUser | null>(() => getTelegramUser());
  const telegramUserId = auth.telegramUserId ?? telegramUser?.id ?? null;

  const storedProfile = useMemo(
    () => readStoredProfile(merchantId, telegramUserId),
    [merchantId, telegramUserId],
  );
  const storedCustomerId = useMemo(
    () => readStoredCustomerId(merchantId, telegramUserId),
    [merchantId, telegramUserId],
  );
  const cachedCustomerId =
    teleOnboarded === false ? null : auth.customerId ?? storedCustomerId;
  const cachedState = useMemo(
    () => readCachedState(merchantId, cachedCustomerId),
    [merchantId, cachedCustomerId],
  );

  const [customerId, setCustomerId] = useState<string | null>(() => storedCustomerId);
  const authCustomerId = auth.customerId;
  const customerSynced =
    !authCustomerId || (customerId && authCustomerId === customerId);
  const canLoadCustomerData = Boolean(
    merchantId && customerId && customerSynced && teleOnboarded === true,
  );
  const [bal, setBal] = useState<number | null>(() => cachedState?.balance ?? null);
  const [tx, setTx] = useState<TransactionItem[]>([]);
  const [txNextBefore, setTxNextBefore] = useState<string | null>(null);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(() => cachedState?.levelInfo ?? null);
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>(() => cachedState?.levelCatalog ?? []);
  const [cashbackPercent, setCashbackPercent] = useState<number | null>(() => cachedState?.cashbackPercent ?? null);
  const [phone, setPhone] = useState<string | null>(null);
  const [pendingCustomerIdForPhone, setPendingCustomerIdForPhone] = useState<string | null>(null);
  const [phoneShareStage, setPhoneShareStage] = useState<"idle" | "waiting" | "saving">("idle");
  const [phoneShareError, setPhoneShareError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<OnboardingForm>(() => ({
    ...storedProfile.form,
    inviteCode: "",
  }));
  const [profileConsent, setProfileConsent] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [localOnboarded, setLocalOnboarded] = useState<boolean>(() =>
    readStoredOnboardFlag(merchantId, telegramUserId),
  );
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(() => cachedState?.referralInfo ?? null);
  const [referralEnabled, setReferralEnabled] = useState<boolean>(() => cachedState?.referralEnabled ?? false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [promotionsResolved, setPromotionsResolved] = useState(false);
  const [cachedBonusCount, setCachedBonusCount] = useState<number | null>(() =>
    typeof cachedState?.bonusCount === "number" ? cachedState.bonusCount : null,
  );
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapAttempted, setBootstrapAttempted] = useState(false);
  const [view, setView] = useState<ViewState>("HOME");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrTtlSec, setQrTtlSec] = useState<number | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState<number | null>(null);
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [selectedPromo, setSelectedPromo] = useState<PromoDetail | null>(null);
  const [isAllBonusesOpen, setIsAllBonusesOpen] = useState(false);
  const [showNotificationAlert, setShowNotificationAlert] = useState(false);
  const [showCodeCopied, setShowCodeCopied] = useState(false);

  const pendingProfileSync = useRef(false);
  const bootstrapInFlightRef = useRef(false);
  const txLoadSeq = useRef(0);
  const txLoadingMoreRef = useRef(false);
  const txLoadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalOnboarded(readStoredOnboardFlag(merchantId, telegramUserId));
  }, [merchantId, telegramUserId]);

  useEffect(() => {
    setBootstrapReady(false);
    setBootstrapAttempted(false);
    bootstrapInFlightRef.current = false;
    if (typeof window !== "undefined") {
      const w = window as typeof window & { __miniappBootstrapPending?: { merchantId: string; customerId: string } };
      if (w.__miniappBootstrapPending) {
        w.__miniappBootstrapPending = undefined;
      }
    }
  }, [merchantId, customerId]);

  useEffect(() => {
    if (!merchantId || !cachedCustomerId) return;
    const cached = readCachedState(merchantId, cachedCustomerId);
    if (!cached) {
      setBal(null);
      setLevelInfo(null);
      setCashbackPercent(null);
      setReferralInfo(null);
      setReferralEnabled(false);
      setCachedBonusCount(null);
      return;
    }
    setBal(typeof cached.balance === "number" ? cached.balance : null);
    setLevelInfo(cached.levelInfo ?? null);
    setLevelCatalog(Array.isArray(cached.levelCatalog) ? cached.levelCatalog : []);
    setCashbackPercent(typeof cached.cashbackPercent === "number" ? cached.cashbackPercent : null);
    if (typeof cached.referralEnabled === "boolean") {
      setReferralEnabled(cached.referralEnabled);
    }
    setReferralInfo(cached.referralInfo ?? null);
    setCachedBonusCount(typeof cached.bonusCount === "number" ? cached.bonusCount : null);
  }, [merchantId, cachedCustomerId]);

  useEffect(() => {
    setLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading) {
      if (auth.customerId) {
        setCustomerId(auth.customerId);
      } else if (teleOnboarded === false) {
        setCustomerId(null);
      }
    }
  }, [auth.loading, auth.error, auth.customerId, teleOnboarded]);

  useEffect(() => {
    if (typeof settingsReferralEnabled !== "boolean") return;
    if (referralInfo) return;
    setReferralEnabled(settingsReferralEnabled);
  }, [settingsReferralEnabled, referralInfo]);

  useEffect(() => {
    if (teleOnboarded === null) return;
    if (!merchantId) return;
    if (!telegramUserId) return;
    const key = onboardKey(merchantId, telegramUserId);
    if (!key) return;
    if (teleOnboarded) {
      try {
        localStorage.setItem(key, "1");
      } catch {}
      setLocalOnboarded(true);
    } else {
      setLocalOnboarded(false);
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }, [teleOnboarded, merchantId, telegramUserId]);

  useEffect(() => {
    if (!merchantId || !telegramUserId) return;
    try {
      const key = profileStorageKey(merchantId, telegramUserId);
      if (!key) return;
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        const name = typeof parsed.name === "string" ? parsed.name : "";
        const gender = parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : "";
        const birthDate = typeof parsed.birthDate === "string" ? parsed.birthDate : "";
        setProfileForm((prev) => ({ ...prev, name, gender, birthDate }));
      }
    } catch {
      // ignore
    }
  }, [merchantId, telegramUserId]);

  useEffect(() => {
    if (!canLoadCustomerData) return;
    const snapshot: MiniappCache = {
      balance: typeof bal === "number" ? bal : null,
      levelInfo: levelInfo ?? null,
      levelCatalog,
      cashbackPercent: typeof cashbackPercent === "number" ? cashbackPercent : null,
      referralEnabled,
      referralInfo: referralInfo ?? null,
      bonusCount: typeof cachedBonusCount === "number" ? cachedBonusCount : null,
    };
    writeCachedState(merchantId, customerId, snapshot);
  }, [
    canLoadCustomerData,
    merchantId,
    customerId,
    bal,
    levelInfo,
    levelCatalog,
    cashbackPercent,
    referralEnabled,
    referralInfo,
    cachedBonusCount,
  ]);

  useEffect(() => {
    setPromotionsResolved(false);
    setBootstrapReady(false);
  }, [customerId]);

  const lastCustomerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customerId) return;
    if (lastCustomerRef.current && lastCustomerRef.current !== customerId) {
      setTx([]);
      setTxNextBefore(null);
      setPromotions([]);
      setPromotionsResolved(false);
      setReferralInfo(null);
      setReferralEnabled(false);
      setCachedBonusCount(null);
    }
    lastCustomerRef.current = customerId;
  }, [customerId]);

  const applyServerProfile = useCallback(
    (profile: CustomerProfile | null) => {
      if (!profile) return;
      const name = profile?.name || "";
      const gender = profile?.gender === "male" || profile?.gender === "female" ? profile.gender : "";
      const birthDate = typeof profile?.birthDate === "string" ? profile.birthDate : "";
      setProfileForm((prev) => ({ ...prev, name, gender, birthDate }));
      const valid = Boolean(name && gender && birthDate);
      if (merchantId && telegramUserId && valid) {
        try {
          const profileKey = profileStorageKey(merchantId, telegramUserId);
          const onboardStorageKey = onboardKey(merchantId, telegramUserId);
          if (profileKey) {
            localStorage.setItem(profileKey, JSON.stringify({ name, gender, birthDate }));
          }
          if (onboardStorageKey) {
            localStorage.setItem(onboardStorageKey, "1");
          }
        } catch {}
        setLocalOnboarded(true);
      }
    },
    [merchantId, telegramUserId],
  );

  const applyProfileSaveResult = useCallback(
    (profile: CustomerProfile | null, fallbackCustomerId: string | null) => {
      const fallback =
        typeof fallbackCustomerId === "string" && fallbackCustomerId.trim()
          ? fallbackCustomerId.trim()
          : "";
      const nextIdRaw =
        typeof profile?.customerId === "string" && profile.customerId.trim()
          ? profile.customerId.trim()
          : fallback;
      if (!nextIdRaw) return fallback || null;
      if (merchantId && telegramUserId) {
        try {
          const key = localCustomerKey(merchantId, telegramUserId);
          if (key) {
            localStorage.setItem(key, nextIdRaw);
          }
        } catch {
          // ignore
        }
      }
      setCustomerId(nextIdRaw);
      setAuthCustomerId(nextIdRaw);
      return nextIdRaw;
    },
    [merchantId, telegramUserId, setAuthCustomerId],
  );

  useEffect(() => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    if (!bootstrapAttempted || bootstrapReady || bootstrapInFlightRef.current) return;
    let cancelled = false;
    const mid = merchantId;
    const cid = customerId;
    (async () => {
      try {
        const p = await profileGet(mid, cid);
        if (cancelled) return;
        applyServerProfile(p);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLoadCustomerData, bootstrapAttempted, bootstrapReady, applyServerProfile]);

  useEffect(() => {
    if (!merchantId || !customerId || !telegramUserId) return;
    if (teleHasPhone === false) return;
    if (pendingProfileSync.current) return;
    const key = profileStorageKey(merchantId, telegramUserId);
    const pendingKey = profilePendingKey(merchantId, telegramUserId);
    if (!key || !pendingKey) return;
    let rawPending: string | null = null;
    try {
      rawPending = localStorage.getItem(pendingKey);
    } catch {
      rawPending = null;
    }
    if (!rawPending) return;
    let parsed: { name?: string; gender?: string; birthDate?: string } | null = null;
    try {
      parsed = JSON.parse(rawPending);
    } catch {
      parsed = null;
    }
    const name = parsed?.name ? String(parsed.name).trim() : "";
    const gender = parsed?.gender === "male" || parsed?.gender === "female" ? parsed.gender : "";
    const birthDate = typeof parsed?.birthDate === "string" ? parsed.birthDate : "";
    if (!name || !gender || !birthDate) {
      try {
        localStorage.removeItem(pendingKey);
      } catch {}
      return;
    }
    pendingProfileSync.current = true;
    (async () => {
      try {
        const saved = await profileSave(merchantId, customerId, { name, gender, birthDate });
        applyProfileSaveResult(saved, customerId);
        try {
          localStorage.setItem(key, JSON.stringify({ name, gender, birthDate }));
          localStorage.removeItem(pendingKey);
        } catch {}
        setProfileForm((prev) => ({ ...prev, name, gender, birthDate }));
        setAuthTeleOnboarded(true);
        setLocalOnboarded(true);
        try {
          const onboardStorageKey = onboardKey(merchantId, telegramUserId);
          if (onboardStorageKey) localStorage.setItem(onboardStorageKey, "1");
        } catch {}
      } catch (error) {
        setToast({ msg: `Не удалось синхронизировать профиль: ${resolveErrorMessage(error)}`, type: "error" });
      } finally {
        pendingProfileSync.current = false;
      }
    })();
  }, [
    merchantId,
    customerId,
    telegramUserId,
    teleHasPhone,
    applyProfileSaveResult,
    setToast,
    setAuthTeleOnboarded,
  ]);

  useEffect(() => {
    if (!initData) return;
    if (profileForm.inviteCode) return;
    try {
      const u = new URLSearchParams(initData);
      const sp = u.get("start_param") || u.get("startapp");
      if (!sp) return;
      const refMatch = /^ref[_-](.+)$/i.exec(sp.trim());
      if (refMatch && refMatch[1]) {
        setProfileForm((prev) => ({ ...prev, inviteCode: refMatch[1] }));
        return;
      }
      if (/^[A-Z0-9]{5,}$/i.test(sp)) {
        setProfileForm((prev) => ({ ...prev, inviteCode: sp }));
      }
    } catch {
      // ignore
    }
  }, [initData, profileForm.inviteCode]);

  const syncConsent = useCallback(async () => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    const mid = merchantId;
    const cid = customerId;
    try {
      const r = await consentGet(mid, cid);
      if (!r.consentAt && !r.granted) {
        setConsent(true);
        void consentSet(mid, cid, true).catch(() => {});
      } else {
        setConsent(!!r.granted);
      }
    } catch {
      // ignore
    }
  }, [canLoadCustomerData, customerId, merchantId]);

  const loadBalance = useCallback(async () => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    const mid = merchantId;
    const cid = customerId;
    try {
      const resp = await balance(mid, cid);
      setBal(resp.balance);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить баланс: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [canLoadCustomerData, merchantId, customerId]);

  const loadTx = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    const mid = merchantId;
    const cid = customerId;
    const requestId = ++txLoadSeq.current;
    try {
      const resp = await transactions(mid, cid, TX_PAGE_LIMIT, undefined, { fresh: opts?.fresh });
      if (txLoadSeq.current !== requestId) return;
      const items = resp.items as TransactionItem[];
      setTx(items);
      setTxNextBefore(resolveTxNextBefore(items, resp.nextBefore));
      writeTxCache(mid, cid, items);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить историю: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [canLoadCustomerData, merchantId, customerId]);

  const loadMoreTx = useCallback(async () => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    if (!txNextBefore || txLoadingMoreRef.current) return;
    txLoadingMoreRef.current = true;
    setTxLoadingMore(true);
    const mid = merchantId;
    const cid = customerId;
    const requestId = txLoadSeq.current;
    try {
      const resp = await transactions(mid, cid, TX_PAGE_LIMIT, txNextBefore, { fresh: true });
      if (txLoadSeq.current !== requestId) return;
      const items = resp.items as TransactionItem[];
      setTx((prev) => {
        const merged = mergeTransactionItems(prev, items);
        writeTxCache(mid, cid, merged);
        return merged;
      });
      setTxNextBefore(resolveTxNextBefore(items, resp.nextBefore));
    } catch (error) {
      setToast({ msg: `Не удалось загрузить историю: ${resolveErrorMessage(error)}`, type: "error" });
    } finally {
      txLoadingMoreRef.current = false;
      setTxLoadingMore(false);
    }
  }, [canLoadCustomerData, merchantId, customerId, txNextBefore]);

  const loadLevels = useCallback(async () => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    const mid = merchantId;
    const cid = customerId;
    try {
      const resp = await levels(mid, cid);
      setLevelInfo(resp);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить уровни: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [canLoadCustomerData, merchantId, customerId]);

  const loadLevelCatalog = useCallback(async () => {
    if (!merchantId) return;
    try {
      const resp = await mechanicsLevels(merchantId);
      const levelsList = Array.isArray(resp.levels) ? resp.levels : [];
      setLevelCatalog(levelsList);
    } catch {
      // ignore
    }
  }, [merchantId]);

  const loadPromotions = useCallback(async () => {
    if (!canLoadCustomerData) return;
    if (!merchantId || !customerId) return;
    const mid = merchantId;
    const cid = customerId;
    try {
      const resp = await promotionsList(mid, cid);
      setPromotions(resp || []);
      setPromotionsResolved(true);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить акции: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [canLoadCustomerData, merchantId, customerId]);

  const loadBootstrap = useCallback(async () => {
    if (!canLoadCustomerData) return false;
    if (!merchantId || !customerId) return false;
    if (bootstrapInFlightRef.current) return false;
    bootstrapInFlightRef.current = true;
    if (typeof window !== "undefined") {
      const w = window as typeof window & { __miniappBootstrapPending?: { merchantId: string; customerId: string } };
      w.__miniappBootstrapPending = { merchantId, customerId };
    }
    try {
      const mid = merchantId;
      const cid = customerId;
      const resp = await bootstrap(mid, cid, { transactionsLimit: TX_PAGE_LIMIT });
      if (resp.profile) applyServerProfile(resp.profile);
      if (resp.consent) {
        if (!resp.consent.consentAt && !resp.consent.granted) {
          setConsent(true);
          void consentSet(mid, cid, true).catch(() => {});
        } else {
          setConsent(Boolean(resp.consent.granted));
        }
      } else {
        setConsent(true);
        void consentSet(mid, cid, true).catch(() => {});
      }
      if (resp.balance) setBal(resp.balance.balance);
      if (resp.levels) setLevelInfo(resp.levels);
      if (resp.transactions) {
        const items = resp.transactions.items as TransactionItem[];
        setTx(items);
        setTxNextBefore(resolveTxNextBefore(items, resp.transactions.nextBefore));
        writeTxCache(mid, cid, items);
      }
      if (resp.promotions) {
        setPromotions(resp.promotions);
        setPromotionsResolved(true);
      }
      setBootstrapReady(true);
      return true;
    } catch {
      return false;
    } finally {
      setBootstrapAttempted(true);
      bootstrapInFlightRef.current = false;
      if (typeof window !== "undefined") {
        const w = window as typeof window & { __miniappBootstrapPending?: { merchantId: string; customerId: string } };
        if (
          w.__miniappBootstrapPending?.merchantId === merchantId &&
          w.__miniappBootstrapPending?.customerId === customerId
        ) {
          w.__miniappBootstrapPending = undefined;
        }
      }
    }
  }, [canLoadCustomerData, merchantId, customerId, applyServerProfile]);

  useEffect(() => {
    if (auth.loading || !customerId) return;
    if (!canLoadCustomerData) return;
    if (bootstrapAttempted) return;
    if (bootstrapInFlightRef.current) return;
    (async () => {
      const ok = await loadBootstrap();
      if (!ok) {
        syncConsent();
        loadBalance();
        loadTx({ fresh: true });
        loadLevels();
        loadPromotions();
      }
    })();
  }, [
    auth.loading,
    customerId,
    canLoadCustomerData,
    bootstrapAttempted,
    loadBootstrap,
    syncConsent,
    loadBalance,
    loadTx,
    loadLevels,
    loadPromotions,
  ]);

  useEffect(() => {
    if (!auth.loading) {
      loadLevelCatalog();
    }
  }, [auth.loading, loadLevelCatalog]);

  useEffect(() => {
    if (!["HISTORY", "PROMOS", "INVITE"].includes(view)) return;
    if (typeof window === "undefined") return;
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    const raf = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  useEffect(() => {
    if (view !== "HISTORY") return;
    if (!txNextBefore) return;
    const target = txLoadMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreTx();
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [view, txNextBefore, loadMoreTx]);

  useEffect(() => {
    if (!customerId) return;
    const value = pickCashbackPercent(levelInfo, levelCatalog);
    if (value == null) return;
    setCashbackPercent(value);
  }, [customerId, levelInfo, levelCatalog]);

  useEffect(() => {
    if (!canLoadCustomerData) return;
    const unsubscribe = subscribeToLoyaltyEvents((payload) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const eventMerchant = data.merchantId ? String(data.merchantId) : "";
      if (eventMerchant && eventMerchant !== merchantId) return;
      const eventMc =
        data.customerId
          ? String(data.customerId)
          : data.merchantCustomerId
            ? String(data.merchantCustomerId)
            : "";
      if (eventMc && customerId && eventMc !== customerId) return;
      const declaredType = typeof data.eventType === "string" ? data.eventType.toLowerCase() : "";
      const txnTypeRaw = data.transactionType ?? data.type ?? data.eventType;
      const txnType = typeof txnTypeRaw === "string" ? txnTypeRaw.toLowerCase() : "";
      const matches =
        declaredType === "loyalty.transaction" ||
        txnType.includes("purchase") ||
        txnType.includes("earn") ||
        txnType.includes("redeem") ||
        txnType.includes("commit");
      if (!matches) return;
      loadBalance();
      loadTx({ fresh: true });
      loadLevels();
    },
    {
      merchantId,
      customerId,
    });
    return () => {
      unsubscribe();
    };
  }, [canLoadCustomerData, merchantId, customerId, loadBalance, loadTx, loadLevels]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!canLoadCustomerData) return;
        loadBalance();
        loadTx({ fresh: true });
        loadLevels();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canLoadCustomerData, loadBalance, loadTx, loadLevels]);

  const handlePromotionClaim = useCallback(
    async (promotionId: string) => {
      if (!merchantId || !customerId) {
        setToast({ msg: "Не удалось определить клиента", type: "error" });
        return;
      }
      try {
        const resp = await promotionClaim(merchantId, customerId, promotionId, null);
        const message = resp.alreadyClaimed
          ? "Уже получено"
          : resp.pointsIssued > 0
            ? `Начислено ${resp.pointsIssued} баллов`
            : "Получено";
        setToast({ msg: message, type: "success" });
        if (resp.ok) {
          setBal(resp.balance);
          setPromotions((prev) =>
            prev.map((promo) =>
              promo.id === promotionId
                ? { ...promo, claimed: true, canClaim: false }
                : promo,
            ),
          );
        }
        void Promise.allSettled([loadBalance(), loadTx({ fresh: true }), loadLevels(), loadPromotions()]);
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: "error" });
      }
    },
    [merchantId, customerId, loadBalance, loadTx, loadLevels, loadPromotions],
  );

  useEffect(() => {
    if (auth.loading) return;
    if (!canLoadCustomerData) return;
    const referralCustomerId = authCustomerId || customerId;
    if (!merchantId || !referralCustomerId) return;
    let cancelled = false;
    setReferralLoading(true);
    referralLink(referralCustomerId, merchantId)
      .then((data) => {
        if (cancelled) return;
        const program = data.program as (typeof data.program & { message?: string | null }) | undefined;
        const description =
          program?.description ||
          program?.messageTemplate ||
          program?.message ||
          program?.shareMessageTemplate ||
          "";
        const info: ReferralInfo = {
          code: data.code,
          link: data.link,
          description,
          merchantName: data.program?.merchantName || "",
          friendReward: typeof data.program?.refereeReward === "number" ? data.program.refereeReward : 0,
          inviterReward: typeof data.program?.referrerReward === "number" ? data.program.referrerReward : 0,
          shareMessageTemplate:
            typeof data.program?.shareMessageTemplate === "string" ? data.program.shareMessageTemplate : undefined,
        };
        setReferralInfo(info);
        setReferralEnabled(true);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = resolveErrorMessage(err).toLowerCase();
        const disabled =
          message.includes("не активна") ||
          message.includes("не активен") ||
          message.includes("referral") ||
          message.includes("program");
        if (disabled) {
          setReferralInfo(null);
          setReferralEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) setReferralLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, canLoadCustomerData, merchantId, customerId, authCustomerId]);

  const qrEffectiveTtl = useMemo(() => {
    if (typeof themeTtl === "number" && Number.isFinite(themeTtl)) return themeTtl;
    return 300;
  }, [themeTtl]);

  const refreshQr = useCallback(async () => {
    if (!customerId) return;
    try {
      setQrRefreshing(true);
      const minted = await mintQr(customerId, merchantId, qrEffectiveTtl, initData);
      setQrToken(minted.token);
      const ttlSec = typeof minted.ttl === "number" && Number.isFinite(minted.ttl) ? minted.ttl : qrEffectiveTtl;
      setQrTtlSec(ttlSec);
      setQrExpiresAt(Date.now() + Math.max(5, ttlSec) * 1000);
      setQrError("");
    } catch (err) {
      setQrError(`Не удалось обновить QR: ${resolveErrorMessage(err)}`);
    } finally {
      setQrRefreshing(false);
    }
  }, [customerId, merchantId, qrEffectiveTtl, initData]);

  useEffect(() => {
    if (!qrOpen || !qrExpiresAt) {
      setQrTimeLeft(null);
      return;
    }
    const update = () => {
      const diff = Math.round((qrExpiresAt - Date.now()) / 1000);
      setQrTimeLeft(diff > 0 ? diff : 0);
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [qrOpen, qrExpiresAt]);

  useEffect(() => {
    if (!qrOpen || !qrExpiresAt) return;
    const msLeft = qrExpiresAt - Date.now();
    if (msLeft <= 4000) return;
    const id = window.setTimeout(() => {
      void refreshQr();
    }, msLeft - 3000);
    return () => window.clearTimeout(id);
  }, [qrOpen, qrExpiresAt, refreshQr]);

  useEffect(() => {
    if (!qrOpen) return;
    setQrLoading(true);
    (async () => {
      await refreshQr();
      setQrLoading(false);
    })();
  }, [qrOpen, refreshQr]);

  const finalizePhoneShare = useCallback(
    async (options?: {
      capturedPhone?: string | null;
      waitServerSync?: boolean;
      customerIdOverride?: string | null;
    }) => {
      if (!merchantId) return false;
      const { capturedPhone = null, waitServerSync = false, customerIdOverride = null } = options ?? {};
      let effectiveCustomerId = customerIdOverride || pendingCustomerIdForPhone || customerId;
      if (!effectiveCustomerId) {
        setToast({ msg: "Не удалось определить клиента", type: "error" });
        setPhoneShareStage("idle");
        return false;
      }
      const genderValid = profileForm.gender === "male" || profileForm.gender === "female";
      if (!profileForm.name || !genderValid || !profileForm.birthDate) {
        setToast({ msg: "Заполните профиль перед подтверждением", type: "error" });
        setPhoneShareStage("idle");
        return false;
      }
      const key = profileStorageKey(merchantId, telegramUserId);
      const pendingKey = profilePendingKey(merchantId, telegramUserId);
      setPhoneShareError(null);
      setPhoneShareStage("saving");
      setProfileSaving(true);
      try {
        let serverHasPhone = teleHasPhone === true;
        let statusError: unknown = null;
        let teleauthRefreshed = false;
        const delay = (ms: number) =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
          });
        const syncTeleauthCustomer = async () => {
          if (teleauthRefreshed) return effectiveCustomerId;
          teleauthRefreshed = true;
          let initForAuth = initData;
          if (!isValidInitData(initForAuth)) {
            initForAuth = await waitForInitData(10, 200);
          }
          if (!isValidInitData(initForAuth)) return null;
          try {
            const result = await teleauth(merchantId, initForAuth, { create: true });
            const nextId = applyProfileSaveResult(
              { name: null, gender: null, birthDate: null, customerId: result.customerId },
              effectiveCustomerId,
            );
            if (nextId && nextId !== effectiveCustomerId) {
              effectiveCustomerId = nextId;
              setPendingCustomerIdForPhone(nextId);
            }
            setAuthTeleHasPhone(Boolean(result.hasPhone));
            setAuthTeleOnboarded(Boolean(result.onboarded));
            return nextId;
          } catch {
            return null;
          }
        };
        const isForbiddenError = (error: unknown) => {
          const lowered = resolveErrorMessage(error).toLowerCase();
          return lowered.includes("forbidden") || lowered.includes("403");
        };
        const refreshPhoneStatus = async () => {
          try {
            const status = await profilePhoneStatus(merchantId, effectiveCustomerId!);
            serverHasPhone = Boolean(status?.hasPhone);
            statusError = null;
          } catch (error) {
            statusError = error;
          }
        };
        const waitForPhoneBinding = async (attempts = 5, delayMs = 700) => {
          for (let i = 0; i < attempts; i += 1) {
            await refreshPhoneStatus();
            if (serverHasPhone) return true;
            if (statusError && isForbiddenError(statusError)) {
              const refreshed = await syncTeleauthCustomer();
              if (refreshed) {
                await refreshPhoneStatus();
                if (serverHasPhone) return true;
              }
            }
            if (i < attempts - 1) {
              await delay(delayMs);
            }
          }
          return serverHasPhone;
        };

        if (waitServerSync) {
          await waitForPhoneBinding();
        }

        const normalizedPhone =
          typeof capturedPhone === "string" && capturedPhone.trim()
            ? capturedPhone.trim()
            : typeof phone === "string" && phone.trim()
              ? phone.trim()
              : null;

        if (!serverHasPhone && !normalizedPhone) {
          setPhoneShareError(waitServerSync ? PHONE_PENDING_MESSAGE : PHONE_NOT_LINKED_MESSAGE);
          setPhoneShareStage("idle");
          setProfileSaving(false);
          return false;
        }

        const payload = {
          name: profileForm.name.trim(),
          gender: profileForm.gender as "male" | "female",
          birthDate: profileForm.birthDate,
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        };

        const saved = await profileSave(merchantId, effectiveCustomerId, payload);
        applyProfileSaveResult(saved, effectiveCustomerId);
        try {
          if (key) {
            localStorage.setItem(key, JSON.stringify({ name: payload.name, gender: payload.gender, birthDate: payload.birthDate }));
          }
          if (pendingKey) localStorage.removeItem(pendingKey);
          const onboardStorageKey = onboardKey(merchantId, telegramUserId);
          if (onboardStorageKey) {
            localStorage.setItem(onboardStorageKey, "1");
          }
        } catch {}

        const inviteCode = profileForm.inviteCode.trim();
        if (inviteCode) {
          try {
            await referralActivate(inviteCode, effectiveCustomerId);
            setProfileForm((prev) => ({ ...prev, inviteCode: "" }));
          } catch (err) {
            const description = resolveErrorMessage(err);
            const isInvalid =
              /400\\s+Bad\\s+Request/i.test(description) ||
              /Недействител|expired|invalid/i.test(description);
            const isAlready =
              /участвуете|already\\s+participat|already\\s+joined/i.test(description);
            if (isInvalid) {
              setProfileError("Недействительный пригласительный код");
              setPhoneShareStage("idle");
              return false;
            }
            if (isAlready) {
              setProfileForm((prev) => ({ ...prev, inviteCode: "" }));
            } else {
              setToast({ msg: `Не удалось проверить код: ${description}`, type: "error" });
            }
          }
        }
        setAuthTeleHasPhone(true);
        setAuthTeleOnboarded(true);
        setLocalOnboarded(true);
        setView("HOME");
        setPendingCustomerIdForPhone(null);
        setPhoneShareStage("idle");
        setPhoneShareError(null);
        return true;
      } catch (error) {
        const message = resolveErrorMessage(error);
        const lowered = message.toLowerCase();
        const phoneMissing =
          lowered.includes("без номера") ||
          lowered.includes("не привязали номер") ||
          lowered.includes("номер обязателен") ||
          lowered.includes("phone_required") ||
          lowered.includes("phone is required");
        if (phoneMissing) {
          setPhoneShareError(waitServerSync ? PHONE_PENDING_MESSAGE : PHONE_NOT_LINKED_MESSAGE);
        }
        setToast({
          msg: phoneMissing
            ? waitServerSync
              ? PHONE_PENDING_MESSAGE
              : PHONE_NOT_LINKED_MESSAGE
            : `Не удалось сохранить профиль: ${message}`,
          type: "error",
        });
        setPhoneShareStage("idle");
        return false;
      } finally {
        setProfileSaving(false);
      }
    },
    [
      merchantId,
      telegramUserId,
      pendingCustomerIdForPhone,
      customerId,
      profileForm,
      phone,
      setToast,
      initData,
      teleHasPhone,
      applyProfileSaveResult,
      setAuthTeleHasPhone,
      setAuthTeleOnboarded,
    ],
  );

  const handleRequestPhone = useCallback(async (customerIdOverride?: string | null) => {
    if (!merchantId) return;
    if (phoneShareStage !== "idle") return;
    const tg = getTelegramWebApp();
    const canRequestPhone = typeof tg?.requestPhoneNumber === "function";
    const canRequestContact = typeof tg?.requestContact === "function";
    if (!tg || (!canRequestPhone && !canRequestContact)) {
      setToast({ msg: "Телеграм не поддерживает запрос номера", type: "error" });
      return;
    }
    setPhoneShareError(null);
    setPhone(null);
    setPhoneShareStage("waiting");
    const normalize = (raw: unknown): string | null => {
      if (!raw) return null;
      const take = (s: string) => {
        const digits = s.replace(/\D+/g, "");
        if (digits.length < 10) return null;
        if (digits.startsWith("8") && digits.length === 11) return "+7" + digits.slice(1);
        if (digits.startsWith("7") && digits.length === 11) return "+" + digits;
        if (digits.startsWith("9") && digits.length === 10) return "+7" + digits;
        if (s.startsWith("+")) return s;
        return "+" + digits;
      };
      if (typeof raw === "string") return take(raw) || null;
      if (typeof raw === "object" && raw !== null) {
        const record = raw as Record<string, unknown>;
        const candidate =
          typeof record.phone_number === "string"
            ? record.phone_number
            : typeof record.phone === "string"
              ? record.phone
              : typeof record.value === "string"
                ? record.value
                : null;
        if (candidate) return take(candidate) || null;
      }
      return null;
    };
    let promptTriggered = false;
    let phoneCaptured = false;
    let shareConfirmed = false;
    let capturedPhone: string | null = null;
    const markPhone = (value: string | null) => {
      if (!value) return false;
      phoneCaptured = true;
      shareConfirmed = true;
      capturedPhone = value;
      setPhone(value);
      setToast({ msg: "Номер получен", type: "success" });
      return true;
    };
    const detectShareConfirmation = (payload: unknown): boolean => {
      if (payload == null) return false;
      if (typeof payload === "boolean") return payload;
      if (typeof payload === "number") return Number.isFinite(payload) && payload > 0;
      if (typeof payload === "string") {
        const lowered = payload.trim().toLowerCase();
        if (!lowered) return false;
        return ["ok", "true", "sent", "accepted", "shared", "success", "done"].includes(lowered);
      }
      if (typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        if (
          typeof record.phone_number === "string" ||
          typeof record.phone === "string" ||
          typeof record.value === "string"
        ) {
          return true;
        }
        if (typeof record.status === "string") {
          const lowered = record.status.toLowerCase();
          if (["sent", "accepted", "applied", "shared", "success", "ok"].includes(lowered)) {
            return true;
          }
        }
        if (typeof record.ok === "boolean" && record.ok) return true;
        if (typeof record.confirmed === "boolean" && record.confirmed) return true;
        if (typeof record.shared === "boolean" && record.shared) return true;
        if (typeof record.result !== "undefined") {
          return detectShareConfirmation(record.result);
        }
      }
      return false;
    };
    try {
      if (canRequestPhone) {
        promptTriggered = true;
        const res = await tg.requestPhoneNumber!();
        const normalized = normalize(res);
        if (!markPhone(normalized) && detectShareConfirmation(res)) {
          shareConfirmed = true;
        }
      }
      if (!phoneCaptured && canRequestContact) {
        promptTriggered = true;
        const result = await new Promise<unknown>((resolve, reject) => {
          let settled = false;
          const finish = (value: unknown) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          try {
            const maybe = tg.requestContact?.((payload: unknown) => finish(payload));
            if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
              (maybe as Promise<unknown>).then((payload) => finish(payload)).catch(reject);
            }
          } catch (err) {
            reject(err);
          }
        });
        const normalized = normalize(result);
        if (!markPhone(normalized) && detectShareConfirmation(result)) {
          shareConfirmed = true;
        }
      }
      if (phoneCaptured && capturedPhone) {
        await finalizePhoneShare({ capturedPhone, customerIdOverride: customerIdOverride ?? null });
        return;
      }
      if (shareConfirmed) {
        await finalizePhoneShare({ waitServerSync: true, customerIdOverride: customerIdOverride ?? null });
        return;
      }
      if (!promptTriggered) {
        setToast({ msg: "Не удалось открыть запрос номера", type: "error" });
        setPhoneShareStage("idle");
        return;
      }
      setPhoneShareError(PHONE_NOT_LINKED_MESSAGE);
    } catch (err) {
      const msg = resolveErrorMessage(err);
      const lowered = msg.toLowerCase();
      if (lowered.includes("denied") || lowered.includes("cancel")) {
        setPhoneShareError(PHONE_NOT_LINKED_MESSAGE);
      } else {
        setToast({ msg: `Не удалось запросить номер: ${msg}`, type: "error" });
      }
    } finally {
      if (!phoneCaptured && !shareConfirmed) {
        setPhoneShareStage("idle");
      }
    }
  }, [merchantId, phoneShareStage, setToast, finalizePhoneShare]);

  const handleOnboardingSubmit = useCallback(async () => {
    setProfileError(null);
    if (!profileForm.name.trim()) {
      setProfileError("Пожалуйста, введите ваше имя");
      return;
    }
    if (!profileForm.gender) {
      setProfileError("Укажите пол");
      return;
    }
    const dateError = validateBirthDate(profileForm.birthDate);
    if (dateError) {
      setProfileError(dateError);
      return;
    }
    if (!profileConsent) {
      setProfileError("Необходимо согласие на обработку данных");
      return;
    }

    setProfileSaving(true);
    const key = merchantId ? profileStorageKey(merchantId, telegramUserId) : null;
    const pendingKey = merchantId ? profilePendingKey(merchantId, telegramUserId) : null;
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify({
          name: profileForm.name.trim(),
          gender: profileForm.gender,
          birthDate: profileForm.birthDate,
        }));
      } catch {}
    }

    let effectiveCustomerId = customerId;
    if (!effectiveCustomerId || !merchantId) {
      let initForAuth = initData;
      if (!isValidInitData(initForAuth)) {
        initForAuth = await waitForInitData(10, 200);
      }
      if (merchantId && isValidInitData(initForAuth)) {
        try {
          const result = await teleauth(merchantId, initForAuth, { create: true });
          effectiveCustomerId = applyProfileSaveResult(
            { name: null, gender: null, birthDate: null, customerId: result.customerId },
            result.customerId,
          );
          setAuthTeleHasPhone(Boolean(result.hasPhone));
          setAuthTeleOnboarded(Boolean(result.onboarded));
        } catch (teleauthError) {
          const message = resolveErrorMessage(teleauthError);
          setToast({ msg: `Не удалось авторизоваться в Telegram: ${message}`, type: "error" });
          setProfileSaving(false);
          return;
        }
      } else {
        if (pendingKey) {
          try {
            localStorage.setItem(pendingKey, JSON.stringify({
              name: profileForm.name.trim(),
              gender: profileForm.gender,
              birthDate: profileForm.birthDate,
            }));
          } catch {}
        }
        pendingProfileSync.current = false;
        setProfileSaving(false);
        return;
      }
    }

    if (effectiveCustomerId) {
      setPendingCustomerIdForPhone(effectiveCustomerId);
    }
    setProfileSaving(false);
    await handleRequestPhone(effectiveCustomerId);
  }, [
    profileForm,
    profileConsent,
    merchantId,
    telegramUserId,
    customerId,
    initData,
    setToast,
    applyProfileSaveResult,
    setAuthTeleHasPhone,
    setAuthTeleOnboarded,
    handleRequestPhone,
  ]);

  const handlePromoApply = useCallback(async () => {
    if (!promoCode.trim()) return;
    if (!merchantId || !customerId) {
      setToast({ msg: "Не удалось определить клиента", type: "error" });
      return;
    }
    setPromoStatus("loading");
    try {
      const result = await promoCodeApply(merchantId, customerId, promoCode.trim());
      if (result.ok) {
        setPromoStatus("success");
        setPromoCode("");
        setToast({ msg: result.message || "Промокод применён", type: "success" });
        await Promise.allSettled([loadBalance(), loadTx({ fresh: true }), loadLevels()]);
      } else {
        setPromoStatus("error");
      }
    } catch (error) {
      setPromoStatus("error");
      setToast({ msg: resolveErrorMessage(error), type: "error" });
    } finally {
      setTimeout(() => setPromoStatus("idle"), 3000);
    }
  }, [promoCode, merchantId, customerId, loadBalance, loadTx, loadLevels]);

  const handleInviteFriend = useCallback(() => {
    if (!referralInfo) return;
    const ctx: ReferralTemplateContext = {
      merchantName: referralInfo.merchantName,
      bonusAmount: referralInfo.friendReward || 0,
      code: referralInfo.code,
      link: referralInfo.link || "",
    };
    const shareTemplate = normalizeReferralTemplate(referralInfo.shareMessageTemplate, REFERRAL_SHARE_FALLBACK);
    const shareText = applyReferralPlaceholders(shareTemplate, ctx).trim();
    const shareUrl = buildTelegramShareUrl(shareText);
    const tg = getTelegramWebApp();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
      return;
    }
    try {
      if (typeof window !== "undefined") {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      // ignore
    }
  }, [referralInfo]);

  const handleSupport = useCallback(() => {
    const handle = normalizeTelegramHandle(supportTelegram);
    if (!handle) {
      setToast({ msg: "Контакт поддержки не задан", type: "error" });
      return;
    }
    const link = `https://t.me/${handle}`;
    const tg = getTelegramWebApp();
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(link);
        return;
      }
      if (tg?.openLink) {
        tg.openLink(link);
        return;
      }
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.open(link, "_blank", "noopener,noreferrer");
      }
    } catch {
      // ignore
    }
  }, [supportTelegram]);

  const toggleNotifications = useCallback(async () => {
    if (!customerId || !merchantId) return;
    if (consent) {
      setShowNotificationAlert(true);
      return;
    }
    try {
      await consentSet(merchantId, customerId, true);
      setConsent(true);
      setToast({ msg: "Уведомления включены", type: "success" });
    } catch (error) {
      setToast({ msg: `Ошибка согласия: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [merchantId, customerId, consent]);

  const confirmTurnOffNotifications = useCallback(async () => {
    if (!customerId || !merchantId) return;
    try {
      await consentSet(merchantId, customerId, false);
      setConsent(false);
      setToast({ msg: "Уведомления отключены", type: "success" });
    } catch (error) {
      setToast({ msg: `Ошибка согласия: ${resolveErrorMessage(error)}`, type: "error" });
    } finally {
      setShowNotificationAlert(false);
    }
  }, [merchantId, customerId]);

  const displayName = useMemo(() => {
    if (profileForm.name) return profileForm.name;
    if (telegramUser) {
      const combined = `${telegramUser.firstName || ""} ${telegramUser.lastName || ""}`.trim();
      if (combined) return combined;
      if (telegramUser.username) return telegramUser.username;
    }
    return "";
  }, [profileForm.name, telegramUser]);

  const historyTransactions = useMemo(() => buildHistoryTransactions(tx), [tx]);

  const bonusPromos = useMemo(() => {
    return promotions.filter((promo) => {
      if (promo.rewardType !== "POINTS") return false;
      const { hasTargets } = getPromoTargets(promo);
      return !hasTargets;
    });
  }, [promotions]);

  const productPromos = useMemo(() => {
    return promotions.filter((promo) => {
      if (promo.rewardType !== "POINTS") return true;
      const { hasTargets } = getPromoTargets(promo);
      return hasTargets;
    });
  }, [promotions]);

  const unclaimedBonusCount = useMemo(
    () => bonusPromos.filter((p) => p.canClaim && !p.claimed).length,
    [bonusPromos],
  );

  const bonusBadgeCount = promotionsResolved ? unclaimedBonusCount : cachedBonusCount;
  const showBonusSkeleton = !promotionsResolved && cachedBonusCount == null;

  useEffect(() => {
    if (!promotionsResolved) return;
    setCachedBonusCount(unclaimedBonusCount);
  }, [promotionsResolved, unclaimedBonusCount]);

  const shortCodeRaw = useMemo(() => (isShortCode(qrToken) ? qrToken : null), [qrToken]);
  const manualCode = useMemo(() => (shortCodeRaw ? formatShortCode(shortCodeRaw) : null), [shortCodeRaw]);
  const showManualCode = Boolean(shortCodeRaw);

  const maxLevelReached = useMemo(() => {
    if (!levelInfo) return false;
    if (!levelInfo.next) return true;
    return levelCatalog.length > 0 && levelCatalog.length <= 1;
  }, [levelInfo, levelCatalog]);

  const qrProgress = useMemo(() => {
    if (!levelInfo?.next) return null;
    if (maxLevelReached) return null;
    const pointsToNext = Math.max(0, levelInfo.next.threshold - levelInfo.value);
    return {
      nextLevelName: levelInfo.next.name,
      pointsToNext,
      percent: getProgressPercent(levelInfo),
    };
  }, [levelInfo, maxLevelReached]);

  const writeOffByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of levelCatalog) {
      if (!level?.name) continue;
      if (typeof level.redeemRateBps === "number" && Number.isFinite(level.redeemRateBps)) {
        map.set(level.name, level.redeemRateBps / 100);
      }
    }
    if (levelInfo?.current?.name && typeof levelInfo.current.redeemRateBps === "number") {
      map.set(levelInfo.current.name, levelInfo.current.redeemRateBps / 100);
    }
    if (levelInfo?.next?.name && typeof levelInfo.next.redeemRateBps === "number") {
      map.set(levelInfo.next.name, levelInfo.next.redeemRateBps / 100);
    }
    return map;
  }, [levelCatalog, levelInfo]);

  const handleCopyInviteCode = useCallback(() => {
    if (!referralInfo?.code) return;
    navigator.clipboard.writeText(referralInfo.code);
    setShowCodeCopied(true);
    setTimeout(() => setShowCodeCopied(false), 2000);
  }, [referralInfo]);

  const handlePromoDetail = useCallback((promo: PromotionItem) => {
    const duration = formatPromoDuration(promo.startAt, promo.endAt);
    setSelectedPromo({
      id: promo.id,
      title: promo.name,
      description: describePromotion(promo),
      duration: duration || undefined,
      categories: promo.categoryNames || [],
      products: promo.productNames || [],
    });
  }, []);

  const promoStatusPlaceholder =
    promoStatus === "success"
      ? "Промокод применен!"
      : promoStatus === "error"
        ? "Неверный код"
        : "Ввести промокод";

  const splashView = (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto mb-4" />
        <div>Загружаем приложение…</div>
      </div>
    </div>
  );

  const onboardingView = (
    <Onboarding
      form={profileForm}
      consent={profileConsent}
      onToggleConsent={() => {
        setProfileConsent((prev) => !prev);
        if (profileError) setProfileError(null);
      }}
      onFieldChange={(field, value) => {
        setProfileForm((prev) => ({ ...prev, [field]: value }));
        if (profileError) setProfileError(null);
        if (phoneShareError) setPhoneShareError(null);
      }}
      onSubmit={handleOnboardingSubmit}
      loading={profileSaving || phoneShareStage !== "idle"}
      error={profileError || phoneShareError}
    />
  );

  const renderHome = () => (
    <div className="flex flex-col h-full pb-safe overflow-y-auto">
      <div className="bg-ios-bg px-5 pt-8 pb-4 flex justify-between items-end">
        <div className="flex-1 min-w-0 mr-4">
          <div className="text-gray-500 text-sm font-medium mb-1">Добрый день,</div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight truncate">{displayName || ""}</h1>
        </div>
        <button
          onClick={() => setView("SETTINGS")}
          className="w-10 h-10 bg-white rounded-full shadow-card flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors shrink-0"
        >
          <Settings size={22} />
        </button>
      </div>

      <div className="px-5 space-y-6 pb-8">
        <div className="w-full bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-soft relative overflow-hidden transform transition-transform active:scale-[0.99]">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-400 opacity-20 rounded-full -ml-8 -mb-8 blur-2xl" />

          <div className="relative z-10 flex flex-col h-40 justify-between">
            <div className="flex justify-between items-start">
              <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase border border-white/10">
                {levelInfo?.current?.name || "—"}
              </div>
              <Wallet className="opacity-70" />
            </div>

            <div>
              <div className="text-blue-100 text-sm font-medium mb-1">Ваш баланс</div>
              <div className="text-4xl font-bold tracking-tight">
                {bal != null ? bal.toLocaleString("ru-RU") : "—"} <span className="text-2xl opacity-70">Б</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <Percent size={12} />
              </div>
              <span className="text-sm font-medium">
                {cashbackPercent != null ? cashbackPercent : "—"}% возвращается баллами
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setQrOpen(true)}
          className="w-full bg-gray-900 text-white h-14 rounded-2xl shadow-lg flex items-center justify-center space-x-3 active:scale-[0.98] transition-all"
        >
          <QrCode size={20} />
          <span className="font-semibold text-lg">Показать карту</span>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setView("PROMOS");
              if (!promotionsResolved) void loadPromotions();
            }}
            className="bg-white p-4 rounded-2xl shadow-card flex flex-col justify-between h-28 active:scale-[0.98] transition-transform relative"
          >
            {showBonusSkeleton ? (
              <div className="absolute top-3 right-3 h-[18px] w-[30px] rounded-full bg-gray-200 animate-pulse" />
            ) : bonusBadgeCount != null && bonusBadgeCount > 0 ? (
              <div className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in duration-300">
                {bonusBadgeCount}
              </div>
            ) : null}
            <div className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center">
              <Gift size={22} />
            </div>
            <div className="text-left">
              <div className="font-bold text-gray-900 text-lg">Акции</div>
              <div className="text-xs text-gray-400">Спецпредложения</div>
            </div>
          </button>

          {referralEnabled ? (
            <button
              onClick={() => setView("INVITE")}
              className="bg-white p-4 rounded-2xl shadow-card flex flex-col justify-between h-28 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <UserPlus size={22} />
              </div>
              <div className="text-left">
                <div className="font-bold text-gray-900 text-lg">Друзья</div>
                <div className="text-xs text-gray-400">Получите бонусы</div>
              </div>
            </button>
          ) : (
            <button
              onClick={() => setView("HISTORY")}
              className="bg-white p-4 rounded-2xl shadow-card flex flex-col justify-between h-28 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Clock size={22} />
              </div>
              <div className="text-left">
                <div className="font-bold text-gray-900 text-lg">История</div>
                <div className="text-xs text-gray-400">Ваши операции</div>
              </div>
            </button>
          )}
        </div>

        <div
          className={`bg-white p-1.5 rounded-2xl shadow-card flex items-center pr-1.5 transition-colors border ${
            promoStatus === "error"
              ? "border-red-300 bg-red-50"
              : promoStatus === "success"
                ? "border-green-300 bg-green-50"
                : "border-transparent"
          }`}
        >
          <input
            type="text"
            placeholder={promoStatusPlaceholder}
            value={promoCode}
            disabled={promoStatus !== "idle"}
            onChange={(e) => {
              setPromoCode(e.target.value);
              if (promoStatus === "error") setPromoStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && handlePromoApply()}
            className="flex-1 px-4 py-3 bg-transparent outline-none text-gray-900 font-medium placeholder-gray-400 disabled:text-gray-500"
          />
          <button
            onClick={handlePromoApply}
            disabled={promoStatus !== "idle" || !promoCode}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              promoStatus === "success"
                ? "bg-green-500 text-white"
                : "bg-gray-100 text-gray-900 hover:bg-gray-200"
            }`}
          >
            {promoStatus === "loading" ? (
              <Loader2 size={20} className="animate-spin text-gray-500" />
            ) : promoStatus === "success" ? (
              <Check size={20} />
            ) : (
              <ChevronRight size={20} />
            )}
          </button>
        </div>

        <div className="pb-8">
          <TransactionHistory
            transactions={historyTransactions.slice(0, 4)}
            onShowAll={() => setView("HISTORY")}
          />
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="h-full bg-ios-bg pb-safe flex flex-col">
      <div className="sticky top-0 bg-ios-bg/90 backdrop-blur-md z-20 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={() => setView("HOME")}
          className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity z-10"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
          <span className="text-[17px] font-normal">Главная</span>
        </button>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <TransactionHistory
          transactions={historyTransactions}
          title="Ваши операции"
          titleClassName="text-3xl font-bold text-gray-900"
          headerClassName="mb-6"
        />
        {txNextBefore && <div ref={txLoadMoreRef} className="h-4" />}
        {txLoadingMore && (
          <div className="mt-2 flex items-center justify-center text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin mr-2" />
            Загружаем операции…
          </div>
        )}
      </div>
    </div>
  );

  const renderPromos = () => {
    const showBonusesEmpty = promotionsResolved && bonusPromos.length === 0;
    const showPromosEmpty = promotionsResolved && productPromos.length === 0;

    const renderBonusCard = (promo: PromotionItem, index: number, vertical = false) => {
      const isClaimed = promo.claimed;
      const isAvailable = promo.canClaim && !promo.claimed;
      const gradient = BONUS_GRADIENTS[index % BONUS_GRADIENTS.length];
      const pointsValue = typeof promo.rewardValue === "number" ? promo.rewardValue : 0;

      return (
        <div
          key={promo.id}
          className={`${vertical ? "w-full mb-4" : "min-w-[85%] sm:min-w-[300px] snap-center"} rounded-[24px] p-5 relative overflow-hidden flex flex-col justify-between h-[160px] shadow-lg bg-gradient-to-r ${gradient} text-white active:scale-[0.99] transition-transform`}
        >
          <div className="z-10 flex justify-between items-start">
            <div className="bg-black/20 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center space-x-1.5 self-start">
              <Gift size={12} className="text-white" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Подарок</span>
            </div>
            <Sparkles className="absolute -right-2 -bottom-4 text-white/20 w-32 h-32 rotate-12 pointer-events-none" />
          </div>

          <div className="z-10 mt-auto">
            <h3 className="text-[18px] font-bold leading-tight mb-3 pr-8">{promo.name}</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-black">{pointsValue}</span>
                <span className="text-sm font-medium opacity-80 uppercase">баллов</span>
              </div>

              <button
                onClick={() => handlePromotionClaim(promo.id)}
                disabled={!isAvailable}
                className={`h-9 px-4 rounded-full flex items-center justify-center shadow-md text-[13px] font-bold transition-all duration-300 ${
                  isClaimed
                    ? "bg-green-500 text-white w-auto gap-1.5 pl-3"
                    : isAvailable
                      ? "bg-white text-gray-900 hover:bg-gray-50 active:scale-95"
                      : "bg-white/40 text-white"
                }`}
              >
                {isClaimed ? (
                  <>
                    <Check size={16} strokeWidth={3} className="animate-in zoom-in duration-300" />
                    <span className="animate-in fade-in duration-300">Получено</span>
                  </>
                ) : (
                  "Забрать"
                )}
              </button>
            </div>
          </div>
        </div>
      );
    };

    const renderGridCard = (promo: PromotionItem, index: number) => {
      const badge = resolvePromoBadge(promo);
      const IconComponent = badge?.icon || ShoppingBag;
      const badgeText = badge?.text || "Акция";
      const badgeColor = badge?.color || "bg-gray-900 text-white";
      const accent = PRODUCT_ACCENTS[index % PRODUCT_ACCENTS.length];

      return (
        <div key={promo.id} className="flex flex-col bg-white rounded-[20px] shadow-card overflow-hidden active:scale-[0.98] transition-transform h-full">
          <div className={`h-[110px] w-full ${accent} relative flex items-center justify-center`}>
            <IconComponent size={40} className="text-gray-900/50 mix-blend-multiply" />
            <div className={`absolute top-2 right-2 px-2.5 py-1 rounded-[8px] text-[11px] font-bold shadow-sm ${badgeColor}`}>
              {badgeText}
            </div>
          </div>

          <div className="p-3 flex-1 flex flex-col">
            <h3 className="text-[14px] font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{promo.name}</h3>
            <div className="mt-auto pt-2">
                <button
                  onClick={() => handlePromoDetail(promo)}
                  className="w-full py-2 rounded-[10px] bg-gray-50 text-blue-600 text-xs font-bold text-center hover:bg-blue-50 transition-colors"
                >
                  Подробнее
                </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="h-full bg-[#F5F5F7] pb-safe flex flex-col">
        <div className="sticky top-0 z-30 bg-[#F5F5F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setView("HOME")}
            className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
          >
            <ChevronLeft size={22} className="stroke-[2.5]" />
            <span className="text-[17px] font-normal">Назад</span>
          </button>
          <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">Акции</span>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pb-10 pt-4">
          <div className="space-y-4">
            <div className="px-5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h2 className="text-[22px] font-bold text-gray-900">Ваши бонусы</h2>
                {showBonusSkeleton ? (
                  <div className="h-[18px] w-[30px] rounded-full bg-gray-200 animate-pulse" />
                ) : bonusBadgeCount != null && bonusBadgeCount > 0 ? (
                  <div className="bg-red-500 text-white text-[12px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in">
                    {bonusBadgeCount}
                  </div>
                ) : null}
              </div>
              {bonusPromos.length > 0 ? (
                <button
                  onClick={() => setIsAllBonusesOpen(true)}
                  className="text-[15px] font-medium text-blue-600 active:opacity-50"
                >
                  Все
                </button>
              ) : null}
            </div>

            {bonusPromos.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-5 pb-4 snap-x hide-scrollbar">
                {bonusPromos.map((promo, idx) => renderBonusCard(promo, idx))}
              </div>
            ) : showBonusesEmpty ? (
              <div className="px-5">
                <div className="bg-white rounded-[20px] shadow-card px-5 py-6 text-center text-gray-500 text-[15px]">
                  Пока ничего нет
                </div>
              </div>
            ) : null}
          </div>

          <div className="px-4">
            <h2 className="text-[22px] font-bold text-gray-900 mb-4 px-1">Спецпредложения</h2>
            {productPromos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {productPromos.map((promo, idx) => renderGridCard(promo, idx))}
              </div>
            ) : showPromosEmpty ? (
              <div className="px-1">
                <div className="bg-white rounded-[20px] shadow-card px-5 py-6 text-center text-gray-500 text-[15px]">
                  Пока ничего нет
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {isAllBonusesOpen && (
          <div className="fixed inset-0 z-50 bg-[#F5F5F7] flex flex-col animate-in slide-in-from-bottom-full duration-300">
            <div className="sticky top-0 z-30 bg-[#F5F5F7]/90 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
              <div className="w-10" />
              <span className="text-[17px] font-semibold text-black">Все бонусы</span>
              <button
                onClick={() => setIsAllBonusesOpen(false)}
                className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center active:opacity-60 transition-opacity"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 pb-20">
              {bonusPromos.map((promo, idx) => renderBonusCard(promo, idx, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderInvite = () => {
    const inviteDescriptionNodes = (() => {
      if (!referralInfo) return "—";
      const template = (referralInfo.description || "").trim();
      if (!template) return "—";
      const ctx = {
        merchantName: referralInfo.merchantName,
        bonusAmount: referralInfo.friendReward || 0,
        code: referralInfo.code,
        link: referralInfo.link || "",
      };
      const placeholderRegex = /(\{businessname\}|\{bonusamount\}|\{code\}|\{link\})/gi;
      const parts = template.split(placeholderRegex).filter((part) => part !== "");
      const nodes: ReactNode[] = [];
      let hasContent = false;
      parts.forEach((part, index) => {
        const token = part.toLowerCase();
        let value = "";
        if (token === "{businessname}") value = ctx.merchantName || "";
        if (token === "{bonusamount}") {
          value = Number.isFinite(ctx.bonusAmount) ? String(Math.round(ctx.bonusAmount)) : "";
        }
        if (token === "{code}") value = ctx.code || "";
        if (token === "{link}") value = ctx.link || "";
        if (value) {
          nodes.push(
            <span key={`ph-${index}`} className="text-blue-600 font-semibold">
              {value}
            </span>,
          );
          hasContent = true;
          return;
        }
        if (token.startsWith("{") && token.endsWith("}")) return;
        nodes.push(<span key={`txt-${index}`}>{part}</span>);
        if (part.trim()) hasContent = true;
      });
      return hasContent ? nodes : "—";
    })();

    return (
      <div className="h-full bg-[#F2F2F7] flex flex-col">
      <div className="sticky top-0 z-30 bg-[#F2F2F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setView("HOME")}
          className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
          <span className="text-[17px] font-normal">Назад</span>
        </button>
        <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">
          Пригласить друга
        </span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        <div className="flex flex-col items-center pt-8 pb-8">
          <div className="w-[88px] h-[88px] bg-white rounded-[22px] shadow-sm flex items-center justify-center mb-5">
            <Gift size={44} className="text-blue-500" />
          </div>
          <h2 className="text-[22px] font-bold text-gray-900 text-center leading-tight mb-2">Бонусы для друзей</h2>
          <p className="text-[15px] text-gray-500 text-center max-w-[280px] leading-snug">
            Делитесь кодом и получайте награды
          </p>
        </div>

        <div className="px-4 mb-6">
          <div className="pl-4 mb-2">
            <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Условия</span>
          </div>
          <div className="bg-white rounded-[18px] px-4 py-4 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                <Info size={18} className="text-gray-400" />
              </div>
              <p className="text-[15px] text-gray-900 leading-relaxed">
                {inviteDescriptionNodes}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4">
          <div className="pl-4 mb-2">
            <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Ваш пригласительный код</span>
          </div>
          <button
            onClick={handleCopyInviteCode}
            className="w-full bg-white rounded-[18px] px-4 py-3 shadow-sm flex items-center justify-between active:bg-gray-100 transition-colors group"
          >
            <div className="flex flex-col items-start">
              <span className="text-[20px] font-semibold text-gray-900 font-mono tracking-wide">
                {referralInfo?.code || "—"}
              </span>
              <span
                className={`text-[13px] font-medium mt-0.5 transition-colors ${
                  showCodeCopied ? "text-green-500" : "text-blue-500"
                }`}
              >
                {showCodeCopied ? "Скопировано" : "Нажмите, чтобы скопировать"}
              </span>
            </div>
            <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
              {showCodeCopied ? (
                <Check size={18} className="text-green-500" />
              ) : (
                <Copy size={18} className="text-blue-500" />
              )}
            </div>
          </button>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/80 backdrop-blur-xl border-t border-gray-300/50 z-20"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 20px) + 16px)" }}
      >
        <button
          onClick={handleInviteFriend}
          className="w-full bg-[#007AFF] text-white h-[50px] rounded-[14px] font-semibold text-[17px] active:opacity-90 transition-opacity flex items-center justify-center space-x-2"
          disabled={referralLoading || !referralInfo}
        >
          <Share size={20} className="stroke-[2.5]" />
          <span>Поделиться ссылкой</span>
        </button>
      </div>
    </div>
    );
  };

  const renderAbout = () => (
    <div className="h-full bg-[#F2F2F7] flex flex-col pb-safe">
      <div className="sticky top-0 z-30 bg-[#F2F2F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setView("SETTINGS")}
          className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
          <span className="text-[17px] font-normal">Назад</span>
        </button>
        <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">О программе</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <section>
          <div className="pl-4 mb-2">
            <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Как использовать</span>
          </div>
          <div className="bg-white rounded-[18px] p-5 shadow-sm flex items-start space-x-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ScanLine size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Покажите QR-код</h3>
              <p className="text-[15px] text-gray-500 leading-relaxed">
                При оплате на кассе покажите QR-код из приложения. Если сканер недоступен, вы можете продиктовать цифровой код, указанный под QR-кодом.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="pl-4 mb-2">
            <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Уровни лояльности</span>
          </div>
          <p className="px-4 mb-3 text-[13px] text-gray-500">
            Уровень рассчитывается за покупки в последние{" "}
            {Number.isFinite(levelInfo?.periodDays) ? Math.floor(levelInfo!.periodDays) : 365} дней.
          </p>
          <div className="bg-white rounded-[18px] overflow-hidden shadow-sm">
            {levelCatalog.map((level, index) => {
              const isCurrent = levelInfo?.current?.name === level.name;
              const cashback =
                typeof level.cashbackPercent === "number"
                  ? level.cashbackPercent
                  : level.benefits && typeof level.benefits.cashbackPercent === "number"
                    ? level.benefits.cashbackPercent
                    : typeof level.rewardPercent === "number"
                      ? level.rewardPercent
                      : null;
              const writeOff = level.name ? writeOffByName.get(level.name) ?? null : null;
              return (
                <div
                  key={level.name || index}
                  className={`flex items-center justify-between p-4 ${
                    index !== levelCatalog.length - 1 ? "border-b border-gray-100" : ""
                  } ${isCurrent ? "bg-blue-50/50" : ""}`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        isCurrent ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isCurrent ? <Check size={20} /> : <Trophy size={18} />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <div className={`font-semibold ${isCurrent ? "text-blue-700" : "text-gray-900"}`}>
                          {level.name}
                        </div>
                        {isCurrent && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">ВЫ ЗДЕСЬ</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {level.threshold === 0 ? "Базовый уровень" : `от ${level.threshold?.toLocaleString()} ₽`}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[15px] font-bold text-gray-900">
                      {cashback != null ? cashback : "—"}%
                    </span>
                    <span className="text-[11px] text-gray-400">кэшбэк</span>
                    <span className="text-[11px] text-blue-600 mt-0.5 font-medium">
                      Списание {writeOff != null ? Math.round(writeOff) : "—"}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="pl-4 mb-2">
            <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Важно знать</span>
          </div>
          <div className="bg-white rounded-[18px] p-5 shadow-sm">
            <div className="flex items-start space-x-3 mb-3">
              <BellOff size={20} className="text-orange-500 shrink-0 mt-0.5" />
              <h3 className="font-semibold text-gray-900">Рассылки и уведомления</h3>
            </div>
            <p className="text-[15px] text-gray-500 leading-relaxed">
              Вы можете отключить уведомления в настройках, но тогда вы рискуете пропустить:
            </p>
            <ul className="mt-3 space-y-2">
              {[
                "Персональные подарочные баллы",
                "Уведомления о сгорании бонусов",
                "Акции и специальные предложения",
              ].map((item, i) => (
                <li key={i} className="flex items-center space-x-2 text-[14px] text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="h-full bg-ios-bg pb-safe relative flex flex-col">
      <div className="sticky top-0 bg-ios-bg/90 backdrop-blur-md z-20 px-4 py-3 border-b border-gray-200 flex items-center">
        <button
          onClick={() => setView("HOME")}
          className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
          <span className="text-[17px] font-normal">Главная</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Настройки</h2>

        <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
          <div className="p-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white">
                <Bell size={16} />
              </div>
              <span className="font-medium text-gray-900">Уведомления</span>
            </div>
            <button
              onClick={toggleNotifications}
              className={`w-12 h-7 rounded-full transition-colors duration-200 ease-in-out p-1 ${
                consent ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                  consent ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div
            onClick={() => setView("ABOUT")}
            className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <span className="font-medium text-gray-900">О программе</span>
            <ChevronRight size={20} className="text-gray-300" />
          </div>
        </div>

        <button
          onClick={handleSupport}
          className="w-full bg-white text-[#007AFF] font-semibold p-4 rounded-2xl shadow-card flex items-center justify-center space-x-2 active:bg-gray-50 transition-colors"
        >
          <MessageCircleQuestion size={20} />
          <span>Написать в поддержку</span>
        </button>
      </div>

      {showNotificationAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
            onClick={() => setShowNotificationAlert(false)}
          />
          <div className="relative bg-white/90 backdrop-blur-xl rounded-[14px] w-full max-w-[270px] text-center overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 pt-5">
              <h3 className="text-[17px] font-semibold text-gray-900 mb-1">Выключить уведомления?</h3>
              <p className="text-[13px] leading-snug text-gray-500">
                Мы не сможем уведомлять вас об акциях, спец. предложениях, подарочных баллах и сгорании бонусов.
              </p>
            </div>
            <div className="flex border-t border-gray-300/50">
              <button
                onClick={() => setShowNotificationAlert(false)}
                className="flex-1 py-3 text-[17px] text-blue-500 font-normal active:bg-gray-200 transition-colors border-r border-gray-300/50"
              >
                Отмена
              </button>
              <button
                onClick={confirmTurnOffNotifications}
                className="flex-1 py-3 text-[17px] text-red-500 font-semibold active:bg-gray-200 transition-colors"
              >
                Выключить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const dashboardView = (
    <div className="bg-ios-bg h-screen text-gray-900 font-sans mx-auto max-w-md shadow-2xl overflow-hidden relative selection:bg-blue-100">
      {view === "HOME" && renderHome()}
      {view === "PROMOS" && renderPromos()}
      {view === "INVITE" && renderInvite()}
      {view === "SETTINGS" && renderSettings()}
      {view === "HISTORY" && renderHistory()}
      {view === "ABOUT" && renderAbout()}

      <QRCodeOverlay
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        name={displayName || ""}
        levelName={levelInfo?.current?.name || null}
        balance={bal}
        cashbackPercent={cashbackPercent}
        qrToken={qrToken}
        qrTimeLeft={qrTimeLeft}
        qrRefreshing={qrRefreshing}
        qrLoading={qrLoading}
        qrError={qrError}
        onRefresh={refreshQr}
        qrTtlSec={qrTtlSec}
        showManualCode={showManualCode}
        manualCode={manualCode}
        progress={qrProgress}
        showMaxLevelMessage={maxLevelReached}
      />

      <PromoDetailModal promo={selectedPromo} onClose={() => setSelectedPromo(null)} />
    </div>
  );

  return (
    <div suppressHydrationWarning>
      <RegistrationGate
        status={auth.status}
        teleOnboarded={teleOnboarded}
        localOnboarded={localOnboarded}
        onboardingView={onboardingView}
        dashboardView={dashboardView}
        splashView={splashView}
      />
      {error && !loading && <div className="text-center text-sm text-red-500 mt-4">{error}</div>}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default dynamic(() => Promise.resolve(MiniappPage), { ssr: false });
