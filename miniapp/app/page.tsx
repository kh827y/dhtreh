"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import FakeQr from "../components/FakeQr";
import {
  balance,
  consentGet,
  consentSet,
  levels,
  mechanicsLevels,
  transactions,
  referralLink,
  referralActivate,
  promoCodeApply,
  promotionsList,
  promotionClaim,
  profileGet,
  profileSave,
  type PromotionItem,
} from "../lib/api";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { useMiniappAuthContext } from "../lib/MiniappAuthContext";
import { type LevelInfo } from "../lib/levels";
import { getTransactionMeta, type TransactionKind } from "../lib/transactionMeta";
import { subscribeToLoyaltyEvents } from "../lib/loyaltyEvents";
import { type TransactionItem } from "../lib/reviewUtils";
import { getTelegramWebApp } from "../lib/telegram";
import styles from "./page.module.css";

const DEV_UI =
  (process.env.NEXT_PUBLIC_MINIAPP_DEV_UI || "").toLowerCase() === "true" ||
  process.env.NEXT_PUBLIC_MINIAPP_DEV_UI === "1";

type TelegramUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

const TIME_ICON = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 5.8V10l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type MechanicsLevel = {
  id?: string;
  name?: string;
  threshold?: number;
  cashbackPercent?: number | null;
  benefits?: { cashbackPercent?: number | null; [key: string]: unknown } | null;
  rewardPercent?: number | null;
};

const genderOptions: Array<{ value: "male" | "female"; label: string }> = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

const HISTORY_ICONS: Record<TransactionKind, ReactNode> = {
  earn: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 15V5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 9L10 5L14 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  redeem: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 5V15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11L10 15L6 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  campaign: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.5L11.9021 7.17297L16.9021 7.52786L12.9511 10.827L14.1803 15.7221L10 13.0153L5.81966 15.7221L7.04894 10.827L3.09789 7.52786L8.09789 7.17297L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  promo: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6 4H14C15.1046 4 16 4.89543 16 6V8.5C16 9.32843 15.3284 10 14.5 10C15.3284 10 16 10.6716 16 11.5V14C16 15.1046 15.1046 16 14 16H6C4.89543 16 4 15.1046 4 14V11.5C4 10.6716 4.67157 10 5.5 10C4.67157 10 4 9.32843 4 8.5V6C4 4.89543 4.89543 4 6 4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 7H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 13H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 10H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  refund: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 11C5 14.3137 7.68629 17 11 17C13.4853 17 15.6406 15.4926 16.5565 13.2792"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15 9C15 5.68629 12.3137 3 9 3C6.51472 3 4.35939 4.50736 3.44354 6.72081"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M4 4V7H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16V13H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  adjust: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 10H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 6L10 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  other: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5.5 10C5.5 9.17157 6.17157 8.5 7 8.5C7.82843 8.5 8.5 9.17157 8.5 10C8.5 10.8284 7.82843 11.5 7 11.5C6.17157 11.5 5.5 10.8284 5.5 10Z"
        fill="currentColor"
      />
      <path
        d="M8.5 10C8.5 9.17157 9.17157 8.5 10 8.5C10.8284 8.5 11.5 9.17157 11.5 10C11.5 10.8284 10.8284 11.5 10 11.5C9.17157 11.5 8.5 10.8284 8.5 10Z"
        fill="currentColor"
      />
      <path
        d="M11.5 10C11.5 9.17157 12.1716 8.5 13 8.5C13.8284 8.5 14.5 9.17157 14.5 10C14.5 10.8284 13.8284 11.5 13 11.5C12.1716 11.5 11.5 10.8284 11.5 10Z"
        fill="currentColor"
      />
    </svg>
  ),
};

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

function formatAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
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
  const router = useRouter();
  const auth = useMiniappAuthContext();
  const merchantId = auth.merchantId;
  const setMerchantId = auth.setMerchantId;
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<TransactionItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>([]);
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
  const [promotionsOpen, setPromotionsOpen] = useState<boolean>(false);
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState<boolean>(false);

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
      const key = `miniapp.profile.v2:${merchantId}`;
      const savedProfile = merchantId ? localStorage.getItem(key) : null;
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as { name?: string; gender?: "male" | "female"; birthDate?: string };
        const name = parsed.name || "";
        const gender = parsed.gender || "";
        const birthDate = parsed.birthDate || "";
        setProfileForm({ name, gender, birthDate });
        const valid = Boolean(name && (gender === "male" || gender === "female") && birthDate);
        setProfileCompleted(valid);
      } else {
        setProfileCompleted(false);
      }
    } catch {
      setProfileCompleted(false);
    }
  }, [merchantId]);

  // Подтянуть профиль с сервера (кросс-девайс) при наличии авторизации
  useEffect(() => {
    if (!merchantId || !customerId) return;
    let cancelled = false;
    const key = `miniapp.profile.v2:${merchantId}`;
    (async () => {
      try {
        const p = await profileGet(merchantId, customerId);
        if (cancelled) return;
        const name = p?.name || "";
        const gender = (p?.gender === "male" || p?.gender === "female") ? p.gender : "";
        const birthDate = p?.birthDate || "";
        const valid = Boolean(name && (gender === "male" || gender === "female") && birthDate);
        setProfileForm({ name, gender, birthDate });
        setProfileCompleted(valid);
        try { localStorage.setItem(key, JSON.stringify({ name, gender, birthDate })); } catch {}
      } catch {
        // сервер мог не иметь профиля — оставим локальные данные/валидацию
      }
    })();
    return () => { cancelled = true; };
  }, [merchantId, customerId]);

  useEffect(() => {
    setLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading) {
      setCustomerId(auth.customerId);
    }
  }, [auth.loading, auth.error, auth.customerId]);

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
        reviewId?: string | null;
        reviewRating?: number | null;
        reviewCreatedAt?: string | null;
        pending?: boolean;
        maturesAt?: string | null;
        daysUntilMature?: number | null;
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
          reviewId: i.reviewId ?? null,
          reviewRating: typeof i.reviewRating === "number" ? i.reviewRating : null,
          reviewCreatedAt: i.reviewCreatedAt ?? null,
          pending: Boolean(i.pending),
          maturesAt: i.maturesAt ?? null,
          daysUntilMature: typeof i.daysUntilMature === 'number' ? i.daysUntilMature : null,
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
      if (!silent) setStatus("История обновлена");
    } catch (error) {
      const message = resolveErrorMessage(error);
      if (!silent) {
        setStatus(`Ошибка истории: ${message}`);
        setToast({ msg: "Не удалось обновить историю", type: "error" });
      }
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

  const loadPromotions = useCallback(async () => {
    if (!merchantId || !customerId) {
      setPromotions([]);
      return;
    }
    try {
      setPromotionsLoading(true);
      const list = await promotionsList(merchantId, customerId);
      setPromotions(Array.isArray(list) ? list : []);
    } catch (error) {
      setPromotions([]);
      setToast({ msg: `Не удалось загрузить акции: ${resolveErrorMessage(error)}`, type: "error" });
    } finally {
      setPromotionsLoading(false);
    }
  }, [merchantId, customerId]);

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
      if (typeRaw) {
        const eventType = String(typeRaw).toLowerCase();
        if (
          !eventType.includes("commit") &&
          !eventType.includes("redeem") &&
          !eventType.includes("earn")
        ) {
          return;
        }
      }
      refreshHistory();
    },
    [merchantId, customerId, refreshHistory],
  );

  useEffect(() => {
    if (!merchantId || !customerId) return;
    const unsubscribe = subscribeToLoyaltyEvents(handleExternalEvent);
    return () => {
      unsubscribe();
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
      loadPromotions();
    }
  }, [customerId, syncConsent, loadBalance, loadTx, loadLevels, loadPromotions]);

  const handlePromotionClaim = useCallback(
    async (promotionId: string) => {
      if (!merchantId || !customerId) {
        setToast({ msg: "Не удалось определить клиента", type: "error" });
        return;
      }
      try {
        setPromotionsLoading(true);
        const resp = await promotionClaim(merchantId, customerId, promotionId, null);
        const message = resp.alreadyClaimed
          ? "Уже получено"
          : resp.pointsIssued > 0
            ? `Начислено ${resp.pointsIssued} баллов`
            : "Получено";
        setToast({ msg: message, type: "success" });
        await Promise.allSettled([loadBalance(), loadTx(), loadPromotions()]);
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: "error" });
      } finally {
        setPromotionsLoading(false);
      }
    },
    [merchantId, customerId, loadBalance, loadTx, loadPromotions]
  );

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
        // Сохраняем на сервер (кросс-девайс) и локально — пер-мерчантный ключ
        if (merchantId && customerId) {
          await profileSave(merchantId, customerId, {
            name: profileForm.name.trim(),
            gender: profileForm.gender as 'male' | 'female',
            birthDate: profileForm.birthDate,
          });
        }
        const key = `miniapp.profile.v2:${merchantId}`;
        localStorage.setItem(key, JSON.stringify(profileForm));
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

  // Прогресс-бар показываем только на странице /qr, не здесь

  const availablePromotions = useMemo(
    () => promotions.filter((p) => p && p.canClaim && !p.claimed).length,
    [promotions]
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
            <Link href="/qr" className={styles.qrMini} aria-label="Открыть QR" prefetch={false}>
              <div className={styles.qrWrapper}>
                <FakeQr />
              </div>
              <span className={styles.qrHint}>Нажмите</span>
            </Link>
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
            <button type="button" className={styles.promotionsButton} onClick={() => { setPromotionsOpen(true); if (!promotions.length) void loadPromotions(); }}>
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
                  const meta = getTransactionMeta(item.type);
                  const typeUpper = String(item.type).toUpperCase();
                  const isPending = Boolean(item.pending) && (typeUpper === 'EARN' || typeUpper === 'REGISTRATION');
                  const title = isPending
                    ? (typeUpper === 'REGISTRATION' ? 'Бонус за регистрацию - на удержании' : 'Начисление на удержании')
                    : meta.title;
                  const note = isPending
                    ? (() => {
                        const days = typeof item.daysUntilMature === 'number' ? item.daysUntilMature : (item.maturesAt ? Math.max(0, Math.ceil((Date.parse(item.maturesAt) - Date.now()) / (24*60*60*1000))) : null);
                        if (days === 0) return 'Баллы будут начислены сегодня';
                        if (days === 1) return 'Баллы будут начислены завтра';
                        return days != null ? `Баллы будут начислены через ${days} дней` : 'Баллы будут начислены позже';
                      })()
                    : null;
                  return (
                    <li
                      key={item.id}
                      className={`${styles.historyItem} ${isPending ? styles.historyTone_pending : styles[`historyTone_${meta.kind}`]}`}
                      style={{ animationDelay: `${0.05 * idx}s` }}
                    >
                      <div className={`${styles.historyIcon} ${isPending ? styles.historyIcon_pending : styles[`historyIcon_${meta.kind}`]}`}>
                        {isPending ? TIME_ICON : HISTORY_ICONS[meta.kind]}
                      </div>
                      <div className={styles.historyBody}>
                        <div className={styles.historyTitle}>{title}</div>
                        {note && <div className={styles.historyNote}>{note}</div>}
                        <div className={styles.historyDate}>
                          {new Date(item.createdAt).toLocaleString('ru-RU')}
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

      {promotionsOpen && (
        <div className={styles.modalBackdrop} onClick={() => setPromotionsOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>Акции</div>
            {promotionsLoading ? (
              <div className={styles.emptyState}>Загрузка…</div>
            ) : promotions.length === 0 ? (
              <div className={styles.emptyState}>Доступных акций нет</div>
            ) : (
              <ul className={styles.historyList}>
                {promotions.map((p) => (
                  <li key={p.id} className={styles.historyItem}>
                    <div className={styles.historyBody}>
                      <div className={styles.historyTitle}>{p.name}</div>
                      <div className={styles.historyDate}>
                        {typeof p.rewardValue === 'number' && p.rewardType === 'POINTS' ? `+${p.rewardValue} баллов` : ''}
                      </div>
                    </div>
                    <div>
                      <button
                        className={styles.promoButton}
                        disabled={!p.canClaim || p.claimed || promotionsLoading}
                        onClick={() => handlePromotionClaim(p.id)}
                      >
                        {p.claimed ? 'Получено' : p.canClaim ? 'Получить' : 'Недоступно'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={styles.sheetButton} onClick={() => setPromotionsOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>Настройки</div>
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
            <button
              className={styles.sheetButton}
              onClick={() => {
                setSettingsOpen(false);
                router.push("/qr");
              }}
            >
              Открыть страницу QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
