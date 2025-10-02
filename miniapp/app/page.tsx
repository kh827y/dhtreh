"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import QrCanvas from "../components/QrCanvas";
import {
  balance,
  consentGet,
  consentSet,
  levels,
  mechanicsLevels,
  mintQr,
  transactions,
  referralLink,
  referralActivate,
  promoCodeApply,
  submitReview,
} from "../lib/api";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { useMiniappAuth } from "../lib/useMiniapp";
import styles from "./page.module.css";

const REVIEW_PLATFORM_LABELS: Record<string, string> = {
  yandex: "Яндекс.Карты",
  twogis: "2ГИС",
  google: "Google",
};

const DEV_UI =
  (process.env.NEXT_PUBLIC_MINIAPP_DEV_UI || "").toLowerCase() === "true" ||
  process.env.NEXT_PUBLIC_MINIAPP_DEV_UI === "1";

type TelegramUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

type LevelInfo = {
  merchantId: string;
  customerId: string;
  metric: "earn" | "redeem" | "transactions";
  periodDays: number;
  value: number;
  current: { name: string; threshold: number };
  next: { name: string; threshold: number } | null;
  progressToNext: number;
};

type MechanicsLevel = {
  id?: string;
  name?: string;
  threshold?: number;
  cashbackPercent?: number | null;
  benefits?: { cashbackPercent?: number | null; [key: string]: unknown } | null;
  rewardPercent?: number | null;
};

type TelegramInitUser = {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initDataUnsafe?: { user?: TelegramInitUser };
  ready?: () => void;
  expand?: () => void;
  requestPhoneNumber?: () => Promise<unknown>;
  openTelegramLink?: (url: string) => void;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  orderId: string | null;
  outletId: string | null;
  staffId: string | null;
};

const genderOptions: Array<{ value: "male" | "female"; label: string }> = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tgWindow = window as TelegramWindow;
  return tgWindow.Telegram?.WebApp || null;
}

