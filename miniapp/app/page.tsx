"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import FakeQr from "../components/FakeQr";
import QrCanvas from "../components/QrCanvas";
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
import Toast from "../components/Toast";
import { useMiniappAuthContext } from "../lib/MiniappAuthContext";
import { isValidInitData, waitForInitData } from "../lib/useMiniapp";
import { useDelayedRender } from "../lib/useDelayedRender";
import { getProgressPercent, type LevelInfo } from "../lib/levels";
import { getTransactionMeta, type TransactionKind } from "../lib/transactionMeta";
import { subscribeToLoyaltyEvents } from "../lib/loyaltyEvents";
import { type TransactionItem } from "../lib/reviewUtils";
import { getTelegramWebApp } from "../lib/telegram";
import {
  applySnapshotPatch,
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
  type MiniappSnapshot,
  type SnapshotPatch,
} from "../lib/snapshot";
import styles from "./page.module.css";
import qrStyles from "./qr/page.module.css";

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

const PHONE_NOT_LINKED_MESSAGE = "Вы не привязали номер, попробуйте еще раз";

const REFUND_REFERENCE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const REFERRAL_MESSAGE_FALLBACK =
  "Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или пригласительным кодом {code}.";
const REFERRAL_SHARE_FALLBACK =
  "Переходите по ссылке {link} и получите {bonusamount} бонусов на баланс в программе лояльности {businessname}.";
const REFERRAL_PLACEHOLDER_REGEX = /\{businessname\}|\{bonusamount\}|\{code\}|\{link\}/gi;
const TELEGRAM_SHARE_URL = "https://t.me/share/url";

type MechanicsLevel = {
  id?: string;
  name?: string;
  threshold?: number;
  cashbackPercent?: number | null;
  benefits?: { cashbackPercent?: number | null; [key: string]: unknown } | null;
  rewardPercent?: number | null;
};

type ReferralTemplateContext = {
  merchantName: string;
  bonusAmount: number;
  code: string;
  link: string;
};

const genderOptions: Array<{ value: "male" | "female"; label: string }> = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

const profileStorageKey = (merchantId: string) => `miniapp.profile.v2:${merchantId}`;
const profilePendingKey = (merchantId: string) => `miniapp.profile.pending.v1:${merchantId}`;
const localCustomerKey = (merchantId: string) => `miniapp.customerId.v1:${merchantId}`;
const legacyLocalCustomerKey = (merchantId: string) => `miniapp.merchantCustomerId.v1:${merchantId}`;
const onboardKey = (merchantId: string) => `miniapp.onboarded.v1:${merchantId}`;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
      window.setTimeout(resolve, ms);
      return;
    }
    setTimeout(resolve, ms);
  });

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
    if (token === "{businessname}") {
      return ctx.merchantName || "";
    }
    if (token === "{bonusamount}") {
      return ctx.bonusAmount > 0 && Number.isFinite(ctx.bonusAmount) ? String(Math.round(ctx.bonusAmount)) : "";
    }
    if (token === "{code}") {
      return ctx.code || "";
    }
    if (token === "{link}") {
      return ctx.link || "";
    }
    return "";
  });
};

const buildTelegramShareUrl = (text: string): string => {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  const query = params.toString();
  return query ? `${TELEGRAM_SHARE_URL}?${query}` : TELEGRAM_SHARE_URL;
};

