"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  reviewSettingsPublic,
  submitReview,
} from "../lib/api";
import type { ReviewPublicSettings } from "../lib/api";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { useMiniappAuth } from "../lib/useMiniapp";
import styles from "./page.module.css";
import { ReviewPrompt } from "../components/ReviewPrompt";

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
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink?: (url: string) => void;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
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

function openExternalLink(url: string) {
  if (!url) return;
  try {
    const tg = getTelegramWebApp();
    if (tg?.openLink) {
      tg.openLink(url, { try_instant_view: false });
      return;
    }
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  }
}

const SHARE_BUTTON_STYLE: Record<string, { background: string; color: string }> = {
  twoGis: { background: 'linear-gradient(135deg,#34d399,#059669)', color: '#ffffff' },
  yandex: { background: '#FACC15', color: '#1f2937' },
  google: { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#ffffff' },
};

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

function formatAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

function isReviewEligibleTransaction(tx: TransactionItem): boolean {
  const type = (tx.type || '').toLowerCase();
  return type.includes('earn') || type.includes('redeem');
}

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
  const [reviewPromptVisible, setReviewPromptVisible] = useState<boolean>(false);
  const [reviewTarget, setReviewTarget] = useState<{ transactionId?: string; orderId?: string | null } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [lastReviewRating, setLastReviewRating] = useState<number>(0);
  const [sharePromptVisible, setSharePromptVisible] = useState<boolean>(false);
  const [reviewSettings, setReviewSettings] = useState<ReviewPublicSettings | null>(null);
  const reviewHandledRef = useRef<Set<string>>(new Set());
  const latestTxRef = useRef<string | null>(null);
  const initialTxLoadedRef = useRef<boolean>(false);

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
    try {
      const raw = localStorage.getItem('miniapp.review.handled');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          reviewHandledRef.current = new Set(parsed.map((value: unknown) => String(value)));
        }
      }
    } catch {
      reviewHandledRef.current = new Set();
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

  useEffect(() => {
    if (!merchantId) {
      setReviewSettings(null);
      return;
    }
    let cancelled = false;
    reviewSettingsPublic(merchantId)
      .then((settings) => {
        if (!cancelled) setReviewSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setReviewSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

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

  const makeReviewKey = useCallback((target: { transactionId?: string; orderId?: string | null } | null) => {
    if (!target) return '';
    if (target.transactionId) return `tx:${target.transactionId}`;
    if (target.orderId) return `order:${target.orderId}`;
    return '';
  }, []);

  const markReviewHandled = useCallback((target: { transactionId?: string; orderId?: string | null } | null) => {
    const key = makeReviewKey(target);
    if (!key) return;
    reviewHandledRef.current.add(key);
    try {
      localStorage.setItem('miniapp.review.handled', JSON.stringify(Array.from(reviewHandledRef.current)));
    } catch {
      // ignore persistence errors
    }
  }, [makeReviewKey]);

  const shareLinks = useMemo(() => {
    if (!reviewSettings?.shareEnabled) return [] as Array<{ key: string; label: string; url: string }>;
    const items: Array<{ key: string; label: string; url: string }> = [];
    const mapping: Array<{ key: 'twoGis' | 'yandex' | 'google'; label: string }> = [
      { key: 'twoGis', label: '2ГИС' },
      { key: 'yandex', label: 'Яндекс Карты' },
      { key: 'google', label: 'Google' },
    ];
    for (const entry of mapping) {
      const platform = reviewSettings.sharePlatforms?.[entry.key];
      if (platform?.enabled && platform.url) {
        items.push({ key: entry.key, label: entry.label, url: platform.url });
      }
    }
    return items;
  }, [reviewSettings]);

  const handleReviewClose = useCallback(() => {
    markReviewHandled(reviewTarget);
    setReviewPromptVisible(false);
    setReviewTarget(null);
  }, [reviewTarget, markReviewHandled]);

  const handleReviewSubmit = useCallback(async (value: number, text: string) => {
    if (!merchantId || !customerId || !reviewTarget) return;
    setReviewSubmitting(true);
    try {
      await submitReview({
        merchantId,
        customerId,
        rating: value,
        comment: text,
        transactionId: reviewTarget.transactionId,
        orderId: reviewTarget.orderId ?? undefined,
      });
      setToast({ msg: 'Спасибо за отзыв!', type: 'success' });
      markReviewHandled(reviewTarget);
      setReviewPromptVisible(false);
      setReviewTarget(null);
      setLastReviewRating(value);
      if (reviewSettings?.shareEnabled && value >= (reviewSettings.shareThreshold ?? 5) && shareLinks.length > 0) {
        setSharePromptVisible(true);
      } else {
        setSharePromptVisible(false);
      }
    } catch (error) {
      const message = resolveErrorMessage(error);
      setToast({ msg: message || 'Не удалось отправить отзыв', type: 'error' });
    } finally {
      setReviewSubmitting(false);
    }
  }, [merchantId, customerId, reviewTarget, reviewSettings, shareLinks, markReviewHandled]);

  const handleShareClose = useCallback(() => {
    setSharePromptVisible(false);
  }, []);

  const doMint = useCallback(async () => {
    if (!customerId) {
      setStatus("Сначала авторизуйтесь");
      return;
    }
    try {
      const r = await mintQr(customerId, merchantId, ttl);
      setQrToken(r.token);
      setStatus(`QR обновлён (TTL ${r.ttl}с)`);
      setToast({ msg: "QR сгенерирован", type: "success" });
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка генерации QR: ${message}`);
      setToast({ msg: "Не удалось обновить QR", type: "error" });
    }
  }, [customerId, merchantId, ttl]);

  const loadBalance = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => balance(merchantId, customerId));
      setBal(r.balance);
      setStatus("Баланс обновлён");
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка баланса: ${message}`);
      setToast({ msg: "Не удалось обновить баланс", type: "error" });
    }
  }, [customerId, merchantId, retry]);

  const loadTx = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => transactions(merchantId, customerId, 20));
      setTx(
        r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt }))
      );
      setNextBefore(r.nextBefore || null);
      setStatus("История обновлена");
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка истории: ${message}`);
      setToast({ msg: "Не удалось обновить историю", type: "error" });
    }
  }, [customerId, merchantId, retry]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx((prev) => [
        ...prev,
        ...r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt })),
      ]);
      setNextBefore(r.nextBefore || null);
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка подгрузки: ${message}`);
    }
  }, [merchantId, customerId, nextBefore]);

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
    if (!merchantId || !customerId) return;
    if (!tx.length) return;
    const newest = tx[0];
    if (!newest?.id) return;

    if (!initialTxLoadedRef.current) {
      initialTxLoadedRef.current = true;
      latestTxRef.current = newest.id;
      return;
    }

    if (latestTxRef.current === newest.id) return;
    latestTxRef.current = newest.id;

    const key = makeReviewKey({ transactionId: newest.id, orderId: newest.orderId ?? null });
    if (key && reviewHandledRef.current.has(key)) return;
    if (!isReviewEligibleTransaction(newest)) return;

    setReviewTarget({ transactionId: newest.id, orderId: newest.orderId ?? null });
    setReviewPromptVisible(true);
  }, [tx, merchantId, customerId, makeReviewKey]);

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
            <div className={styles.promoInputBlock}>
              <input className={styles.promoInput} placeholder="Введите промокод" />
              <button className={styles.promoButton}>Активировать</button>
            </div>
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

      <ReviewPrompt
        visible={reviewPromptVisible}
        onClose={handleReviewClose}
        onSubmit={handleReviewSubmit}
        loading={reviewSubmitting}
      />

      {sharePromptVisible && shareLinks.length > 0 && (
        <div
          onClick={handleShareClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(23,24,43,0.45)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 16px 24px',
            zIndex: 85,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#ffffff',
              borderRadius: '22px 22px 0 0',
              padding: '26px 22px 28px',
              boxShadow: '0 -18px 40px rgba(42,47,89,0.18)',
              display: 'grid',
              gap: 18,
              position: 'relative',
            }}
          >
            <button
              onClick={handleShareClose}
              style={{
                position: 'absolute',
                top: 12,
                right: 18,
                border: 'none',
                background: 'transparent',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 20,
              }}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Мы рады, что вам понравилось!</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Пожалуйста, поделитесь своим отзывом в любимом сервисе.
              </div>
              {lastReviewRating > 0 && (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Ваша оценка: {lastReviewRating} ⭐</div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {shareLinks.map((link) => {
                const palette = SHARE_BUTTON_STYLE[link.key] || {
                  background: '#1f2937',
                  color: '#ffffff',
                };
                return (
                  <button
                    key={link.key}
                    onClick={() => {
                      openExternalLink(link.url);
                      handleShareClose();
                    }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: 'none',
                      background: palette.background,
                      color: palette.color,
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: 'pointer',
                    }}
                  >
                    {link.label}
                  </button>
                );
              })}
            </div>
          </div>
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
            <button className={styles.sheetButton} onClick={loadBalance}>
              Обновить баланс
            </button>
            <button className={styles.sheetButton} onClick={loadTx}>
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