function getTelegramUser(): TelegramUser | null {
  try {
    const tg = getTelegramWebApp();
    const user = tg?.initDataUnsafe?.user;
    if (!user) return null;
    return {
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

function formatTxType(type: string): { title: string; tone: "earn" | "redeem" | "other" } {
  const lower = type.toLowerCase();
  if (lower.includes("earn")) return { title: "Начисление", tone: "earn" };
  if (lower.includes("redeem") || lower.includes("spend")) return { title: "Списание", tone: "redeem" };
  if (lower.includes("refund")) return { title: "Возврат", tone: "earn" };
  if (lower.includes("promo")) return { title: "Промокод", tone: "other" };
  if (lower.includes("campaign")) return { title: "Акция", tone: "other" };
  return { title: type, tone: "other" };
}

function isPurchaseTransaction(type: string, orderId?: string | null): boolean {
  const lower = type.toLowerCase();
  if (lower.includes("promo")) return false;
  if (lower.includes("campaign")) return false;
  if (lower.includes("referral")) return false;
  if (lower.includes("registration")) return false;
  if (lower.includes("birthday")) return false;
  if (lower.includes("gift")) return false;
  if (lower.includes("adjust")) return false;
  if (lower.includes("ttl")) return false;
  if (lower.includes("expire")) return false;
  if (orderId) {
    const normalizedOrder = orderId.toLowerCase();
    if (normalizedOrder.startsWith("gift")) return false;
    if (normalizedOrder.includes("promo")) return false;
  }
  if (lower === "earn" || lower === "redeem" || lower === "refund") return true;
  return lower.includes("purchase") || lower.includes("order") || lower.includes("sale");
}

function formatAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

const LOYALTY_EVENT_CHANNEL = "loyalty:events";
const LOYALTY_EVENT_STORAGE_KEY = "loyalty:lastEvent";

function getProgressPercent(levelInfo: LevelInfo | null): number {
  if (!levelInfo) return 0;
  if (!levelInfo.next) return 100;
  const currentThreshold = levelInfo.current?.threshold || 0;
  const distance = Math.max(1, levelInfo.next.threshold - currentThreshold);
  const progress = Math.max(0, levelInfo.value - currentThreshold);
  return Math.max(0, Math.min(100, Math.round((progress / distance) * 100)));
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReferralMessage(
  template: string,
  context: {
    merchantName: string;
    friendReward: number;
    code: string;
    link: string;
  },
): string {
  const baseTemplate = template?.trim() ||
    "Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или промокодом {code}.";
  const replacements: Record<string, string> = {
    "{businessname}": context.merchantName || "",
    "{bonusamount}": context.friendReward > 0 ? String(Math.round(context.friendReward)) : "",
    "{code}": context.code,
    "{link}": context.link,
  };
  let message = baseTemplate;
  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(escapeRegExp(placeholder), "gi");
    message = message.replace(regex, value);
  }
  return message.trim();
}

export default function Page() {
  const auth = useMiniappAuth(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const merchantId = auth.merchantId;
  const setMerchantId = auth.setMerchantId;
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [ttl, setTtl] = useState<number>(Number(process.env.NEXT_PUBLIC_QR_TTL || "60"));
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<TransactionItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [consent, setConsent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [profileForm, setProfileForm] = useState<{
    name: string;
    gender: "male" | "female" | "";
    birthDate: string;
  }>({
    name: "",
    gender: "",
    birthDate: "",
  });
  const [profileCompleted, setProfileCompleted] = useState<boolean>(true);
  const [profileTouched, setProfileTouched] = useState<boolean>(false);
  const [referralInfo, setReferralInfo] = useState<{
    code: string;
    link: string;
    messageTemplate: string;
    placeholders: string[];
    merchantName: string;
    friendReward: number;
  } | null>(null);
  const [referralEnabled, setReferralEnabled] = useState<boolean>(false);
  const [referralLoading, setReferralLoading] = useState<boolean>(false);
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteApplied, setInviteApplied] = useState<boolean>(false);
  const [promoCode, setPromoCode] = useState<string>("");
  const [promoLoading, setPromoLoading] = useState<boolean>(false);
  const [feedbackOpen, setFeedbackOpen] = useState<boolean>(false);
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [feedbackTxId, setFeedbackTxId] = useState<string | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<boolean>(false);
  const [pendingFeedbackEvent, setPendingFeedbackEvent] = useState<
    | {
        ts: number;
        mode?: "redeem" | "earn";
        redeemApplied?: number;
        earnApplied?: number;
        knownTxIds?: string[];
        candidateIds?: string[];
        source?: "event" | "observer";
      }
    | null
  >(null);
  const [ratedTransactions, setRatedTransactions] = useState<string[]>([]);
  const [ratedReady, setRatedReady] = useState<boolean>(false);
  const [dismissedTransactions, setDismissedTransactions] = useState<string[]>([]);
  const [dismissedReady, setDismissedReady] = useState<boolean>(false);
  const lastEventTsRef = useRef<number>(0);
  const txIdsRef = useRef<string[]>([]);
  const seenTxIdsRef = useRef<Set<string>>(new Set());
  const [txSnapshotReady, setTxSnapshotReady] = useState<boolean>(false);
  const [initialHydrationDone, setInitialHydrationDone] = useState<boolean>(false);
  const shareOptions = useMemo(() => {
    const share = auth.shareSettings;
    if (!share || !share.enabled) return [] as Array<{ id: string; url: string }>;
    if (!feedbackRating || feedbackRating < share.threshold) return [] as Array<{ id: string; url: string }>;
    const activeTx = feedbackTxId ? tx.find((item) => item.id === feedbackTxId) ?? null : null;
    const activeOutletId = activeTx?.outletId ?? null;
    const result: Array<{ id: string; url: string }> = [];
    for (const platform of share.platforms || []) {
      if (!platform || typeof platform !== "object") continue;
      if (!platform.enabled) continue;
      const outlets = Array.isArray(platform.outlets) ? platform.outlets : [];
      let url: string | null = null;
      if (activeOutletId) {
        const outletMatch = outlets.find((item) => item && item.outletId === activeOutletId);
        if (outletMatch && typeof outletMatch.url === "string" && outletMatch.url.trim()) {
          url = outletMatch.url.trim();
        }
      }
      if (!url && outlets.length > 0) {
        const fallbackOutlet = outlets.find((item) => item && typeof item.url === "string" && item.url.trim());
        if (fallbackOutlet) {
          url = fallbackOutlet.url.trim();
        }
      }
      if (!url && typeof platform.url === "string" && platform.url.trim()) {
        url = platform.url.trim();
      }
      if (!url) continue;
      result.push({ id: platform.id, url });
    }
    return result;
  }, [auth.shareSettings, feedbackRating, feedbackTxId, tx]);

  const handleShareClick = useCallback((url: string) => {
    if (!url) return;
    const tg = getTelegramWebApp();
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        return;
      }
    } catch {}
    try {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {}
  }, []);

  useEffect(() => {
    txIdsRef.current = tx.map((item) => item.id);
  }, [tx]);

  useEffect(() => {
    seenTxIdsRef.current = new Set();
    setTxSnapshotReady(false);
    setInitialHydrationDone(false);
  }, [customerId, merchantId]);

  useEffect(() => {
    const tgUser = getTelegramUser();
    if (tgUser) {
      setTelegramUser(tgUser);
      setProfileForm((prev) => ({
        ...prev,
        name: prev.name || [tgUser.firstName, tgUser.lastName].filter(Boolean).join(" "),
      }));
    }
    const tg = getTelegramWebApp();
    try {
      if (tg?.ready) tg.ready();
      if (tg?.expand) tg.expand();
      if (tg?.requestPhoneNumber) {
        tg.requestPhoneNumber().catch(() => undefined);
      }
    } catch {
      // ignore telegram errors
    }
    try {
      const savedProfile = localStorage.getItem("miniapp.profile");
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as {
          name?: string;
          gender?: "male" | "female";
          birthDate?: string;
        };
        setProfileForm({
          name: parsed.name || "",
          gender: parsed.gender || "",
          birthDate: parsed.birthDate || "",
        });
        setProfileCompleted(true);
      } else {
        setProfileCompleted(false);
      }
    } catch {
      setProfileCompleted(false);
    }
  }, []);

  useEffect(() => {
    setLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading) {
      setCustomerId(auth.customerId);
      if (auth.theme.ttl) setTtl(auth.theme.ttl);
    }
  }, [auth.loading, auth.error, auth.customerId, auth.theme]);

  const retry = useCallback(
    async <T,>(fn: () => Promise<T>, tries = 2, delayMs = 500): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        if (tries <= 0) throw error;
        await new Promise((r) => setTimeout(r, delayMs));
        return retry(fn, tries - 1, delayMs * 2);
      }
    },
    []
  );

  const doMint = useCallback(async () => {
    if (!customerId) {
      setStatus("Сначала авторизуйтесь");
      return;
    }
    try {
      const r = await mintQr(customerId, merchantId, ttl, auth.initData);
      setQrToken(r.token);
      setStatus(`QR обновлён (TTL ${r.ttl}с)`);
      setToast({ msg: "QR сгенерирован", type: "success" });
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка генерации QR: ${message}`);
      setToast({ msg: "Не удалось обновить QR", type: "error" });
    }
  }, [customerId, merchantId, ttl, auth.initData]);

  const loadBalance = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!customerId) {
      if (!silent) setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => balance(merchantId, customerId));
      setBal(r.balance);
      if (!silent) setStatus("Баланс обновлён");
    } catch (error) {
      const message = resolveErrorMessage(error);
      if (!silent) {
        setStatus(`Ошибка баланса: ${message}`);
        setToast({ msg: "Не удалось обновить баланс", type: "error" });
      }
    }
  }, [customerId, merchantId, retry]);

  const mapTransactions = useCallback(
    (
      items: Array<{
        id: string;
        type: string;
        amount: number;
        createdAt: string;
        orderId?: string | null;
        outletId?: string | null;
        staffId?: string | null;
      }>,
    ) => {
      return items
        .filter((i) => i && typeof i === "object")
        .map((i) => ({
          id: i.id,
          type: i.type,
          amount: i.amount,
          createdAt: i.createdAt,
          orderId: i.orderId ?? null,
          outletId: i.outletId ?? null,
          staffId: i.staffId ?? null,
        }));
    },
    []
  );

  const loadTx = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!customerId) {
      if (!silent) setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => transactions(merchantId, customerId, 20));
      setTx(mapTransactions(r.items));
      setNextBefore(r.nextBefore || null);
      setTxSnapshotReady(true);
      if (!silent) setStatus("История обновлена");
    } catch (error) {
      const message = resolveErrorMessage(error);
      if (!silent) {
        setStatus(`Ошибка истории: ${message}`);
        setToast({ msg: "Не удалось обновить историю", type: "error" });
      }
      setTxSnapshotReady(true);
    }
  }, [customerId, merchantId, retry, mapTransactions]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx((prev) => [...prev, ...mapTransactions(r.items)]);
      setNextBefore(r.nextBefore || null);
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка подгрузки: ${message}`);
    }
  }, [merchantId, customerId, nextBefore, mapTransactions]);

  const loadLevels = useCallback(async () => {
    if (!customerId) return;
    try {
      const info = await retry(() => levels(merchantId, customerId));
      setLevelInfo(info);
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Не удалось обновить уровень: ${message}`);
    }
  }, [customerId, merchantId, retry]);

  const loadLevelCatalog = useCallback(async () => {
    try {
      const cfg = await retry(() => mechanicsLevels(merchantId));
      if (Array.isArray(cfg?.levels)) {
        setLevelCatalog(
          cfg.levels.filter((lvl: MechanicsLevel) => lvl && typeof lvl === "object") as MechanicsLevel[]
        );
      }
    } catch {
      setLevelCatalog([]);
    }
  }, [merchantId, retry]);

  const ratedTxSet = useMemo(() => new Set(ratedTransactions), [ratedTransactions]);
  const dismissedTxSet = useMemo(() => new Set(dismissedTransactions), [dismissedTransactions]);

  useEffect(() => {
    lastEventTsRef.current = 0;
  }, [merchantId, customerId]);

  useEffect(() => {
    const seen = seenTxIdsRef.current;
    const fresh: TransactionItem[] = [];
    for (const item of tx) {
      if (!seen.has(item.id)) {
        fresh.push(item);
        if (txSnapshotReady) {
          seen.add(item.id);
        }
      }
    }
    if (!txSnapshotReady) {
      fresh.forEach((item) => seen.add(item.id));
      return;
    }
    if (!initialHydrationDone) {
      fresh.forEach((item) => seen.add(item.id));
      setInitialHydrationDone(true);
      return;
    }
    if (!fresh.length) return;
    if (pendingFeedbackEvent) return;
    const candidate = fresh.find((item) => {
      const meta = formatTxType(item.type);
      if (meta.tone !== "earn" && meta.tone !== "redeem") return false;
      if (!isPurchaseTransaction(item.type, item.orderId)) return false;
      if (ratedTxSet.has(item.id) || dismissedTxSet.has(item.id)) return false;
      return true;
    });
    if (!candidate) return;
    setPendingFeedbackEvent({ ts: Date.now(), candidateIds: [candidate.id], source: "observer" });
  }, [
    tx,
    txSnapshotReady,
    initialHydrationDone,
    pendingFeedbackEvent,
    ratedTxSet,
    dismissedTxSet,
  ]);

  const refreshHistory = useCallback(() => {
    if (!customerId) return;
    const tasks: Array<Promise<unknown>> = [
      loadBalance({ silent: true }),
      loadTx({ silent: true }),
      loadLevels(),
    ];
    void Promise.allSettled(tasks);
  }, [customerId, loadBalance, loadTx, loadLevels]);

  const handleExternalEvent = useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const eventMerchant = data.merchantId ? String(data.merchantId) : "";
      if (eventMerchant && eventMerchant !== merchantId) return;
      const eventCustomer = data.customerId ? String(data.customerId) : "";
      if (eventCustomer && customerId && eventCustomer !== customerId) return;
      const typeRaw = data.type ?? data.eventType;
      let eventType = "";
      if (typeRaw) {
        eventType = String(typeRaw).toLowerCase();
        if (
          !eventType.includes("commit") &&
          !eventType.includes("redeem") &&
          !eventType.includes("earn")
        ) {
          return;
        }
      }
      const tsRaw =
        typeof data.ts === "number"
          ? data.ts
          : typeof data.timestamp === "number"
            ? data.timestamp
            : typeof (data as Record<string, unknown>)._ts === "number"
              ? (data as Record<string, unknown>)._ts
              : Number(data.ts ?? data.timestamp ?? (data as Record<string, unknown>)._ts ?? 0);
      if (Number.isFinite(tsRaw) && tsRaw > 0) {
        if (tsRaw <= lastEventTsRef.current) return;
        lastEventTsRef.current = tsRaw;
      } else {
        lastEventTsRef.current = Date.now();
      }
      const redeemApplied = toFiniteNumber(data.redeemApplied);
      const earnApplied = toFiniteNumber(data.earnApplied);
      const modeRaw = typeof data.mode === "string" ? data.mode.toLowerCase() : undefined;
      const normalizedMode =
        modeRaw === "redeem" || modeRaw === "earn" ? (modeRaw as "redeem" | "earn") : undefined;
      const isCommitEvent = eventType.includes("commit");
      const hasPurchaseImpact =
        (redeemApplied ?? 0) > 0 || (earnApplied ?? 0) > 0 || normalizedMode === "redeem" || normalizedMode === "earn";
      if (isCommitEvent && hasPurchaseImpact) {
        setPendingFeedbackEvent({
          ts: lastEventTsRef.current,
          mode: normalizedMode,
          redeemApplied: redeemApplied ?? undefined,
          earnApplied: earnApplied ?? undefined,
          knownTxIds: txIdsRef.current.slice(0, 50),
          source: "event",
        });
      }
      refreshHistory();
    },
    [merchantId, customerId, refreshHistory],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!merchantId || !customerId) return;
    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel(LOYALTY_EVENT_CHANNEL);
        channel.onmessage = (event) => handleExternalEvent(event.data);
      } catch {
        channel = null;
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOYALTY_EVENT_STORAGE_KEY || !event.newValue) return;
      try {
        handleExternalEvent(JSON.parse(event.newValue));
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", handleStorage);
    try {
      const cached = localStorage.getItem(LOYALTY_EVENT_STORAGE_KEY);
      if (cached) handleExternalEvent(JSON.parse(cached));
    } catch {
      // ignore
    }
    return () => {
      window.removeEventListener("storage", handleStorage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }
    };
  }, [merchantId, customerId, handleExternalEvent]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!customerId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      refreshHistory();
    }, 20000);
    return () => {
      window.clearInterval(interval);
    };
  }, [customerId, refreshHistory]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshHistory();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshHistory]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("miniapp.ratedTransactions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRatedTransactions(parsed.filter((id) => typeof id === "string"));
        }
      }
    } catch {
      setRatedTransactions([]);
    } finally {
      setRatedReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ratedReady) return;
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("miniapp.ratedTransactions", JSON.stringify(ratedTransactions));
    } catch {
      // ignore
    }
  }, [ratedTransactions, ratedReady]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("miniapp.dismissedTransactions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDismissedTransactions(parsed.filter((id) => typeof id === "string"));
        }
      }
    } catch {
      setDismissedTransactions([]);
    } finally {
      setDismissedReady(true);
    }
  }, []);

  useEffect(() => {
    if (!dismissedReady) return;
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem(
        "miniapp.dismissedTransactions",
        JSON.stringify(dismissedTransactions),
      );
    } catch {
      // ignore
    }
  }, [dismissedTransactions, dismissedReady]);

  useEffect(() => {
    if (!ratedReady || !dismissedReady || feedbackOpen) return;
    if (!tx.length) return;
    const eventTs = pendingFeedbackEvent?.ts ?? null;
    const earliestAllowed =
      eventTs && Number.isFinite(eventTs) ? eventTs - 30 * 60 * 1000 : null;
    const latestAllowed =
      eventTs && Number.isFinite(eventTs) ? eventTs + 30 * 60 * 1000 : null;
    const candidateIdsSet =
      pendingFeedbackEvent?.candidateIds && pendingFeedbackEvent.candidateIds.length
        ? new Set(pendingFeedbackEvent.candidateIds)
        : null;
    const knownSet =
      pendingFeedbackEvent?.knownTxIds && pendingFeedbackEvent.knownTxIds.length
        ? new Set(pendingFeedbackEvent.knownTxIds)
        : null;
    const basePool = candidateIdsSet
      ? tx.filter((item) => candidateIdsSet.has(item.id))
      : pendingFeedbackEvent && knownSet
        ? tx.filter((item) => !knownSet.has(item.id))
        : tx;
    const candidateSource =
      pendingFeedbackEvent && !candidateIdsSet && basePool.length === 0 ? tx : basePool;
    const candidate = candidateSource.find((item) => {
      const meta = formatTxType(item.type);
      if (meta.tone !== "earn" && meta.tone !== "redeem") return false;
      if (!isPurchaseTransaction(item.type, item.orderId)) return false;
      if (ratedTxSet.has(item.id) || dismissedTxSet.has(item.id)) return false;
      if (!pendingFeedbackEvent || pendingFeedbackEvent.source === "observer") return true;
      const createdAtMs = parseDateMs(item.createdAt);
      if (!createdAtMs) return false;
      if (earliestAllowed && createdAtMs < earliestAllowed) return false;
      if (latestAllowed && createdAtMs > latestAllowed) return false;
      return true;
    });
    if (!candidate) {
      if (pendingFeedbackEvent?.source === "observer") {
        setPendingFeedbackEvent(null);
      }
      return;
    }
    setPendingFeedbackEvent(null);
    setFeedbackRating(0);
    setFeedbackComment("");
    setFeedbackTxId(candidate.id);
    setDismissedTransactions((prev) =>
      prev.includes(candidate.id) ? prev : [...prev, candidate.id],
    );
    setFeedbackOpen(true);
  }, [
    tx,
    ratedTxSet,
    dismissedTxSet,
    ratedReady,
    dismissedReady,
    feedbackOpen,
    pendingFeedbackEvent,
  ]);

  const handleFeedbackClose = useCallback(() => {
    if (feedbackTxId) {
      setDismissedTransactions((prev) =>
        prev.includes(feedbackTxId) ? prev : [...prev, feedbackTxId]
      );
    }
    setFeedbackOpen(false);
    setFeedbackTxId(null);
    setFeedbackRating(0);
    setFeedbackComment("");
  }, [feedbackTxId]);

  const handleFeedbackSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!feedbackRating) {
        setToast({ msg: "Поставьте оценку", type: "error" });
        return;
      }
      if (!merchantId || !customerId) {
        setToast({ msg: "Не удалось определить клиента", type: "error" });
        return;
      }
      const activeTx = feedbackTxId
        ? tx.find((item) => item.id === feedbackTxId) ?? null
        : null;
      try {
        setFeedbackSubmitting(true);
        await submitReview({
          merchantId,
          customerId,
          rating: feedbackRating,
          comment: feedbackComment,
          orderId: activeTx?.orderId ?? null,
          transactionId: feedbackTxId,
          outletId: activeTx?.outletId ?? null,
          staffId: activeTx?.staffId ?? null,
        });
        if (feedbackTxId) {
          setRatedTransactions((prev) =>
            prev.includes(feedbackTxId) ? prev : [...prev, feedbackTxId]
          );
        }
        setToast({ msg: "Спасибо за отзыв!", type: "success" });
        setFeedbackOpen(false);
        setFeedbackTxId(null);
        setFeedbackComment("");
        setFeedbackRating(0);
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: "error" });
      } finally {
        setFeedbackSubmitting(false);
      }
    },
    [
      feedbackRating,
      merchantId,
      customerId,
      feedbackTxId,
      tx,
      feedbackComment,
    ]
  );

  const handleFeedbackCommentChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setFeedbackComment(event.currentTarget.value);
    },
    []
  );

  useEffect(() => {
    if (!qrToken || !autoRefresh) return;
    const id = setTimeout(() => {
      doMint().catch(() => undefined);
    }, Math.max(5, ttl - 5) * 1000);
    return () => clearTimeout(id);
  }, [qrToken, autoRefresh, ttl, doMint]);

  const syncConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await consentGet(merchantId, customerId);
      setConsent(!!r.granted);
    } catch {
      // ignore
    }
  }, [customerId, merchantId]);

  useEffect(() => {
    loadLevelCatalog();
  }, [loadLevelCatalog]);

  useEffect(() => {
    if (customerId) {
      syncConsent();
      loadBalance();
      loadTx();
      loadLevels();
    }
  }, [customerId, syncConsent, loadBalance, loadTx, loadLevels]);

  useEffect(() => {
    if (!customerId) {
      setReferralEnabled(false);
      setReferralInfo(null);
      return;
    }
    let cancelled = false;
    setReferralLoading(true);
    setReferralEnabled(false);
    setReferralInfo(null);
    setInviteApplied(false);
    setInviteCode("");
    referralLink(customerId, merchantId)
      .then((data) => {
        if (cancelled) return;
        setReferralInfo({
          code: data.code,
          link: data.link,
          messageTemplate: data.program?.messageTemplate ?? "",
          placeholders: Array.isArray(data.program?.placeholders) ? data.program.placeholders : [],
          merchantName: data.program?.merchantName ?? "",
          friendReward: typeof data.program?.refereeReward === "number" ? data.program.refereeReward : 0,
        });
        setReferralEnabled(true);
      })
      .catch(() => {
        if (!cancelled) {
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
  }, [customerId, merchantId]);

  useEffect(() => {
    if (customerId && !qrToken) {
      doMint().catch(() => undefined);
    }
  }, [customerId, qrToken, doMint]);

  const toggleConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      await consentSet(merchantId, customerId, !consent);
      setConsent(!consent);
      setToast({ msg: "Настройки согласия обновлены", type: "success" });
    } catch (error) {
      const message = resolveErrorMessage(error);
      setToast({ msg: `Ошибка согласия: ${message}`, type: "error" });
    }
  }, [merchantId, customerId, consent]);

  const handleProfileSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setProfileTouched(true);
      if (!profileForm.name || !profileForm.gender || !profileForm.birthDate) {
        setToast({ msg: "Заполните все поля", type: "error" });
        return;
      }
      try {
        localStorage.setItem("miniapp.profile", JSON.stringify(profileForm));
        setProfileCompleted(true);
        setToast({ msg: "Профиль сохранён", type: "success" });
      } catch (error) {
        const message = resolveErrorMessage(error);
        setToast({ msg: `Не удалось сохранить: ${message}`, type: "error" });
      }
      if (referralEnabled && inviteCode.trim() && customerId) {
        try {
          await referralActivate(inviteCode.trim(), customerId);
          setInviteApplied(true);
          setInviteCode("");
          setToast({ msg: "Пригласительный код активирован", type: "success" });
        } catch (error) {
          const message = resolveErrorMessage(error);
          setToast({ msg: `Не удалось активировать код: ${message}`, type: "error" });
        }
      }
    },
    [profileForm, referralEnabled, inviteCode, customerId]
  );

  const handleInviteFriend = useCallback(async () => {
    if (!referralInfo) {
      setToast({ msg: "Реферальная программа недоступна", type: "error" });
      return;
    }
    const message = buildReferralMessage(referralInfo.messageTemplate, {
      merchantName: referralInfo.merchantName,
      friendReward: referralInfo.friendReward,
      code: referralInfo.code,
      link: referralInfo.link,
    });
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralInfo.link)}&text=${encodeURIComponent(message)}`;
    try {
      const tg = getTelegramWebApp();
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
        setToast({ msg: "Откройте Telegram, чтобы отправить приглашение", type: "success" });
        return;
      }
    } catch {
      // ignore telegram errors
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: message, url: referralInfo.link });
        setToast({ msg: "Сообщение готово к отправке", type: "success" });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        setToast({ msg: "Текст приглашения скопирован", type: "success" });
        return;
      } catch {
        // ignore clipboard errors
      }
    }
    setToast({ msg: message || "Скопируйте приглашение и отправьте другу", type: "info" });
  }, [referralInfo]);

  const progressPercent = useMemo(() => getProgressPercent(levelInfo), [levelInfo]);
  const nextLevelLabel = levelInfo?.next?.name || "";
  const purchasesToNext = levelInfo?.progressToNext ?? 0;

  const availablePromotions = useMemo(
    () => tx.filter((item) => /promo|campaign/i.test(item.type)).length,
    [tx]
  );

  const handlePromoActivate = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const code = promoCode.trim();
      if (!code) {
        setToast({ msg: "Введите промокод", type: "error" });
        return;
      }
    if (!customerId) {
      setToast({ msg: "Не удалось определить клиента", type: "error" });
      return;
    }
    if (!merchantId) {
      setToast({ msg: "Не удалось определить мерчанта", type: "error" });
      return;
    }
    setPromoLoading(true);
    try {
      const result = await promoCodeApply(merchantId, customerId, code);
      if (result.ok) {
        const successMessage = result.message ||
          (result.pointsIssued > 0
            ? `Начислено ${result.pointsIssued} баллов`
            : "Промокод активирован");
        setToast({ msg: successMessage, type: "success" });
        setPromoCode("");
        if (typeof result.balance === "number" && !Number.isNaN(result.balance)) {
          setBal(result.balance);
        }
        await Promise.allSettled([loadBalance(), loadTx()]);
      } else {
        setToast({ msg: "Промокод не подошёл", type: "error" });
      }
    } catch (error) {
      const message = resolveErrorMessage(error);
      setToast({ msg: `Не удалось активировать: ${message}`, type: "error" });
    } finally {
      setPromoLoading(false);
    }
  },
    [promoCode, customerId, merchantId, loadBalance, loadTx]
  );

  const cashbackPercent = useMemo(() => {
    const currentName = levelInfo?.current?.name;
    if (!currentName) return null;
    const entry = levelCatalog.find((lvl) => (lvl?.name || "").toLowerCase() === currentName.toLowerCase());
    if (!entry) return null;
    if (typeof entry.cashbackPercent === "number") return entry.cashbackPercent;
    if (entry.benefits && typeof entry.benefits.cashbackPercent === "number") {
      return entry.benefits.cashbackPercent;
    }
    if (typeof entry.rewardPercent === "number") return entry.rewardPercent;
    return null;
  }, [levelInfo, levelCatalog]);

  const displayName = useMemo(() => {
    if (profileForm.name) return profileForm.name;
    if (telegramUser) {
      return (
        [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") ||
        telegramUser.username ||
        "Вы"
      );
    }
    return "Вы";
  }, [profileForm.name, telegramUser]);

  const profilePage = !profileCompleted;

  return (
    <div className={styles.page}>
      {profilePage ? (
        <div className={styles.profileContainer}>
          <form className={styles.profileCard} onSubmit={handleProfileSubmit}>
            <div className={`${styles.appear} ${styles.delay0}`}>
              <div className={styles.profileTitle}>Расскажите о себе</div>
              <div className={styles.profileSubtitle}>
                Заполните данные, чтобы мы начисляли бонусы лично вам
              </div>
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay1}`}>
              <label htmlFor="name">Имя</label>
              <input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Введите имя"
                className={profileTouched && !profileForm.name ? styles.inputError : undefined}
              />
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay2}`}>
              <span>Пол</span>
              <div
                className={`${styles.genderRow} ${
                  profileTouched && !profileForm.gender ? styles.inputErrorBorder : ""
                }`}
              >
                {genderOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setProfileForm((prev) => ({ ...prev, gender: option.value }))}
                    className={`${styles.genderButton} ${
                      profileForm.gender === option.value ? styles.genderButtonActive : ""
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay3}`}>
              <label htmlFor="birth">Дата рождения</label>
              <input
                id="birth"
                type="date"
                value={profileForm.birthDate}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                className={profileTouched && !profileForm.birthDate ? styles.inputError : undefined}
              />
            </div>
            {referralEnabled && (
              <div className={`${styles.profileField} ${styles.appear} ${styles.delay4}`}>
                <label htmlFor="invite">Ввести пригласительный код</label>
                <input
                  id="invite"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Например, FRIEND123"
                  disabled={inviteApplied}
                />
                <span className={styles.profileHint}>
                  {inviteApplied
                    ? "Код успешно активирован."
                    : "Если у вас есть код друга, введите его и получите приветственный бонус."}
                </span>
              </div>
            )}
            <button
              type="submit"
              className={`${styles.profileSubmit} ${styles.appear} ${referralEnabled ? styles.delay5 : styles.delay4}`}
            >
              Сохранить
            </button>
          </form>
        </div>
      ) : (
        <>
          <header className={`${styles.header} ${styles.appear} ${styles.delay0}`}>
            <button className={styles.headerIconButton} aria-label="Назад">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.5 5L7 9.5L11.5 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className={styles.userBlock}>
              <div className={styles.avatarWrap}>
                {telegramUser?.photoUrl ? (
                  <Image
                    src={telegramUser.photoUrl}
                    alt="avatar"
                    width={52}
                    height={52}
                    className={styles.avatar}
                    unoptimized
                  />
                ) : (
                  <div className={styles.avatarFallback}>{displayName.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
              <div className={styles.userName}>{displayName}</div>
            </div>
            <button
              className={styles.headerIconButton}
              aria-label="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.272 11.5C3.10075 10.5221 3.10075 9.47795 3.272 8.5L1.66634 7.16634L3.16634 3.83301L5.16634 4.33301C5.873 3.64213 6.72911 3.1071 7.66634 2.76967L8.00067 0.666344H12.0007L12.335 2.76967C13.2722 3.1071 14.1283 3.64213 14.835 4.33301L16.835 3.83301L18.335 7.16634L16.7293 8.5C16.9006 9.47795 16.9006 10.5221 16.7293 11.5L18.335 12.8337L16.835 16.167L14.835 15.667C14.1283 16.3579 13.2722 16.8929 12.335 17.2303L12.0007 19.3337H8.00067L7.66634 17.2303C6.72911 16.8929 5.873 16.3579 5.16634 15.667L3.16634 16.167L1.66634 12.8337L3.272 11.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </header>

          {referralEnabled && referralInfo && (
            <div className={`${styles.inviteBar} ${styles.appear} ${styles.delay0}`}>
              <button
                type="button"
                className={styles.inviteFriendButton}
                onClick={handleInviteFriend}
                disabled={referralLoading}
              >
                🤝 Пригласить друга
              </button>
              <span className={styles.inviteCodeBadge}>Ваш код: {referralInfo.code}</span>
            </div>
          )}

          <section className={`${styles.card} ${styles.appear} ${styles.delay1}`}>
            <button className={styles.qrMini} onClick={() => setShowQrModal(true)} aria-label="Открыть QR">
              <div className={styles.qrWrapper}>
                {qrToken ? <QrCanvas value={qrToken} /> : <div className={styles.qrPlaceholder} />}
              </div>
              <span className={styles.qrHint}>Нажмите</span>
            </button>
            <div className={styles.cardContent}>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Баланс</span>
                <span className={styles.cardValue}>{bal != null ? bal.toLocaleString("ru-RU") : "—"}</span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Уровень</span>
                <span className={styles.cardValue}>{levelInfo?.current?.name || "—"}</span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Кэшбэк</span>
                <span className={styles.cardValue}>
                  {typeof cashbackPercent === "number" ? `${cashbackPercent}%` : "—"}
                </span>
              </div>
            </div>
          </section>

          {levelInfo?.next && (
            <section className={`${styles.levelSection} ${styles.appear} ${styles.delay2}`}>
              <div className={styles.levelHeader}>
                Сумма покупок для перехода на {nextLevelLabel}
              </div>
              <div className={styles.levelInfoRow}>
                <span className={styles.levelAmount}>{purchasesToNext.toLocaleString("ru-RU")}</span>
                <span className={styles.levelUnit}>
                  {levelInfo.metric === "transactions" ? "покупок" : "₽"}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
              </div>
            </section>
          )}

          <section className={`${styles.actionsRow} ${styles.appear} ${styles.delay3}`}>
            <form className={styles.promoInputBlock} onSubmit={handlePromoActivate}>
              <input
                className={styles.promoInput}
                placeholder="Введите промокод"
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                disabled={promoLoading}
                aria-label="Введите промокод"
              />
              <button
                type="submit"
                className={styles.promoButton}
                disabled={promoLoading || !promoCode.trim()}
              >
                {promoLoading ? "Подождите" : "Активировать"}
              </button>
            </form>
            <button className={styles.promotionsButton}>
              <span>Акции</span>
              <span className={styles.promotionsBadge}>{availablePromotions}</span>
            </button>
          </section>

          <section className={`${styles.historySection} ${styles.appear} ${styles.delay4}`}>
            <div className={styles.historyHeader}>История</div>
            {tx.length === 0 ? (
              <div className={styles.emptyState}>Операций пока нет</div>
            ) : (
              <ul className={styles.historyList}>
                {tx.map((item, idx) => {
                  const meta = formatTxType(item.type);
                  return (
                    <li
                      key={item.id}
                      className={`${styles.historyItem} ${styles[`historyTone_${meta.tone}`]}`}
                      style={{ animationDelay: `${0.05 * idx}s` }}
                    >
                      <div className={styles.historyIcon}>
                        {meta.tone === "earn" ? "⬆" : meta.tone === "redeem" ? "⬇" : "★"}
                      </div>
                      <div className={styles.historyBody}>
                        <div className={styles.historyTitle}>{meta.title}</div>
                        <div className={styles.historyDate}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div className={styles.historyAmount}>{formatAmount(item.amount)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
            {nextBefore && (
              <button className={styles.loadMore} onClick={loadMore}>
                Показать ещё
              </button>
            )}
          </section>

          {status && (
            <div className={`${styles.statusBar} ${styles.appear} ${styles.delay5}`}>
              {status}
            </div>
          )}

          {DEV_UI && (
            <section className={`${styles.devPanel} ${styles.appear} ${styles.delay5}`}>
              <div className={styles.devRow}>
                <label>
                  Мерчант
                  <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
                </label>
                <label>
                  TTL QR
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={ttl}
                    onChange={(e) => setTtl(parseInt(e.target.value || "60", 10))}
                  />
                </label>
              </div>
              <label>
                CustomerId
                <input
                  value={customerId || ""}
                  placeholder="teleauth заполнит сам"
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    localStorage.setItem("miniapp.customerId", e.target.value);
                  }}
                />
              </label>
            </section>
          )}
        </>
      )}

      {(loading || auth.loading) && (
        <div className={styles.loaderOverlay}>
          <Spinner />
        </div>
      )}

      {error && !loading && <div className={styles.error}>{error}</div>}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {feedbackOpen && (
        <div className={styles.modalBackdrop} onClick={handleFeedbackClose}>
          <form
            className={`${styles.sheet} ${styles.feedbackSheet}`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleFeedbackSubmit}
          >
            <button
              type="button"
              className={styles.feedbackClose}
              onClick={handleFeedbackClose}
              aria-label="Закрыть окно оценки"
            >
              ✕
            </button>
            <div className={styles.feedbackHeader}>
              <div className={styles.feedbackTitle}>Оцените визит.</div>
              <div className={styles.feedbackSubtitle}>
                Ваш отзыв поможет нам улучшить сервис.
              </div>
            </div>
            <div className={styles.feedbackStars} role="radiogroup" aria-label="Оценка визита">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.starButton} ${
                    feedbackRating >= value ? styles.starButtonActive : ""
                  }`}
                  onClick={() => setFeedbackRating(value)}
                  role="radio"
                  aria-checked={feedbackRating >= value}
                  aria-label={`Оценка ${value}`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className={styles.feedbackCommentLabel}>
              Комментарий
              <textarea
                className={styles.feedbackComment}
                value={feedbackComment}
                onChange={handleFeedbackCommentChange}
                placeholder="Расскажите, что понравилось"
                rows={3}
              />
            </label>
            {shareOptions.length > 0 && (
              <div className={styles.feedbackShareBlock}>
                <div className={styles.feedbackShareTitle}>
                  Мы рады, что вам понравилось! Пожалуйста, поделитесь своим отзывом
                </div>
                <div className={styles.feedbackShareButtons}>
                  {shareOptions.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={styles.feedbackShareButton}
                      onClick={() => handleShareClick(platform.url)}
                    >
                      {REVIEW_PLATFORM_LABELS[platform.id] || platform.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="submit"
              className={styles.feedbackSubmit}
              disabled={!feedbackRating || feedbackSubmitting}
              aria-busy={feedbackSubmitting || undefined}
            >
              {feedbackSubmitting ? "Отправляем…" : "Отправить"}
            </button>
          </form>
        </div>
      )}

      {showQrModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowQrModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Покажите этот QR на кассе</span>
              <button className={styles.modalClose} onClick={() => setShowQrModal(false)} aria-label="Закрыть">
                ✕
              </button>
            </div>
            {qrToken ? <QrCanvas value={qrToken} /> : <div className={styles.qrPlaceholder} />}
            <button className={styles.modalRefresh} onClick={doMint}>
              Обновить QR
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>Настройки</div>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Автообновление QR</span>
            </label>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={consent} onChange={toggleConsent} />
              <span>Согласие на рассылку</span>
            </label>
            <button className={styles.sheetButton} onClick={() => loadBalance()}>
              Обновить баланс
            </button>
            <button className={styles.sheetButton} onClick={() => loadTx()}>
              Обновить историю
            </button>
            <button className={styles.sheetButton} onClick={doMint}>
              Пересоздать QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