function readStoredCustomerId(merchantId?: string | null): string | null {
  if (!merchantId || typeof window === "undefined") return null;
  try {
    const stored =
      localStorage.getItem(localCustomerKey(merchantId)) ||
      localStorage.getItem(legacyLocalCustomerKey(merchantId));
    if (stored && stored !== "undefined" && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // ignore storage issues
  }
  return null;
}

function readStoredProfile(merchantId?: string | null): {
  form: { name: string; gender: "male" | "female" | ""; birthDate: string };
  completed: boolean;
} {
  const fallback = { name: "", gender: "", birthDate: "" } as const;
  if (typeof window === "undefined" || !merchantId) {
    return { form: { ...fallback }, completed: false };
  }
  try {
    const saved = localStorage.getItem(profileStorageKey(merchantId));
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

function readStoredOnboardFlag(merchantId?: string | null): boolean {
  if (!merchantId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(onboardKey(merchantId)) === "1";
  } catch {
    return false;
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
  complimentary: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 2.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0v.006c0 .07 0 .27-.038.494H15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 14.5V7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2.038A2.968 2.968 0 0 1 3 2.506V2.5zm1.068.5H7v-.5a1.5 1.5 0 1 0-3 0c0 .085.002.274.045.43a.522.522 0 0 0 .023.07zM9 3h2.932a.56.56 0 0 0 .023-.07c.043-.156.045-.345.045-.43a1.5 1.5 0 0 0-3 0V3zM1 4v2h6V4H1zm8 0v2h6V4H9zm5 3H9v8h4.5a.5.5 0 0 0 .5-.5V7zm-7 8V7H2v7.5a.5.5 0 0 0 .5.5H7z" />
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15 6C15 6.55228 14.5523 7 14 7C13.4477 7 13 6.55228 13 6L3 6L3 7.99947C4.24101 8.93039 5 10.3995 5 12C5 13.6005 4.24101 15.0696 3 16.0005L3 18L13 18C13 17.4477 13.4477 17 14 17C14.5523 17 15 17.4477 15 18L21 18L21 16.0005C19.759 15.0696 19 13.6005 19 12C19 10.3995 19.759 8.93039 21 7.99947L21 6L15 6ZM23 18C23 19.1046 22.1046 20 21 20L3 20C1.89543 20 1 19.1046 1 18L1 14.8881L1.49927 14.5993C2.42113 14.066 3 13.084 3 12C3 10.916 2.42113 9.934 1.49927 9.40073L1 9.11192L1 6C1 4.89543 1.89543 4 3 4L21 4C22.1046 4 23 4.89543 23 6L23 9.11192L22.5007 9.40073C21.5789 9.934 21 10.916 21 12C21 13.084 21.5789 14.066 22.5007 14.5993L23 14.8881L23 18ZM14 16C13.4477 16 13 15.5523 13 15C13 14.4477 13.4477 14 14 14C14.5523 14 15 14.4477 15 15C15 15.5523 14.5523 16 14 16ZM14 13C13.4477 13 13 12.5523 13 12C13 11.4477 13.4477 11 14 11C14.5523 11 15 11.4477 15 12C15 12.5523 14.5523 13 14 13ZM14 10C13.4477 10 13 9.55228 13 9C13 8.44772 13.4477 8 14 8C14.5523 8 15 8.44772 15 9C15 9.55228 14.5523 10 14 10Z"
      />
    </svg>
  ),
  refund: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083L3 16M3 12C3 7.02944 7.02944 3 12 3C14.3051 3 16.4077 3.86656 18 5.29168L21 8M3 21V16M3 16H8M21 3V8M21 8H16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  adjust: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 10H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 6L10 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  referral: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 16C4.8 13 7 12 10 12C13 12 15.2 13 15.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  burn: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.122 17.645a7.185 7.185 0 0 1-2.656 2.495 7.06 7.06 0 0 1-3.52.853 6.617 6.617 0 0 1-3.306-.718 6.73 6.73 0 0 1-2.54-2.266c-2.672-4.57.287-8.846.887-9.668A4.448 4.448 0 0 0 8.07 6.31 4.49 4.49 0 0 0 7.997 4c1.284.965 6.43 3.258 5.525 10.631 1.496-1.136 2.7-3.046 2.846-6.216 1.43 1.061 3.985 5.462 1.754 9.23Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function MiniappPage() {
  const auth = useMiniappAuthContext();
  const merchantId = auth.merchantId;
  const setMerchantId = auth.setMerchantId;
  const setAuthCustomerId = auth.setCustomerId;
  const teleOnboarded = auth.teleOnboarded;
  const setAuthTeleOnboarded = auth.setTeleOnboarded;
  const teleHasPhone = auth.teleHasPhone;
  const setAuthTeleHasPhone = auth.setTeleHasPhone;
  const initData = auth.initData;
  const authThemeTtl = auth.theme?.ttl;
  const storedProfile = useMemo(() => readStoredProfile(merchantId), [merchantId]);
  const storedCustomerId = useMemo(
    () => readStoredCustomerId(merchantId),
    [merchantId],
  );
  const [customerId, setCustomerId] = useState<string | null>(() => storedCustomerId);
  const initialSnapshot = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!merchantId || !storedCustomerId) return null;
    return loadSnapshot(merchantId, storedCustomerId);
  }, [merchantId, storedCustomerId]);
  const [bal, setBal] = useState<number | null>(() => initialSnapshot?.balance ?? null);
  const [balanceResolved, setBalanceResolved] = useState<boolean>(() => typeof initialSnapshot?.balance === "number");
  const [tx, setTx] = useState<TransactionItem[]>(() => initialSnapshot?.transactions ?? []);
  const [transactionsResolved, setTransactionsResolved] = useState<boolean>(() =>
    Boolean(initialSnapshot?.transactions && initialSnapshot.transactions.length > 0),
  );
  const [nextBefore, setNextBefore] = useState<string | null>(() => initialSnapshot?.nextBefore ?? null);
  const [consent, setConsent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(() => initialSnapshot?.levelInfo ?? null);
  const [levelsResolved, setLevelsResolved] = useState<boolean>(() => Boolean(initialSnapshot?.levelInfo));
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>([]);
  const [cashbackPercent, setCashbackPercent] = useState<number | null>(
    () => initialSnapshot?.cashbackPercent ?? null,
  );
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(() => {
    const tg = getTelegramUser();
    if (tg) return tg;
    return initialSnapshot?.telegramProfile ?? null;
  });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [needPhoneStep, setNeedPhoneStep] = useState<boolean>(false);
  const [pendingCustomerIdForPhone, setPendingCustomerIdForPhone] = useState<string | null>(null);
  const [phoneShareStage, setPhoneShareStage] = useState<"idle" | "waiting" | "saving">("idle");
  const [phoneShareError, setPhoneShareError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<{
    name: string;
    gender: "male" | "female" | "";
    birthDate: string;
  }>(() => storedProfile.form);
  const [, setProfileCompleted] = useState<boolean>(() => storedProfile.completed);
  const [localOnboarded, setLocalOnboarded] = useState<boolean>(() => readStoredOnboardFlag(merchantId));
  const [profileTouched, setProfileTouched] = useState<boolean>(false);
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const pendingProfileSync = useRef<boolean>(false);
  const profilePrefetchedRef = useRef<boolean>(false);
  const snapshotRef = useRef<MiniappSnapshot | null>(initialSnapshot);
  const levelCatalogRef = useRef<MechanicsLevel[]>([]);
  const levelInfoRef = useRef<LevelInfo | null>(initialSnapshot?.levelInfo ?? null);
  const [birthYear, setBirthYear] = useState<string>("");
  const [birthMonth, setBirthMonth] = useState<string>("");
  const [birthDay, setBirthDay] = useState<string>("");
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const years = useMemo(() => {
    const ylist: string[] = [];
    for (let y = currentYear; y >= 1900; y--) ylist.push(String(y));
    return ylist;
  }, [currentYear]);
  const months = useMemo(
    () => [
      { value: "01", label: "Январь" },
      { value: "02", label: "Февраль" },
      { value: "03", label: "Март" },
      { value: "04", label: "Апрель" },
      { value: "05", label: "Май" },
      { value: "06", label: "Июнь" },
      { value: "07", label: "Июль" },
      { value: "08", label: "Август" },
      { value: "09", label: "Сентябрь" },
      { value: "10", label: "Октябрь" },
      { value: "11", label: "Ноябрь" },
      { value: "12", label: "Декабрь" },
    ],
    [],
  );
  const daysInSelectedMonth = useMemo(() => {
    if (!birthYear || !birthMonth) return 31;
    const y = Number(birthYear);
    const m = Number(birthMonth);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31;
    return new Date(y, m, 0).getDate();
  }, [birthYear, birthMonth]);
  const days = useMemo(
    () => Array.from({ length: daysInSelectedMonth }, (_, i) => String(i + 1).padStart(2, "0")),
    [daysInSelectedMonth],
  );

  useEffect(() => {
    setLocalOnboarded(readStoredOnboardFlag(merchantId));
  }, [merchantId]);

  useEffect(() => {
    levelCatalogRef.current = levelCatalog;
  }, [levelCatalog]);

  useEffect(() => {
    levelInfoRef.current = levelInfo;
  }, [levelInfo]);

  const applyServerProfile = useCallback(
    (profile: CustomerProfile | null) => {
      const name = profile?.name || "";
      const gender = profile?.gender === "male" || profile?.gender === "female" ? profile.gender : "";
      const birthDate = typeof profile?.birthDate === "string" ? profile.birthDate : "";
      setProfileForm({ name, gender, birthDate });
      const valid = Boolean(name && gender && birthDate);
      setProfileCompleted(valid);
      if (merchantId) {
        const key = profileStorageKey(merchantId);
        const pendingKey = profilePendingKey(merchantId);
        try {
          localStorage.setItem(key, JSON.stringify({ name, gender, birthDate }));
        } catch {}
        try {
          localStorage.removeItem(pendingKey);
        } catch {}
      }
    },
    [merchantId],
  );

  const applyProfileSaveResult = useCallback(
    (profile: CustomerProfile | null, fallbackCustomerId: string) => {
      const nextIdRaw =
        typeof profile?.customerId === "string" && profile.customerId.trim()
          ? profile.customerId.trim()
          : fallbackCustomerId;
      if (!nextIdRaw) return fallbackCustomerId;
      setCustomerId(nextIdRaw);
      setAuthCustomerId(nextIdRaw);
      if (merchantId) {
        try {
          localStorage.setItem(localCustomerKey(merchantId), nextIdRaw);
          localStorage.removeItem(legacyLocalCustomerKey(merchantId));
        } catch {}
        if (fallbackCustomerId && nextIdRaw !== fallbackCustomerId) {
          clearSnapshot(merchantId, fallbackCustomerId);
        }
      }
      return nextIdRaw;
    },
    [merchantId, setAuthCustomerId, setCustomerId],
  );

  const applyBirthDate = useCallback(
    (y: string, m: string, d: string) => {
      if (y && m && d) {
        const maxD = new Date(Number(y), Number(m), 0).getDate();
        const ddNum = Math.min(Number(d), maxD);
        const dd = String(ddNum).padStart(2, "0");
        setBirthDay(dd);
        setProfileForm((prev) => ({ ...prev, birthDate: `${y}-${m}-${dd}` }));
      } else {
        setProfileForm((prev) => ({ ...prev, birthDate: "" }));
      }
    },
    [setProfileForm],
  );
  const [referralInfo, setReferralInfo] = useState<{
    code: string;
    link: string;
    messageTemplate: string;
    placeholders: string[];
    merchantName: string;
    friendReward: number;
    inviterReward: number;
    shareMessageTemplate?: string;
  } | null>(() => initialSnapshot?.referral?.info ?? null);
  const [referralEnabled, setReferralEnabled] = useState<boolean>(() =>
    Boolean(initialSnapshot?.referral?.enabled && initialSnapshot.referral?.info),
  );
  const [referralLoading, setReferralLoading] = useState<boolean>(false);
  const [referralResolved, setReferralResolved] = useState<boolean>(() => Boolean(initialSnapshot?.referral?.info));
  const [referralReloadTick, setReferralReloadTick] = useState<number>(0);
  const [inviteCode, setInviteCode] = useState<string>(() => initialSnapshot?.referral?.inviteCode ?? "");
  const [inviteApplied, setInviteApplied] = useState<boolean>(() => Boolean(initialSnapshot?.referral?.inviteApplied));
  const [promoCode, setPromoCode] = useState<string>("");
  const [promoLoading, setPromoLoading] = useState<boolean>(false);
  const [promotionsOpen, setPromotionsOpen] = useState<boolean>(false);
  const [promotions, setPromotions] = useState<PromotionItem[]>(() => initialSnapshot?.promotions ?? []);
  const [promotionsLoading, setPromotionsLoading] = useState<boolean>(false);
  const [promotionsResolved, setPromotionsResolved] = useState<boolean>(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState<boolean>(false);
  // QR modal state
  const [qrOpen, setQrOpen] = useState<boolean>(false);
  const [qrToken, setQrToken] = useState<string>("");
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState<number | null>(null);
  const [qrRefreshing, setQrRefreshing] = useState<boolean>(false);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>("");
  const [qrSize, setQrSize] = useState<number>(240);
  const inviteSheetPresence = useDelayedRender(inviteSheetOpen, 280);
  const promotionsSheetPresence = useDelayedRender(promotionsOpen, 280);
  const settingsSheetPresence = useDelayedRender(settingsOpen, 280);
  const persistSnapshot = useCallback(
    (patch: SnapshotPatch) => {
      if (!merchantId || !customerId) return;
      const next = applySnapshotPatch(snapshotRef.current, patch, merchantId, customerId);
      snapshotRef.current = next;
      saveSnapshot(next);
    },
    [merchantId, customerId],
  );
  const updateCashbackPercent = useCallback(
    (info: LevelInfo | null, catalog: MechanicsLevel[]) => {
      const value = pickCashbackPercent(info, catalog);
      if (typeof value === "number") {
        setCashbackPercent(value);
        persistSnapshot({ cashbackPercent: value });
      } else if (!info) {
        setCashbackPercent(null);
      }
    },
    [persistSnapshot],
  );
  const resetSnapshotState = useCallback(() => {
    snapshotRef.current = null;
    setBal(null);
    setBalanceResolved(false);
    setLevelInfo(null);
    setLevelsResolved(false);
    setCashbackPercent(null);
    setTx([]);
    setTransactionsResolved(false);
    setNextBefore(null);
    setPromotions([]);
    setPromotionsResolved(false);
    setReferralInfo(null);
    setReferralEnabled(false);
    setReferralResolved(false);
    setInviteCode("");
    setInviteApplied(false);
  }, []);

  const hydrateSnapshot = useCallback((snapshot: MiniappSnapshot) => {
    setBal(typeof snapshot.balance === "number" ? snapshot.balance : null);
    setBalanceResolved(typeof snapshot.balance === "number");
    setLevelInfo(snapshot.levelInfo ?? null);
    setLevelsResolved(Boolean(snapshot.levelInfo));
    setCashbackPercent(
      typeof snapshot.cashbackPercent === "number" ? snapshot.cashbackPercent : null,
    );
    const txList = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    setTx(txList);
    setTransactionsResolved(txList.length > 0);
    setNextBefore(snapshot.nextBefore ?? null);
    const promos = Array.isArray(snapshot.promotions) ? snapshot.promotions : [];
    setPromotions(promos);
    if (snapshot.referral) {
      const enabled = Boolean(snapshot.referral.enabled && snapshot.referral.info);
      setReferralEnabled(enabled);
      setReferralInfo(snapshot.referral.info ?? null);
      if (typeof snapshot.referral.inviteCode === "string") {
        setInviteCode(snapshot.referral.inviteCode);
      }
      setInviteApplied(Boolean(snapshot.referral.inviteApplied));
      setReferralResolved(Boolean(snapshot.referral.info));
    } else {
      setReferralEnabled(false);
      setReferralInfo(null);
      setReferralResolved(false);
    }
    if (snapshot.telegramProfile) {
      setTelegramUser(snapshot.telegramProfile);
    }
    setPromotionsLoading(false);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const tgUser = getTelegramUser();
    if (tgUser) {
      setTelegramUser(tgUser);
    }
    const tg = getTelegramWebApp();
    try {
      if (tg?.ready) tg.ready();
      if (tg?.expand) tg.expand();
    } catch {
      // ignore telegram errors
    }
    try {
      const key = merchantId ? profileStorageKey(merchantId) : null;
      const savedProfile = key ? localStorage.getItem(key) : null;
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as { name?: string; gender?: "male" | "female"; birthDate?: string };
        const name = parsed.name || "";
        const gender = parsed.gender || "";
        const birthDate = parsed.birthDate || "";
        setProfileForm({ name, gender, birthDate });
      }
    } catch {
      // ignore
    }
  }, [merchantId]);
  useIsomorphicLayoutEffect(() => {
    if (!merchantId) {
      resetSnapshotState();
      return;
    }
    const effectiveCustomerId = customerId || storedCustomerId;
    if (!effectiveCustomerId) {
      resetSnapshotState();
      return;
    }
    const snapshot = loadSnapshot(merchantId, effectiveCustomerId);
    if (!snapshot) {
      if (!snapshotRef.current) {
        resetSnapshotState();
      }
      return;
    }
    const prevTs = snapshotRef.current?.cachedAt;
    snapshotRef.current = snapshot;
    if (!prevTs || snapshot.cachedAt !== prevTs) {
      hydrateSnapshot(snapshot);
    }
  }, [merchantId, customerId, storedCustomerId, hydrateSnapshot, resetSnapshotState]);
  useEffect(() => {
    if (!merchantId || !customerId) return;
    if (!telegramUser) return;
    persistSnapshot({ telegramProfile: telegramUser });
  }, [merchantId, customerId, telegramUser, persistSnapshot]);

  useEffect(() => {
    if (teleOnboarded === null) return;
    setProfileCompleted(teleOnboarded);
    if (!merchantId) return;
    if (teleOnboarded) {
      try {
        localStorage.setItem(onboardKey(merchantId), "1");
      } catch {}
      setLocalOnboarded(true);
    } else {
      setLocalOnboarded(false);
      try {
        localStorage.removeItem(onboardKey(merchantId));
      } catch {}
    }
  }, [teleOnboarded, merchantId]);

  useIsomorphicLayoutEffect(() => {
    if (customerId || !storedCustomerId) return;
    setCustomerId(storedCustomerId);
  }, [customerId, storedCustomerId]);

  useEffect(() => {
    setPromotionsResolved(false);
  }, [customerId]);

  // Синхронизация локальных селектов даты с profileForm.birthDate
  useEffect(() => {
    const b = profileForm.birthDate;
    if (b && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
      const [y, m, d] = b.split("-");
      setBirthYear(y);
      setBirthMonth(m);
      setBirthDay(d);
    } else {
      setBirthYear("");
      setBirthMonth("");
      setBirthDay("");
    }
  }, [profileForm.birthDate]);
  useEffect(() => {
    if (!merchantId || !customerId) return;
    persistSnapshot({ referral: { inviteCode, inviteApplied } });
  }, [merchantId, customerId, inviteCode, inviteApplied, persistSnapshot]);

  useEffect(() => {
    if (!customerId) return;
    updateCashbackPercent(levelInfo, levelCatalog);
  }, [customerId, levelInfo, levelCatalog, updateCashbackPercent]);

  useEffect(() => {
    if (localOnboarded && teleOnboarded === false) {
      setAuthTeleOnboarded(true);
    }
  }, [localOnboarded, teleOnboarded, setAuthTeleOnboarded]);

  // Автоподстановка пригласительного кода из Telegram start_param/startapp (payload.referralCode)
  useEffect(() => {
    try {
      if (!initData) return;
      if (inviteCode) return; // не перетирать вручную введённый
      const u = new URLSearchParams(initData);
      const sp = u.get('start_param') || u.get('startapp');
      if (!sp) return;
      // direct link format: ref_<CODE>
      const refMatch = /^ref[_-](.+)$/i.exec(sp.trim());
      if (refMatch && refMatch[1] && !inviteApplied) {
        setInviteCode(refMatch[1]);
        return;
      }
      const parts = sp.split('.');
      const looksLikeJwt = parts.length === 3 && parts.every((x) => x && /^[A-Za-z0-9_-]+$/.test(x));
      if (looksLikeJwt) {
        try {
          const payload = parts[1];
          const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
          let jsonStr = '';
          try {
            const bin = (typeof atob === 'function') ? atob(b64) : '';
            if (bin) {
              try {
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                jsonStr = new TextDecoder().decode(bytes);
              } catch {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                jsonStr = decodeURIComponent(escape(bin));
              }
            }
          } catch {}
          if (jsonStr) {
            const obj = JSON.parse(jsonStr);
            const code = typeof obj?.referralCode === 'string' ? obj.referralCode : '';
            if (code && !inviteApplied) setInviteCode(code);
          }
        } catch {}
      } else {
        // legacy: код может быть напрямую в start_param
        if (/^[A-Z0-9]{5,}$/i.test(sp) && !inviteApplied) setInviteCode(sp);
      }
    } catch {
      // ignore
    }
  }, [initData, inviteCode, inviteApplied]);

  // Подтянуть профиль с сервера (кросс-девайс) при наличии авторизации
  useEffect(() => {
    if (!merchantId || !customerId) return;
    if (teleOnboarded === false) {
      return;
    }
    if (profilePrefetchedRef.current) {
      profilePrefetchedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await profileGet(merchantId, customerId);
        if (cancelled) return;
        applyServerProfile(p);
      } catch {
        // сервер мог не иметь профиля — оставим локальные данные/валидацию
      }
    })();
    return () => { cancelled = true; };
  }, [merchantId, customerId, teleOnboarded, applyServerProfile]);

  useEffect(() => {
    if (!merchantId || !customerId) return;
    if (teleHasPhone === false) return;
    if (pendingProfileSync.current) return;
    const key = profileStorageKey(merchantId);
    const pendingKey = profilePendingKey(merchantId);
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
      try { localStorage.removeItem(pendingKey); } catch {}
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
        setProfileForm({ name, gender, birthDate });
        setProfileCompleted(true);
        setAuthTeleOnboarded(true);
        setLocalOnboarded(true);
        try {
          localStorage.setItem(onboardKey(merchantId), "1");
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
    teleHasPhone,
    applyProfileSaveResult,
    setToast,
    setAuthTeleOnboarded,
  ]);

  useEffect(() => {
    setLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading && auth.customerId) {
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

  // ===== QR modal logic =====
  const qrEffectiveTtl = useMemo(() => {
    // theme.ttl может прийти из бэкенда публичных настроек; fallback — env
    if (typeof authThemeTtl === "number" && Number.isFinite(authThemeTtl)) return authThemeTtl;
    const fallback = Number(process.env.NEXT_PUBLIC_QR_TTL || "60");
    return Number.isFinite(fallback) ? fallback : 60;
  }, [authThemeTtl]);

  const refreshQr = useCallback(async () => {
    if (!customerId) return;
    try {
      setQrRefreshing(true);
      const minted = await mintQr(customerId, merchantId, qrEffectiveTtl, initData);
      setQrToken(minted.token);
      const ttlSec = typeof minted.ttl === "number" && Number.isFinite(minted.ttl) ? minted.ttl : qrEffectiveTtl;
      setQrExpiresAt(Date.now() + Math.max(5, ttlSec) * 1000);
      setQrError("");
    } catch (err) {
      setQrError(`Не удалось обновить QR: ${resolveErrorMessage(err)}`);
    } finally {
      setQrRefreshing(false);
    }
  }, [customerId, merchantId, qrEffectiveTtl, initData]);

  const updateQrSize = useCallback(() => {
    if (typeof window === "undefined") return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fallback = 240;
    const widthBased = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth * 0.56 : fallback;
    const heightBased = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight * 0.42 : fallback;
    const base = Math.min(fallback, widthBased, heightBased);
    const calculated = Math.round(Math.min(320, Math.max(150, base)));
    setQrSize(Number.isFinite(calculated) && calculated > 0 ? calculated : fallback);
  }, []);

  // Обновление таймера TTL, только когда шторка открыта
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

  // Авто-обновление QR за несколько секунд до истечения TTL
  useEffect(() => {
    if (!qrOpen || !qrExpiresAt) return;
    const msLeft = qrExpiresAt - Date.now();
    if (msLeft <= 4000) return;
    const id = window.setTimeout(() => { void refreshQr(); }, msLeft - 3000);
    return () => window.clearTimeout(id);
  }, [qrOpen, qrExpiresAt, refreshQr]);

  // Обработчик BackButton Telegram для закрытия шторки QR
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg || !tg.BackButton) return;
    const close = () => setQrOpen(false);
    if (qrOpen) {
      try { tg.BackButton.show?.(); } catch {}
      let usedOnEvent = false;
      try {
        if (typeof tg.BackButton.onClick === "function") {
          tg.BackButton.onClick(close);
        } else if (typeof tg.onEvent === "function") {
          tg.onEvent("backButtonClicked", close);
          usedOnEvent = true;
        }
      } catch {}
      return () => {
        try {
          tg.BackButton?.offClick?.(close);
          if (usedOnEvent) tg.offEvent?.("backButtonClicked", close);
          tg.BackButton?.hide?.();
        } catch {}
      };
    }
  }, [qrOpen]);

  // Открытие/закрытие шторки QR: инициализация размера и первичный mint
  useEffect(() => {
    if (!qrOpen) return;
    setQrLoading(true);
    updateQrSize();
    const onResize = () => updateQrSize();
    window.addEventListener("resize", onResize);
    (async () => {
      await refreshQr();
      setQrLoading(false);
    })();
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [qrOpen, refreshQr, updateQrSize]);

  const qrProgressData = useMemo(() => {
    const fallbackPercent = 0;
    const fallback = { percent: fallbackPercent, current: 0, threshold: 0 };
    if (!levelInfo?.next) return fallback;
    const thresholdRaw = levelInfo.next.threshold;
    if (typeof thresholdRaw !== "number" || !Number.isFinite(thresholdRaw) || thresholdRaw <= 0) return fallback;
    const currentRaw = typeof levelInfo.value === "number" && Number.isFinite(levelInfo.value) ? levelInfo.value : 0;
    const threshold = Math.max(0, Math.round(thresholdRaw));
    const current = Math.max(0, Math.round(currentRaw));
    const progressPercent = getProgressPercent(levelInfo);
    const normalizedPercent = Number.isFinite(progressPercent) ? Math.min(100, Math.max(0, Math.round(progressPercent))) : 0;
    if (normalizedPercent <= 0) {
      const recalculated = threshold ? Math.min(100, Math.max(0, Math.round((Math.min(current, threshold) / threshold) * 100))) : 0;
      return { percent: recalculated, current, threshold };
    }
    return { percent: normalizedPercent, current, threshold };
  }, [levelInfo]);

  const qrShowProgress = useMemo(() => Array.isArray(levelCatalog) && levelCatalog.length > 1 && !!levelInfo?.next, [levelCatalog, levelInfo]);
  const qrWrapperSize = useMemo(() => Math.round(qrSize + 20), [qrSize]);

  const loadBalance = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!customerId) {
      return;
    }
    try {
      const r = await retry(() => balance(merchantId, customerId));
      setBal(r.balance);
      setBalanceResolved(true);
      persistSnapshot({ balance: r.balance });
    } catch (error) {
      if (!silent) {
        setToast({ msg: `Не удалось обновить баланс: ${resolveErrorMessage(error)}`, type: "error" });
      }
    }
  }, [customerId, merchantId, retry, persistSnapshot]);

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
          earnAmount?: number | null;
          redeemAmount?: number | null;
        }>,
      ) => {
        const mapped = items
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
            daysUntilMature: typeof i.daysUntilMature === "number" ? i.daysUntilMature : null,
            source:
              typeof i.source === "string" && i.source.trim().length > 0
                ? i.source.trim()
                : null,
            comment:
              typeof i.comment === "string" && i.comment.trim().length > 0
                ? i.comment.trim()
                : null,
            canceledAt:
              typeof i.canceledAt === "string" && i.canceledAt.trim().length > 0
                ? i.canceledAt.trim()
                : null,
            relatedOperationAt:
              typeof i.relatedOperationAt === "string" && i.relatedOperationAt.trim().length > 0
                ? i.relatedOperationAt.trim()
                : null,
            earnAmount:
              typeof i.earnAmount === "number" && Number.isFinite(i.earnAmount) ? i.earnAmount : null,
            redeemAmount:
              typeof i.redeemAmount === "number" && Number.isFinite(i.redeemAmount) ? i.redeemAmount : null,
          }));
      const grouped: TransactionItem[] = [];
      const refundGroups = new Map<
        string,
        { restore: number; revoke: number; base: TransactionItem }
      >();

      for (const item of mapped) {
        const typeUpper = (item.type || "").toUpperCase();
        if (typeUpper === "REFUND" && item.orderId) {
          const key = `${item.orderId}:${item.relatedOperationAt ?? ""}`;
          const current = refundGroups.get(key) ?? {
            restore: 0,
            revoke: 0,
            base: item,
          };
          const amt = Number(item.amount ?? 0);
          if (amt > 0) current.restore += amt;
          else if (amt < 0) current.revoke += Math.abs(amt);
          if (
            !current.base ||
            new Date(item.createdAt).getTime() >
              new Date(current.base.createdAt).getTime()
          ) {
            current.base = item;
          }
          refundGroups.set(key, current);
          continue;
        }
        grouped.push(item);
      }

      for (const [, group] of refundGroups) {
        grouped.push({
          ...group.base,
          amount: group.restore - group.revoke,
          earnAmount: group.restore > 0 ? group.restore : null,
          redeemAmount: group.revoke > 0 ? group.revoke : null,
        });
      }

      grouped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return grouped.filter((item) => {
        if (!item.canceledAt) return true;
        const typeUpper = (item.type || "").toUpperCase();
        const sourceUpper = (item.source || "").toUpperCase();
        const orderId = item.orderId || "";
        const isPurchase =
          orderId &&
          (typeUpper === "EARN" || typeUpper === "REDEEM") &&
          sourceUpper !== "MANUAL_ACCRUAL" &&
          sourceUpper !== "MANUAL_REDEEM" &&
          sourceUpper !== "COMPLIMENTARY" &&
          !orderId.startsWith("manual_") &&
          !orderId.startsWith("complimentary:");
        return isPurchase;
      });
    },
    []
  );

  const loadTx = useCallback(async (opts?: { silent?: boolean; fresh?: boolean }) => {
    const silent = opts?.silent ?? false;
    const fresh = opts?.fresh ?? false;
    if (!customerId) {
      return;
    }
    try {
      const r = await retry(() => transactions(merchantId, customerId, 20, undefined, { fresh }));
      const mapped = mapTransactions(r.items);
      setTx(mapped);
      setTransactionsResolved(true);
      setNextBefore(r.nextBefore || null);
      persistSnapshot({ transactions: mapped.slice(0, 20), nextBefore: r.nextBefore || null });
    } catch (error) {
      if (!silent) {
        setToast({ msg: `Не удалось обновить историю: ${resolveErrorMessage(error)}`, type: "error" });
      }
    }
  }, [customerId, merchantId, retry, mapTransactions, persistSnapshot]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx((prev) => [...prev, ...mapTransactions(r.items)]);
      setNextBefore(r.nextBefore || null);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить ещё: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [merchantId, customerId, nextBefore, mapTransactions]);

  const loadLevels = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!customerId) return;
      try {
        const info = await retry(() => levels(merchantId, customerId));
        setLevelInfo(info);
        setLevelsResolved(true);
        persistSnapshot({ levelInfo: info });
        updateCashbackPercent(info, levelCatalogRef.current);
      } catch (error) {
        if (!opts?.silent) {
          setToast({ msg: `Не удалось обновить уровень: ${resolveErrorMessage(error)}`, type: "error" });
        }
      }
    },
    [customerId, merchantId, retry, persistSnapshot, updateCashbackPercent],
  );


  const loadLevelCatalog = useCallback(async () => {
    if (!merchantId) return;
    try {
      const cfg = await retry(() => mechanicsLevels(merchantId));
      if (Array.isArray(cfg?.levels)) {
        const normalized = cfg.levels.filter((lvl: MechanicsLevel) => lvl && typeof lvl === "object") as MechanicsLevel[];
        setLevelCatalog(normalized);
        updateCashbackPercent(levelInfoRef.current, normalized);
      }
    } catch {
      setLevelCatalog([]);
    }
  }, [merchantId, retry, updateCashbackPercent]);

  const loadBootstrap = useCallback(async () => {
    if (!merchantId || !customerId) return false;
    try {
      const data = await bootstrap(merchantId, customerId, { transactionsLimit: 20 });
      if (data.profile) {
        applyServerProfile(data.profile);
        profilePrefetchedRef.current = true;
      }
      if (data.consent) {
        setConsent(Boolean(data.consent.granted));
      }
      if (data.balance && typeof data.balance.balance === "number") {
        setBal(data.balance.balance);
        setBalanceResolved(true);
        persistSnapshot({ balance: data.balance.balance });
      } else {
        setBalanceResolved(true);
      }
      let effectiveCatalog = levelCatalogRef.current;
      if (!effectiveCatalog.length) {
        try {
          const cfg = await retry(() => mechanicsLevels(merchantId));
          if (Array.isArray(cfg?.levels)) {
            effectiveCatalog = cfg.levels.filter((lvl: MechanicsLevel) => lvl && typeof lvl === "object") as MechanicsLevel[];
            setLevelCatalog(effectiveCatalog);
          } else {
            effectiveCatalog = [];
          }
        } catch {
          effectiveCatalog = [];
        }
      }
      if (data.levels) {
        setLevelInfo(data.levels);
        setLevelsResolved(true);
        persistSnapshot({ levelInfo: data.levels });
        updateCashbackPercent(data.levels, effectiveCatalog);
      }
      const mappedTransactions = data.transactions
        ? mapTransactions(Array.isArray(data.transactions.items) ? data.transactions.items : [])
        : [];
      setTx(mappedTransactions);
      setTransactionsResolved(true);
      setNextBefore(data.transactions?.nextBefore || null);
      if (Array.isArray(data.promotions)) {
        setPromotions(data.promotions);
        persistSnapshot({
          promotions: data.promotions,
          transactions: mappedTransactions.slice(0, 20),
          nextBefore: data.transactions?.nextBefore || null,
        });
      } else {
        setPromotions([]);
        persistSnapshot({
          transactions: mappedTransactions.slice(0, 20),
          nextBefore: data.transactions?.nextBefore || null,
          promotions: [],
        });
      }
      setPromotionsResolved(true);
      setPromotionsLoading(false);
      return true;
    } catch (error) {
      const message = resolveErrorMessage(error);
      setToast({ msg: `Не удалось загрузить данные: ${message}`, type: "error" });
      return false;
    }
  }, [
    merchantId,
    customerId,
    applyServerProfile,
    mapTransactions,
    setToast,
    persistSnapshot,
    retry,
    updateCashbackPercent,
  ]);

  const loadPromotions = useCallback(async () => {
    if (!merchantId || !customerId) {
      setPromotions([]);
      setPromotionsResolved(false);
      return;
    }
    try {
      setPromotionsLoading(true);
      const list = await promotionsList(merchantId, customerId);
      const normalized = Array.isArray(list) ? list : [];
      setPromotions(normalized);
      persistSnapshot({ promotions: normalized, promotionsUpdatedAt: Date.now() });
      setPromotionsResolved(true);
    } catch (error) {
      setToast({ msg: `Не удалось загрузить акции: ${resolveErrorMessage(error)}`, type: "error" });
    } finally {
      setPromotionsLoading(false);
    }
  }, [merchantId, customerId, persistSnapshot]);


  const refreshPointsSnapshot = useCallback(() => {
    if (!customerId) return;
    const tasks: Array<Promise<unknown>> = [
      loadBalance({ silent: true }),
      loadTx({ silent: true, fresh: true }),
      loadLevels({ silent: true }),
    ];
    void Promise.allSettled(tasks);
  }, [customerId, loadBalance, loadTx, loadLevels]);

  const handleExternalEvent = useCallback(
    (payload: unknown) => {
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
      refreshPointsSnapshot();
    },
    [merchantId, customerId, refreshPointsSnapshot],
  );

  useEffect(() => {
    const unsubscribe = subscribeToLoyaltyEvents(handleExternalEvent, {
      merchantId,
      customerId,
    });
    return () => {
      unsubscribe();
    };
  }, [merchantId, customerId, handleExternalEvent]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshPointsSnapshot();
        // Обновить статус реферальной программы при возврате в приложение
        setReferralReloadTick((v) => v + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshPointsSnapshot]);

  const syncConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await consentGet(merchantId, customerId);
      setConsent(!!r.granted);
    } catch {
      // ignore
    }
  }, [customerId, merchantId]);

  const authLoading = auth.loading;
  useEffect(() => {
    if (authLoading) return;
    loadLevelCatalog();
  }, [authLoading, loadLevelCatalog]);
  useEffect(() => {
    if (!customerId) {
      setCashbackPercent(null);
      return;
    }
    updateCashbackPercent(levelInfo, levelCatalog);
  }, [customerId, levelInfo, levelCatalog, updateCashbackPercent]);

  useEffect(() => {
    if (authLoading) return;
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      const ok = await loadBootstrap();
      if (!ok && !cancelled) {
        syncConsent();
        loadBalance();
        loadTx({ fresh: true });
        loadLevels();
        loadPromotions();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, customerId, loadBootstrap, syncConsent, loadBalance, loadTx, loadLevels, loadPromotions]);

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
        await Promise.allSettled([loadBalance(), loadTx({ fresh: true }), loadLevels(), loadPromotions()]);
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: "error" });
      } finally {
        setPromotionsLoading(false);
      }
    },
    [merchantId, customerId, loadBalance, loadTx, loadLevels, loadPromotions]
  );

  useEffect(() => {
    if (auth.loading) return;
    const sanitizeId = (v: string | null | undefined) => (typeof v === "string" && v !== "undefined" && v.trim() ? v : null);
    const mc = sanitizeId(auth.customerId) || sanitizeId(customerId);
    if (!mc || !merchantId) {
      setReferralEnabled(false);
      setReferralInfo(null);
      setReferralResolved(false);
      persistSnapshot({ referral: { enabled: false, info: null } });
      try {
        const key = merchantId ? `miniapp.customerId.v1:${merchantId}` : "";
        const legacyKey = merchantId ? legacyLocalCustomerKey(merchantId) : "";
        const maybeCleanup = (k: string) => {
          if (!k) return;
          const saved = localStorage.getItem(k);
          if (saved === "undefined" || !saved || !saved.trim()) {
            localStorage.removeItem(k);
          }
        };
        maybeCleanup(key);
        maybeCleanup(legacyKey);
      } catch {}
      return;
    }
    let cancelled = false;
    setReferralLoading(true);
    const hasCachedReferral = Boolean(snapshotRef.current?.referral?.info);
    if (!hasCachedReferral) {
      setReferralResolved(false);
      setReferralEnabled(false);
      setReferralInfo(null);
    }
    referralLink(mc, merchantId)
      .then((data) => {
        if (cancelled) return;
        const info = {
          code: data.code,
          link: data.link,
          messageTemplate: data.program?.messageTemplate ?? "",
          placeholders: Array.isArray(data.program?.placeholders) ? data.program.placeholders : [],
          merchantName: data.program?.merchantName ?? "",
          friendReward: typeof data.program?.refereeReward === "number" ? data.program.refereeReward : 0,
          inviterReward: typeof data.program?.referrerReward === "number" ? data.program.referrerReward : 0,
          shareMessageTemplate:
            typeof data.program?.shareMessageTemplate === 'string' ? data.program.shareMessageTemplate : undefined,
        };
        setReferralInfo(info);
        setReferralEnabled(true);
        persistSnapshot({ referral: { enabled: true, info } });
      })
      .catch(() => {
        if (!cancelled) {
          setReferralInfo(null);
          setReferralEnabled(false);
          persistSnapshot({ referral: { enabled: false, info: null } });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReferralLoading(false);
          setReferralResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.customerId, customerId, merchantId, referralReloadTick, persistSnapshot]);

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

  const finalizePhoneShare = useCallback(
    async (options?: { capturedPhone?: string | null; waitServerSync?: boolean }) => {
      if (!merchantId) return false;
      const { capturedPhone = null, waitServerSync = false } = options ?? {};
      let effectiveCustomerId = pendingCustomerIdForPhone || customerId;
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
      const key = profileStorageKey(merchantId);
      const pendingKey = profilePendingKey(merchantId);
      setPhoneShareError(null);
      setPhoneShareStage("saving");
      setProfileSaving(true);
      try {
        let serverHasPhone = teleHasPhone === true;
        let statusError: unknown = null;
        let teleauthRefreshed = false;
        const syncTeleauthCustomer = async () => {
          if (teleauthRefreshed) return effectiveCustomerId;
          teleauthRefreshed = true;
          let initForAuth = initData;
          if (!isValidInitData(initForAuth)) {
            initForAuth = await waitForInitData(10, 200);
          }
          if (!isValidInitData(initForAuth)) return null;
          try {
            const result = await teleauth(merchantId, initForAuth);
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
            const status = await profilePhoneStatus(merchantId, effectiveCustomerId);
            serverHasPhone = Boolean(status?.hasPhone);
            statusError = null;
          } catch (statusErr) {
            if (isForbiddenError(statusErr)) {
              const refreshed = await syncTeleauthCustomer();
              if (refreshed && refreshed !== effectiveCustomerId) {
                try {
                  const status = await profilePhoneStatus(merchantId, refreshed);
                  serverHasPhone = Boolean(status?.hasPhone);
                  statusError = null;
                  return;
                } catch (retryErr) {
                  statusError = retryErr;
                }
              }
            }
            serverHasPhone = false;
            statusError = statusErr;
          }
        };
        if (!serverHasPhone) {
          await refreshPhoneStatus();
        }
        if (!serverHasPhone && waitServerSync) {
          for (let attempt = 0; attempt < 5 && !serverHasPhone; attempt += 1) {
            await sleep(600 + attempt * 400);
            await refreshPhoneStatus();
          }
        }
        const normalizedPhone =
          typeof capturedPhone === "string" && capturedPhone.trim()
            ? capturedPhone.trim()
            : typeof phone === "string" && phone.trim()
            ? phone.trim()
            : "";
        if (!serverHasPhone && !normalizedPhone) {
          if (statusError) {
            // статус мог не успеть обновиться, покажем пользователю понятное сообщение
          }
          setToast({ msg: PHONE_NOT_LINKED_MESSAGE, type: "error" });
          setPhoneShareError(PHONE_NOT_LINKED_MESSAGE);
          setPhoneShareStage("idle");
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
          localStorage.setItem(
            key,
            JSON.stringify({ name: payload.name, gender: payload.gender, birthDate: payload.birthDate }),
          );
        } catch {
          // ignore
        }
        try {
          localStorage.removeItem(pendingKey);
        } catch {
          // ignore
        }
        setAuthTeleHasPhone(true);
        setAuthTeleOnboarded(true);
        setProfileCompleted(true);
        setNeedPhoneStep(false);
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
          setPhoneShareError(PHONE_NOT_LINKED_MESSAGE);
        }
        setToast({
          msg: phoneMissing ? PHONE_NOT_LINKED_MESSAGE : `Не удалось сохранить профиль: ${message}`,
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
      setProfileCompleted,
      setNeedPhoneStep,
      setPendingCustomerIdForPhone,
    ],
  );

  const handleRequestPhone = useCallback(async () => {
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
        if (typeof record.phone_number === "string" || typeof record.phone === "string" || typeof record.value === "string") {
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
        const res = await tg.requestPhoneNumber();
        const normalized = normalize(res);
        if (!markPhone(normalized) && detectShareConfirmation(res)) {
          shareConfirmed = true;
        }
      }
      if (!phoneCaptured && canRequestContact) {
        promptTriggered = true;
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const timeout = window.setTimeout(() => {
            finish();
          }, 5000);
          try {
            tg.requestContact?.((payload: unknown) => {
              const normalized = normalize(payload);
              if (!markPhone(normalized) && detectShareConfirmation(payload)) {
                shareConfirmed = true;
              }
              clearTimeout(timeout);
              finish();
            });
          } catch {
            clearTimeout(timeout);
            finish();
          }
        });
      }
      if (phoneCaptured && capturedPhone) {
        await finalizePhoneShare({ capturedPhone });
        return;
      }
      if (shareConfirmed) {
        await finalizePhoneShare({ waitServerSync: true });
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

  const handleProfileSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setProfileTouched(true);
      if (!profileForm.name || !profileForm.gender || !profileForm.birthDate) {
        setToast({ msg: "Заполните все поля", type: "error" });
        return;
      }
      setProfileSaving(true);
      const key = merchantId ? profileStorageKey(merchantId) : null;
      const pendingKey = merchantId ? profilePendingKey(merchantId) : null;
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(profileForm)); } catch {}
      }

      let effectiveCustomerId = customerId;
      if ((!effectiveCustomerId || !merchantId)) {
        let initForAuth = initData;
        if (!isValidInitData(initForAuth)) {
          initForAuth = await waitForInitData(10, 200);
        }
        if (merchantId && isValidInitData(initForAuth)) {
          try {
            const result = await teleauth(merchantId, initForAuth);
            effectiveCustomerId = result.customerId;
            setAuthCustomerId(result.customerId);
            setCustomerId(result.customerId);
            setAuthTeleOnboarded(Boolean(result.onboarded));
            setAuthTeleHasPhone(Boolean(result.hasPhone));
            try {
              localStorage.setItem(localCustomerKey(merchantId), result.customerId);
              localStorage.removeItem(legacyLocalCustomerKey(merchantId));
            } catch {
              // ignore storage issues
            }
          } catch (teleauthError) {
            const message = resolveErrorMessage(teleauthError);
            setToast({ msg: `Не удалось авторизоваться в Telegram: ${message}`, type: "error" });
            setProfileSaving(false);
            return;
          }
        } else {
          if (pendingKey) {
            try { localStorage.setItem(pendingKey, JSON.stringify(profileForm)); } catch {}
          }
          pendingProfileSync.current = false;
          setToast({ msg: "Профиль сохранён, синхронизируем после завершения авторизации Telegram", type: "info" });
          setProfileSaving(false);
          return;
        }
      }

      if (inviteCode.trim()) {
        try {
          await referralActivate(inviteCode.trim(), effectiveCustomerId);
          setInviteApplied(true);
          setInviteCode("");
        } catch (err) {
          const description = resolveErrorMessage(err);
          const isInvalid = /400\s+Bad\s+Request/i.test(description) || /Недействитель|expired|invalid/i.test(description);
          if (isInvalid) {
            setToast({ msg: "Недействительный пригласительный код", type: "error" });
            setProfileSaving(false);
            return;
          }
          setToast({ msg: `Не удалось проверить код: ${description}`, type: "error" });
        }
      }

      // Если номер нужен, покажем шаг привязки номера и отложим сохранение
      if (!phone) {
        setNeedPhoneStep(true);
        setPendingCustomerIdForPhone(effectiveCustomerId);
        setProfileSaving(false);
        return;
      }

      try {
        const saved = await profileSave(merchantId, effectiveCustomerId, {
          name: profileForm.name.trim(),
          gender: profileForm.gender as 'male' | 'female',
          birthDate: profileForm.birthDate,
          phone: phone || undefined,
        });
        applyProfileSaveResult(saved, effectiveCustomerId);
        if (key) {
          try { localStorage.setItem(key, JSON.stringify({ name: profileForm.name.trim(), gender: profileForm.gender, birthDate: profileForm.birthDate })); } catch {}
          try { localStorage.removeItem(pendingKey!); } catch {}
        }
        setToast({ msg: "Профиль сохранён", type: "success" });
        setProfileCompleted(true);
        setAuthTeleHasPhone(true);
        setAuthTeleOnboarded(true);
      } catch (error) {
        const message = resolveErrorMessage(error);
        setToast({ msg: `Не удалось сохранить профиль: ${message}`, type: "error" });
      } finally {
        setProfileSaving(false);
      }
    },
    [
      merchantId,
      customerId,
      profileForm,
      inviteCode,
      phone,
      initData,
      applyProfileSaveResult,
      setAuthCustomerId,
      setAuthTeleOnboarded,
      setAuthTeleHasPhone,
    ]
  );

  const availablePromotions = useMemo(
    () => promotions.filter((p) => p && p.canClaim && !p.claimed).length,
    [promotions],
  );

  const handlePromoActivate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const code = promoCode.trim();
      if (!code) {
        setToast({ msg: 'Введите промокод', type: 'error' });
        return;
      }
      if (!merchantId || !customerId) {
        setToast({ msg: 'Не удалось определить клиента', type: 'error' });
        return;
      }
      setPromoLoading(true);
      try {
        const result = await promoCodeApply(merchantId, customerId, code);
        if (result.ok) {
          const successMessage = result.message || 'Промокод применён';
          setToast({ msg: successMessage, type: 'success' });
          setPromoCode('');
          await Promise.allSettled([loadBalance(), loadTx({ fresh: true }), loadLevels()]);
        } else {
          setToast({ msg: 'Промокод не подошёл', type: 'error' });
        }
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: 'error' });
      } finally {
        setPromoLoading(false);
      }
    },
    [promoCode, merchantId, customerId, loadBalance, loadTx, loadLevels]
  );

  const handleInviteFriend = useCallback(() => {
    if (!referralInfo) return;
    const ctx: ReferralTemplateContext = {
      merchantName: referralInfo.merchantName,
      bonusAmount: referralInfo.inviterReward || 0,
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
      // ignore window open issues
    }
  }, [referralInfo]);

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

  // Render message with clickable {link} and {code} placeholders
  const renderReferralMessage = (template: string, ctx: ReferralTemplateContext) => {
    const tpl = normalizeReferralTemplate(template, REFERRAL_MESSAGE_FALLBACK);
    const regex = /\{businessname\}|\{bonusamount\}|\{code\}|\{link\}/gi;
    const matches = tpl.match(regex) || [];
    const parts = tpl.split(regex);
    const nodes: ReactNode[] = [];
    const onCopy = async (value: string) => {
      try {
        if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(value);
        setToast({ msg: "Скопировано", type: "success" });
      } catch {
        // ignore
      }
    };
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i]) nodes.push(<span key={`t-${i}`}>{parts[i]}</span>);
      const ph = matches[i];
      if (!ph) continue;
      const phLow = ph.toLowerCase();
      if (phLow === '{businessname}') {
        nodes.push(<strong key={`b-${i}`}>{ctx.merchantName}</strong>);
      } else if (phLow === '{bonusamount}') {
        const val = ctx.bonusAmount > 0 ? String(Math.round(ctx.bonusAmount)) : '';
        nodes.push(<strong key={`ba-${i}`}>{val}</strong>);
      } else if (phLow === '{code}') {
        nodes.push(
          <button key={`c-${i}`} type="button" className={styles.copyChip} onClick={() => onCopy(ctx.code)}>
            {ctx.code}
          </button>,
        );
      } else if (phLow === '{link}') {
        nodes.push(
          <button key={`l-${i}`} type="button" className={styles.copyChip} onClick={() => onCopy(ctx.link)}>
            {ctx.link}
          </button>,
        );
      }
    }
    return nodes;
  };

  const inviteFieldVisible = referralResolved && referralEnabled;
  const mustCompleteOnboarding = teleOnboarded === false && !localOnboarded;
  const onboardingBlocked = mustCompleteOnboarding && !referralResolved;
  const gateTeleOnboarded = onboardingBlocked ? null : teleOnboarded;

  const phoneButtonLabel = useMemo(() => {
    if (phoneShareStage === "saving" || profileSaving) {
      return "Сохраняем…";
    }
    if (phoneShareStage === "waiting") {
      return "Ожидаем подтверждения…";
    }
    return "Поделиться номером";
  }, [phoneShareStage, profileSaving]);

  const phoneButtonClick = handleRequestPhone;
  const phoneButtonDisabled = phoneShareStage !== "idle" || profileSaving;

  const profileContent = (
    <div className={styles.profileContainer}>
          {needPhoneStep ? (
            <div className={`${styles.profileCard} ${inviteFieldVisible ? styles.profileCardExtended : styles.profileCardCompact}`}>
              <div>
                <div className={styles.profileTitle}>Пожалуйста, привяжите ваш номер телефона.</div>
                <div className={styles.profileSubtitle}>
                  Без него мы не сможем зарегистрировать вас в программе лояльности.
                  <br />
                  Нажмите для привязки:
                </div>
              </div>
              <button
                type="button"
                className={styles.profileSubmit}
                onClick={phoneButtonClick}
                disabled={phoneButtonDisabled}
              >
                {phoneButtonLabel}
              </button>
              {phoneShareError && (
                <div className={styles.profileErrorMessage}>
                  {phoneShareError}
                </div>
              )}
            </div>
          ) : (
            <form
              className={`${styles.profileCard} ${
                inviteFieldVisible ? styles.profileCardExtended : styles.profileCardCompact
              }`}
              onSubmit={handleProfileSubmit}
            >
              <div>
                <div className={styles.profileTitle}>Расскажите о себе</div>
                <div className={styles.profileSubtitle}>
                  Эта информация поможет нам подобрать акции лично для вас
                </div>
              </div>
              <div className={styles.profileField}>
                <label htmlFor="name">Имя</label>
                <input
                  id="name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Введите имя"
                  className={profileTouched && !profileForm.name ? styles.inputError : undefined}
                />
              </div>
              <div className={styles.profileField}>
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
              <div className={styles.profileField}>
                <label htmlFor="birthRow">Дата рождения</label>
                <div
                  id="birthRow"
                  className={`${styles.dateRow} ${profileTouched && !profileForm.birthDate ? styles.inputErrorBorder : ""}`}
                >
                  <select
                    className={styles.dateSelect}
                    value={birthYear}
                    onChange={(e) => {
                      const y = e.target.value;
                      setBirthYear(y);
                      applyBirthDate(y, birthMonth, birthDay);
                    }}
                  >
                    <option value="" disabled>
                      Год
                    </option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.dateSelect}
                    value={birthMonth}
                    onChange={(e) => {
                      const m = e.target.value;
                      setBirthMonth(m);
                      applyBirthDate(birthYear, m, birthDay);
                    }}
                  >
                    <option value="" disabled>
                      Месяц
                    </option>
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.dateSelect}
                    value={birthDay}
                    onChange={(e) => {
                      const d = e.target.value;
                      setBirthDay(d);
                      applyBirthDate(birthYear, birthMonth, d);
                    }}
                    disabled={!birthYear || !birthMonth}
                  >
                    <option value="" disabled>
                      День
                    </option>
                    {days.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {inviteFieldVisible && (
                <div className={styles.profileField}>
                  <label htmlFor="invite">Пригласительный код</label>
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
                      : ""}
                  </span>
                </div>
              )}
              <button
                type="submit"
                className={styles.profileSubmit}
                disabled={profileSaving}
              >
                Сохранить
              </button>
            </form>
          )}
        </div>
  );

  const dashboardContent = (
    <>
          <header className={`${styles.header}`}>
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

          {/* Инфобар с кодом можно вернуть при необходимости */}

          <section className={`${styles.card}`}>
            <button type="button" className={styles.qrMini} aria-label="Открыть QR" onClick={() => setQrOpen(true)}>
              <div className={styles.qrWrapper}>
                <FakeQr />
              </div>
              <span className={styles.qrHint}>Нажмите</span>
            </button>
            <div className={styles.cardContent}>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Баланс</span>
                <span className={styles.cardValue}>
                  {balanceResolved ? (
                    bal != null ? bal.toLocaleString("ru-RU") : "—"
                  ) : (
                    <span className={styles.skeletonText} />
                  )}
                </span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Уровень</span>
                <span className={styles.cardValue}>
                  {levelsResolved ? levelInfo?.current?.name || "—" : <span className={styles.skeletonText} />}
                </span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Кэшбэк</span>
                <span className={styles.cardValue}>
                  {levelsResolved ? (
                    typeof cashbackPercent === "number" ? `${cashbackPercent}%` : "—"
                  ) : (
                    <span className={styles.skeletonText} />
                  )}
                </span>
              </div>
            </div>
          </section>

          

          <section className={`${styles.actionsRow}`}>
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
          </section>

          <section className={`${styles.actionsPair}`}>
            <button
              type="button"
              className={styles.promotionsButton}
              onClick={() => { setPromotionsOpen(true); if (!promotions.length) void loadPromotions(); }}
            >
              <span>Акции</span>
              <span
                className={`${styles.promotionsBadge} ${
                  promotionsResolved ? "" : styles.promotionsBadgeSkeleton
                }`}
                aria-live="polite"
              >
                {promotionsResolved ? availablePromotions : ""}
              </span>
            </button>
            {referralEnabled && referralInfo && (
              <button
                type="button"
                className={styles.inviteActionButton}
                onClick={() => setInviteSheetOpen(true)}
                disabled={referralLoading}
              >
                <span aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4.5 16C4.8 13 7 12 10 12C13 12 15.2 13 15.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Пригласить друга</span>
              </button>
            )}
          </section>

          <section className={`${styles.historySection}`}>
            <div className={styles.historyHeader}>История</div>
            {!transactionsResolved && tx.length === 0 ? (
              <div className={styles.historySkeleton} aria-hidden="true">
                {[0, 1, 2].map((row) => (
                  <div key={row} className={styles.historySkeletonRow} />
                ))}
              </div>
            ) : tx.length === 0 ? (
              <div className={styles.emptyState}>Операций пока нет</div>
            ) : (
              <ul className={styles.historyList}>
                {tx.map((item, idx) => {
                  const meta = getTransactionMeta(item.type, item.source);
                  const typeUpper = String(item.type).toUpperCase();
                  const isPending = Boolean(item.pending) && (typeUpper === "EARN" || typeUpper === "REGISTRATION");
                  const isComplimentary = meta.kind === "complimentary";
                  const earnAmount = item.earnAmount != null ? Math.max(0, Number(item.earnAmount)) : null;
                  const redeemAmount = item.redeemAmount != null ? Math.max(0, Number(item.redeemAmount)) : null;
                  const hasSplitAmount =
                    (earnAmount != null && earnAmount > 0) || (redeemAmount != null && redeemAmount > 0);
                  let title: string;
                  if (isPending) {
                    title =
                      typeUpper === "REGISTRATION"
                        ? "Бонус за регистрацию - на удержании"
                        : "Начисление на удержании";
                  } else if (meta.kind === "refund") {
                    const relatedAt = item.relatedOperationAt;
                    const relatedTimestamp = relatedAt ? Date.parse(relatedAt) : NaN;
                    const relatedLabel = Number.isNaN(relatedTimestamp)
                      ? null
                      : new Date(relatedTimestamp).toLocaleString("ru-RU", REFUND_REFERENCE_FORMAT);
                    title = relatedLabel ? `${meta.title} от ${relatedLabel}` : meta.title;
                  } else {
                    title = meta.title;
                  }
                  const extraNotes: string[] = [];
                  if (isPending) {
                    const days =
                      typeof item.daysUntilMature === "number"
                        ? item.daysUntilMature
                        : item.maturesAt
                          ? Math.max(
                              0,
                              Math.ceil((Date.parse(item.maturesAt) - Date.now()) / (24 * 60 * 60 * 1000)),
                            )
                          : null;
                    if (days === 0) extraNotes.push("Баллы будут начислены сегодня");
                    else if (days === 1) extraNotes.push("Баллы будут начислены завтра");
                    else if (days != null) extraNotes.push(`Баллы будут начислены через ${days} дней`);
                    else extraNotes.push("Баллы будут начислены позже");
                  }
                  if (isComplimentary && item.comment) {
                    extraNotes.push(item.comment);
                  }
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
                        {extraNotes.map((line, noteIdx) => (
                          <div key={`${item.id}-note-${noteIdx}`} className={styles.historyNote}>
                            {line}
                          </div>
                        ))}
                        <div className={styles.historyDate}>
                          {new Date(item.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <div className={styles.historyAmount}>
                        {hasSplitAmount ? (
                          <div className={styles.historyAmountSplit}>
                            {earnAmount != null && earnAmount > 0 && (
                              <span className={`${styles.historyPill} ${styles.historyPillPlus}`}>
                                {formatAmount(earnAmount)}
                              </span>
                            )}
                            {redeemAmount != null && redeemAmount > 0 && (
                              <span className={`${styles.historyPill} ${styles.historyPillMinus}`}>
                                {formatAmount(-redeemAmount)}
                              </span>
                            )}
                          </div>
                        ) : (
                          formatAmount(item.amount)
                        )}
                      </div>
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

          {DEV_UI && (
            <section className={`${styles.devPanel}`}>
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
                    try {
                      if (typeof window !== "undefined" && customerId) {
                        const consentKey = `consent:${merchantId}:${customerId}`;
                        localStorage.setItem(
                          consentKey,
                          JSON.stringify({
                            name: profileForm.name,
                            gender: profileForm.gender,
                            birthDate: profileForm.birthDate,
                          }),
                        );
                      }
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                />
              </label>
            </section>
          )}

          {qrOpen && (
            <div className={`${qrStyles.page} ${qrStyles.pageOverlay}`}>
              <div className={qrStyles.modalBody}>
                <section className={qrStyles.qrSection}>
                  <div className={qrStyles.qrHeader}>Покажите QR-код на кассе</div>
                  <div className={qrStyles.qrWrapper} style={{ width: qrWrapperSize, height: qrWrapperSize }}>
                    {qrToken ? (
                      <QrCanvas value={qrToken} size={qrSize} />
                    ) : (
                      <div className={qrStyles.qrPlaceholder} style={{ width: qrSize, height: qrSize }} />
                    )}
                    {(qrLoading || qrRefreshing) && (
                      <div className={qrStyles.qrOverlay}>
                        <span className={qrStyles.qrOverlayText}>Обновляем QR…</span>
                      </div>
                    )}
                  </div>
                  <div className={qrStyles.qrFooter}>
                    <button
                      type="button"
                      className={qrStyles.refreshButton}
                      onClick={() => {
                        void refreshQr();
                      }}
                      disabled={qrRefreshing}
                    >
                      {qrRefreshing ? "Обновляем…" : "Обновить QR"}
                    </button>
                    {typeof qrTimeLeft === "number" && qrToken && (
                      <span className={qrStyles.ttlHint}>{qrTimeLeft} сек.</span>
                    )}
                  </div>
                </section>

                <section className={qrStyles.infoGrid}>
                  <div className={qrStyles.infoCard}>
                    <div className={qrStyles.infoLabel}>Баланс</div>
                    <div className={qrStyles.infoValue}>{bal != null ? bal.toLocaleString("ru-RU") : "—"}</div>
                    <div className={qrStyles.infoCaption}>бонусов</div>
                  </div>
                  <div className={qrStyles.infoCard}>
                    <div className={qrStyles.infoLabel}>Уровень</div>
                    <div className={qrStyles.infoValue}>{levelInfo?.current?.name || "—"}</div>
                    <div className={qrStyles.infoCaption}>
                      Кэшбэк {typeof cashbackPercent === "number" ? `${cashbackPercent}%` : "—%"}
                    </div>
                  </div>
                </section>

                {qrShowProgress && (
                  <section className={qrStyles.progressSection}>
                    <div className={qrStyles.progressTitle}>Сумма покупок до следующего уровня &gt;</div>
                    <div className={qrStyles.progressBar}>
                      <div className={qrStyles.progressFill} style={{ width: `${qrProgressData.percent}%` }} />
                    </div>
                    <div className={qrStyles.progressScale}>
                      <span>{qrProgressData.current.toLocaleString("ru-RU")}</span>
                      <span>{qrProgressData.threshold.toLocaleString("ru-RU")}</span>
                    </div>
                  </section>
                )}

                {qrError && <div className={qrStyles.error}>{qrError}</div>}
              </div>
            </div>
          )}

      {inviteSheetPresence.shouldRender && referralEnabled && referralInfo && (
        <div
          className={`${styles.modalBackdrop} ${
            inviteSheetPresence.status === "entered" ? styles.modalBackdropVisible : styles.modalBackdropLeaving
          }`}
          onClick={() => setInviteSheetOpen(false)}
        >
          <div
            className={`${styles.sheet} ${styles.sheetAnimated} ${
              inviteSheetPresence.status === "entered" ? styles.sheetEntering : styles.sheetLeaving
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHeader}>Пригласить друга</div>
            <div className={styles.sheetText}>
              {renderReferralMessage(referralInfo.messageTemplate, {
                merchantName: referralInfo.merchantName,
                bonusAmount: referralInfo.inviterReward || 0,
                code: referralInfo.code,
                link: referralInfo.link,
              })}
            </div>
            <button
              className={`${styles.sheetButton} ${styles.sheetPrimaryButton}`}
              onClick={() => {
                void handleInviteFriend();
                setInviteSheetOpen(false);
              }}
            >
              Отправить сообщение
            </button>
            <button
              type="button"
              className={styles.sheetButton}
              onClick={() => setInviteSheetOpen(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {promotionsSheetPresence.shouldRender && (
        <div
          className={`${styles.modalBackdrop} ${
            promotionsSheetPresence.status === "entered" ? styles.modalBackdropVisible : styles.modalBackdropLeaving
          }`}
          onClick={() => setPromotionsOpen(false)}
        >
          <div
            className={`${styles.sheet} ${styles.sheetAnimated} ${
              promotionsSheetPresence.status === "entered" ? styles.sheetEntering : styles.sheetLeaving
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHeader}>Акции</div>
            {promotions.length === 0 ? (
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
            <button type="button" className={styles.sheetButton} onClick={() => setPromotionsOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {settingsSheetPresence.shouldRender && (
        <div
          className={`${styles.modalBackdrop} ${
            settingsSheetPresence.status === "entered" ? styles.modalBackdropVisible : styles.modalBackdropLeaving
          }`}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className={`${styles.sheet} ${styles.sheetAnimated} ${
              settingsSheetPresence.status === "entered" ? styles.sheetEntering : styles.sheetLeaving
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHeader}>Настройки</div>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={consent} onChange={toggleConsent} />
              <span>Согласие на рассылку</span>
            </label>
            <button className={styles.sheetButton} onClick={() => loadBalance()}>
              Обновить баланс
            </button>
            <button className={styles.sheetButton} onClick={() => loadTx({ fresh: true })}>
              Обновить историю
            </button>
            <button
              className={styles.sheetButton}
              onClick={() => {
                setSettingsOpen(false);
                setQrOpen(true);
              }}
            >
              Открыть QR
            </button>
          </div>
        </div>
      )}
    </>
  );

  const splashView = (
    <div className={styles.splashScreen}>
      <div className={styles.splashSpinner} aria-hidden="true" />
      <div>Загружаем приложение…</div>
    </div>
  );

  return (
    <div className={styles.page} suppressHydrationWarning>
      <RegistrationGate
        status={auth.status}
        teleOnboarded={gateTeleOnboarded}
        localOnboarded={localOnboarded}
        onboardingView={profileContent}
        dashboardView={dashboardContent}
        splashView={splashView}
      />
      {error && !loading && <div className={styles.error}>{error}</div>}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default dynamic(() => Promise.resolve(MiniappPage), { ssr: false });
