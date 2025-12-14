'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QrScanner from '../components/QrScanner';
import SegmentedInput from '../components/SegmentedInput';

type QuoteRedeemResp = {
  canRedeem?: boolean;
  discountToApply?: number;
  pointsToBurn?: number;
  finalPayable?: number;
  holdId?: string;
  message?: string;
};

type QuoteEarnResp = {
  canEarn?: boolean;
  pointsToEarn?: number;
  holdId?: string;
  message?: string;
};

type Txn = {
  id: string;
  mode: 'PURCHASE' | 'REFUND' | 'TXN';
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'ADJUST' | null;
  amount: number | null;
  orderId?: string | null;
  receiptNumber?: string | null;
  createdAt: string;
  outletId?: string | null;
  outletName?: string | null;
  outletPosType?: string | null;
  outletLastSeenAt?: string | null;
  purchaseAmount?: number | null;
  earnApplied?: number | null;
  redeemApplied?: number | null;
  refundEarn?: number | null;
  refundRedeem?: number | null;
  staffName?: string | null;
  customerName?: string | null;
};

type CashierSessionInfo = {
  sessionId: string;
  merchantId: string;
  staff: {
    id: string;
    role: string;
    login?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
  };
  outlet: {
    id: string;
    name?: string | null;
  };
  startedAt: string;
  lastSeenAt?: string | null;
  rememberPin?: boolean;
};

type RawSessionPayload = {
  sessionId?: unknown;
  merchantId?: unknown;
  staff?: {
    id?: unknown;
    role?: unknown;
    login?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    displayName?: unknown;
  } | null;
  outlet?: {
    id?: unknown;
    name?: unknown;
  } | null;
  startedAt?: unknown;
  lastSeenAt?: unknown;
  rememberPin?: unknown;
};

type CustomerOverview = {
  customerId: string | null;
  name: string | null;
  levelName: string | null;
  balance: number | null;
};

type LeaderboardEntry = {
  staffId: string;
  staffName: string;
  outletName: string | null;
  points: number;
};

type LeaderboardSettings = {
  leaderboardPeriod?: string;
  customDays?: number;
  pointsForNewCustomer?: number;
  pointsForExistingCustomer?: number;
};

type LeaderboardPeriod = {
  kind?: string;
  label?: string;
  customDays?: number;
};

type RefundHistoryItem = {
  id: string;
  createdAt: string;
  amount: number;
  receiptNumber?: string | null;
};

type RefundPreview = {
  receiptId: string;
  orderId: string | null;
  receiptNumber: string | null;
  customerName: string | null;
  purchaseAmount: number;
  pointsToRestore: number;
  pointsToRevoke: number;
};

type RawLeaderboardItem = {
  staffId?: unknown;
  staffName?: unknown;
  staffDisplayName?: unknown;
  staffLogin?: unknown;
  outletName?: unknown;
  points?: unknown;
};

const COOKIE_LOGIN = 'cashier_login';
const COOKIE_PASSWORD = 'cashier_password';
const COOKIE_PIN = 'cashier_pin';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const isBrowser = typeof document !== 'undefined';
const isSecureContext =
  typeof window !== 'undefined' &&
  typeof window.location !== 'undefined' &&
  window.location.protocol === 'https:';

const readCookie = (name: string): string | null => {
  if (!isBrowser) return null;
  const entries = document.cookie ? document.cookie.split(';') : [];
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.split('=');
    if (!rawKey) continue;
    if (rawKey.trim() === name) {
      return decodeURIComponent(rest.join('=').trim());
    }
  }
  return null;
};

const writeCookie = (name: string, value: string, maxAgeSeconds = COOKIE_MAX_AGE) => {
  if (!isBrowser) return;
  const secure = isSecureContext ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; max-age=${maxAgeSeconds}${secure}`;
};

const deleteCookie = (name: string) => {
  if (!isBrowser) return;
  const secure = isSecureContext ? '; Secure' : '';
  document.cookie = `${name}=; path=/; SameSite=Lax; max-age=0${secure}`;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const LOYALTY_EVENT_CHANNEL = 'loyalty:events';
const LOYALTY_EVENT_STORAGE_KEY = 'loyalty:lastEvent';

const base64UrlDecode = (s: string) => {
  try {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    return atob(s + '='.repeat(pad));
  } catch {
    return '';
  }
};

const extractNameFromToken = (token: string): string | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
    const nameCandidate =
      payload?.name ??
      payload?.username ??
      payload?.displayName ??
      payload?.fullName ??
      null;
    if (nameCandidate) return String(nameCandidate);
  } catch {
    /* noop */
  }
  return null;
};

const resolveCustomerIdFromToken = (token: string): string | null => {
  const trimmed = (token || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  if (parts.length !== 3) return trimmed;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
    const candidate =
      payload?.cid ??
      payload?.customerId ??
      payload?.sub ??
      payload?.userId ??
      payload?.id ??
      null;
    return candidate ? String(candidate) : null;
  } catch {
    return null;
  }
};

const qrKeyFromToken = (token: string) => {
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
      if (payload?.jti) return `jti:${payload.jti}`;
    } catch {
      /* noop */
    }
  }
  return `raw:${trimmed}`;
};

const formatDateTime = (value: string) => {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
};

const formatPoints = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
};

const MOTIVATION_MAX_CUSTOM_DAYS = 365;
const MOTIVATION_DEFAULT_NEW_POINTS = 30;
const MOTIVATION_DEFAULT_EXISTING_POINTS = 10;

const resolveMotivationDays = (kind: string, customDays?: number | null) => {
  const normalized = (kind || '').toLowerCase();
  switch (normalized) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'quarter':
      return 90;
    case 'year':
      return 365;
    case 'custom': {
      const numeric = Math.round(Number(customDays ?? 0));
      if (!Number.isFinite(numeric) || numeric <= 0) return 1;
      if (numeric > MOTIVATION_MAX_CUSTOM_DAYS) return MOTIVATION_MAX_CUSTOM_DAYS;
      return numeric;
    }
    default:
      return 7;
  }
};

const buildMotivationPeriodLabel = (kind: string, customDays?: number | null) => {
  const normalized = (kind || '').toLowerCase();
  if (normalized === 'custom') {
    const days = resolveMotivationDays(normalized, customDays);
    const suffix =
      days % 10 === 1 && days % 100 !== 11
        ? 'день'
        : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)
          ? 'дня'
          : 'дней';
    return `Последние ${days} ${suffix}`;
  }
  switch (normalized) {
    case 'week':
      return 'Последние 7 дней';
    case 'month':
      return 'Последние 30 дней';
    case 'quarter':
      return 'Последние 90 дней';
    case 'year':
      return 'Последние 365 дней';
    default:
      return 'Последние 7 дней';
  }
};

export default function Page() {
  const [merchantId, setMerchantId] = useState<string>(MERCHANT);

  const [mode, setMode] = useState<'redeem' | 'earn'>('redeem');
  const [userToken, setUserToken] = useState<string>('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>('');
  const [total, setTotal] = useState<number>(0);
  const [receiptNumber, setReceiptNumber] = useState<string>('');

  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const [refundReceiptNumber, setRefundReceiptNumber] = useState<string>('');
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string>('');

  const [history, setHistory] = useState<Txn[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histNextBefore, setHistNextBefore] = useState<string | null>(null);

  const [session, setSession] = useState<CashierSessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [rememberPin, setRememberPin] = useState<boolean>(false);

  const [merchantLogin, setMerchantLogin] = useState<string>('');
  const [passwordDigits, setPasswordDigits] = useState<string>('');
  const [pinDigits, setPinDigits] = useState<string>('');
  const [authMsg, setAuthMsg] = useState<string>('');
  const [step, setStep] = useState<'merchant' | 'pin' | 'terminal'>('merchant');
  const [staffLookup, setStaffLookup] = useState<{
    staff: { id: string; login?: string; firstName?: string; lastName?: string; role: string };
    outlet?: { id: string; name?: string | null };
    accesses: Array<{ outletId: string; outletName: string }>;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'rating' | 'returns'>('home');
  const [flowStep, setFlowStep] = useState<'idle' | 'details' | 'points' | 'confirm' | 'receipt'>('idle');
  const [purchaseAmountInput, setPurchaseAmountInput] = useState<string>('');
  const [receiptInput, setReceiptInput] = useState<string>('');
  const [selectedPoints, setSelectedPoints] = useState<number>(0);
  const [lastRequestedRedeem, setLastRequestedRedeem] = useState<number>(0);
  const [quoteError, setQuoteError] = useState<string>('');
  const [confirmSnapshot, setConfirmSnapshot] = useState<{
    purchaseTotal: number;
    finalPayable: number;
    pointsEarn: number;
    pointsBurn: number;
  } | null>(null);
  const [receiptData, setReceiptData] = useState<{
    purchaseTotal: number;
    pointsEarn: number;
    pointsBurn: number;
    finalPayable: number;
  } | null>(null);
  const [overview, setOverview] = useState<CustomerOverview>({
    customerId: null,
    name: null,
    levelName: null,
    balance: null,
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string>('');
  const [motivationInfo, setMotivationInfo] = useState<{
    enabled: boolean;
    periodKind: string;
    periodLabel: string;
    pointsNew: number;
    pointsExisting: number;
  } | null>(null);
  const [leaderboardOutletFilter, setLeaderboardOutletFilter] = useState<string | null>(null);
  const [ratingInfoOpen, setRatingInfoOpen] = useState(false);
  const [refundHistory, setRefundHistory] = useState<RefundHistoryItem[]>([]);
  const [allowSameReceipt, setAllowSameReceipt] = useState(false);

  const [manualTokenInput, setManualTokenInput] = useState('');

  const password9 = passwordDigits;
  const normalizedLogin = merchantLogin.trim().toLowerCase().replace(/[^a-z]/g, '') || merchantLogin.trim().toLowerCase();

  useEffect(() => {
    const savedLogin = readCookie(COOKIE_LOGIN);
    if (savedLogin) setMerchantLogin(savedLogin);
    const savedPassword = readCookie(COOKIE_PASSWORD);
    if (savedPassword) setPasswordDigits(savedPassword);
    const savedPin = readCookie(COOKIE_PIN);
    if (savedPin) {
      setPinDigits(savedPin);
      setRememberPin(true);
    }
  }, []);

  const mapSessionResponse = (payload: unknown): CashierSessionInfo => {
    const raw = (payload ?? {}) as RawSessionPayload;
    const staffData = raw.staff ?? {};
    const outletData = raw.outlet ?? {};
    return {
      sessionId: String(raw.sessionId ?? ''),
      merchantId: String(raw.merchantId ?? MERCHANT ?? ''),
      staff: {
        id: String(staffData?.id ?? ''),
        role: typeof staffData?.role === 'string' ? staffData.role : 'CASHIER',
        login: typeof staffData?.login === 'string' ? staffData.login : null,
        firstName: typeof staffData?.firstName === 'string' ? staffData.firstName : null,
        lastName: typeof staffData?.lastName === 'string' ? staffData.lastName : null,
        displayName: typeof staffData?.displayName === 'string' ? staffData.displayName : null,
      },
      outlet: {
        id: String(outletData?.id ?? ''),
        name:
          typeof outletData?.name === 'string'
            ? outletData.name
            : typeof outletData?.id === 'string'
              ? outletData.id
              : null,
      },
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
      lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : null,
      rememberPin: Boolean(raw.rememberPin),
    };
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setSessionLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/loyalty/cashier/session`, {
          credentials: 'include',
        });
        if (!resp.ok) {
          if (!cancelled) setSession(null);
          return;
        }
        const data = await resp.json();
        if (cancelled) return;
        if (data?.active) {
          const info = mapSessionResponse(data);
          setSession(info);
          setMerchantId(info.merchantId || MERCHANT);
          setRememberPin(Boolean(info.rememberPin));
        } else {
          setSession(null);
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.outlet?.id) {
      setLeaderboardOutletFilter(null);
    }
  }, [session?.outlet?.id]);

  useEffect(() => {
    if (sessionLoading) return;
    if (session) {
      setMerchantId(session.merchantId || MERCHANT);
      setStep('terminal');
    } else {
      setStep(passwordDigits.length === 9 && merchantLogin.trim() ? 'pin' : 'merchant');
    }
  }, [session, sessionLoading, passwordDigits, merchantLogin]);

  useEffect(() => {
    setOrderId('O-' + Math.floor(Date.now() % 1_000_000));
  }, []);

  const emitLoyaltyEvent = (payload: {
    type: string;
    merchantId: string;
    customerId?: string | null;
    orderId?: string;
    receiptNumber?: string;
    redeemApplied?: number;
    earnApplied?: number;
    alreadyCommitted?: boolean;
    mode?: 'redeem' | 'earn';
  }) => {
    if (typeof window === 'undefined') return;
    if (!payload.type || !payload.merchantId) return;
    const enriched = {
      ...payload,
      ts: Date.now(),
    };
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(LOYALTY_EVENT_CHANNEL);
        channel.postMessage(enriched);
        channel.close();
      }
    } catch {
      /* noop */
    }
    try {
      localStorage.setItem(LOYALTY_EVENT_STORAGE_KEY, JSON.stringify(enriched));
    } catch {
      /* noop */
    }
  };

  const cashierLogin = async () => {
    setAuthMsg('');
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9) {
        throw new Error('Укажите логин мерчанта и 9‑значный пароль');
      }
      const r = await fetch(`${API_BASE}/loyalty/cashier/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantLogin: normalizedLogin, password9 }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (data?.merchantId) {
        const resolvedMerchantId = String(data.merchantId);
        setMerchantId(resolvedMerchantId);
        setStaffLookup(null);
        setMerchantLogin(normalizedLogin);
        writeCookie(COOKIE_LOGIN, normalizedLogin);
        writeCookie(COOKIE_PASSWORD, password9);
        if (!rememberPin) setPinDigits('');
      }
      setStep('pin');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAuthMsg(message);
    }
  };

  const lookupStaffByPin = async (pin: string) => {
    setAuthMsg('');
    if (!pin || pin.length !== 4) return;
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9) {
        throw new Error('Сначала выполните вход мерчанта');
      }
      setPinDigits(pin);
      const r = await fetch(`${API_BASE}/loyalty/cashier/staff-access`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantLogin: normalizedLogin,
          password9,
          pinCode: pin,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const accesses = Array.isArray(data?.accesses) ? data.accesses : [];
      const outletInfo =
        data?.outlet && data.outlet.id
          ? {
              id: String(data.outlet.id),
              name: typeof data.outlet.name === 'string' ? data.outlet.name : String(data.outlet.id),
            }
          : undefined;
      setStaffLookup({
        staff: {
          id: data?.staff?.id,
          login: data?.staff?.login,
          firstName: data?.staff?.firstName,
          lastName: data?.staff?.lastName,
          role: data?.staff?.role,
        },
        outlet: outletInfo,
        accesses,
      });
      if (rememberPin) writeCookie(COOKIE_PIN, pin);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAuthMsg(message);
    }
  };

  const startCashierSessionAuth = async () => {
    setAuthMsg('');
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9) {
        throw new Error('Сначала войдите как мерчант (логин/пароль 9 цифр)');
      }
      if (!pinDigits || pinDigits.length !== 4) {
        throw new Error('Введите PIN сотрудника');
      }
      const r = await fetch(`${API_BASE}/loyalty/cashier/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantLogin: normalizedLogin,
          password9,
          pinCode: pinDigits,
          rememberPin,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const sessionInfo = mapSessionResponse(data);
      setSession(sessionInfo);
      setMerchantId(sessionInfo.merchantId || MERCHANT);
      setRememberPin(Boolean(sessionInfo.rememberPin));
      writeCookie(COOKIE_LOGIN, normalizedLogin);
      writeCookie(COOKIE_PASSWORD, password9);
      if (rememberPin) {
        writeCookie(COOKIE_PIN, pinDigits);
      } else {
        deleteCookie(COOKIE_PIN);
      }
      setAuthMsg('');
      setStep('terminal');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAuthMsg(message);
    }
  };

  const logoutStaff = async () => {
    try {
      await fetch(`${API_BASE}/loyalty/cashier/session`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      /* ignore */
    }
    setSession(null);
    setStaffLookup(null);
    if (!rememberPin) {
      setPinDigits('');
      deleteCookie(COOKIE_PIN);
    } else {
      const savedPin = readCookie(COOKIE_PIN);
      if (savedPin) setPinDigits(savedPin);
    }
    setRememberPin(Boolean(readCookie(COOKIE_PIN)));
    setStep(passwordDigits.length === 9 && merchantLogin.trim() ? 'pin' : 'merchant');
    resetFlow();
  };

  const callQuote = async (
    overrides?: Partial<{ total: number; mode: 'redeem' | 'earn'; receiptNumber: string }>,
  ): Promise<QuoteRedeemResp | QuoteEarnResp | null> => {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return null;
    }
    setBusy(true);
    const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    setResult(null);
    setHoldId(null);
    const totalToSend = overrides?.total ?? total;
    const modeToSend = overrides?.mode ?? mode;
    const receiptToSend = overrides?.receiptNumber ?? receiptNumber;
    try {
      const activeMerchantId = session?.merchantId || merchantId;
      const activeOutletId = session?.outlet?.id || undefined;
      const activeStaffId = session?.staff?.id || undefined;
      const r = await fetch(`${API_BASE}/loyalty/quote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({
          merchantId: activeMerchantId,
          mode: modeToSend,
          userToken,
          orderId,
          total: totalToSend,
          outletId: activeOutletId || undefined,
          staffId: activeStaffId || undefined,
          receiptNumber: receiptToSend || undefined,
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || r.statusText);
      }
      const data = await r.json();
      setResult(data);
      const holdCandidate = (data as { holdId?: unknown } | null)?.holdId;
      setHoldId(typeof holdCandidate === 'string' ? holdCandidate : null);
      return data;
    } catch (e: unknown) {
      const err = e as { message?: unknown } | undefined;
      const msg = String(err?.message ?? e ?? '');
      setScanOpen(false);
      if (msg.includes('QR токен уже использован')) {
        alert('Этот QR уже использован. Попросите клиента обновить QR в мини-аппе.');
      } else if (msg.includes('ERR_JWT_EXPIRED') || msg.includes('JWTExpired') || msg.includes('"exp"')) {
        alert('QR истёк по времени. Попросите клиента обновить QR в мини-аппе и отсканируйте заново.');
      } else if (msg.includes('другого мерчанта')) {
        alert('QR выписан для другого мерчанта.');
      } else {
        alert('Ошибка расчёта: ' + msg);
      }
      return null;
    } finally {
      setBusy(false);
    }
  };

  const callCommit = async () => {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return null;
    }
    if (!holdId) {
      alert('Сначала сделайте расчёт.');
      return null;
    }
    setBusy(true);
    const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    try {
      const normalizedReceiptNumber = receiptNumber.trim();
      const activeMerchantId = session?.merchantId || merchantId;
      const activeOutletId = session?.outlet?.id || undefined;
      const activeStaffId = session?.staff?.id || undefined;
      const r = await fetch(`${API_BASE}/loyalty/commit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({
          merchantId: activeMerchantId,
          holdId,
          orderId,
          outletId: activeOutletId || undefined,
          staffId: activeStaffId || undefined,
          receiptNumber: normalizedReceiptNumber ? normalizedReceiptNumber : undefined,
          requestId,
        }),
      });
      if (!r.ok) {
        throw new Error(await r.text());
      }
      const data = await r.json();
      if (typeof data?.customerId === 'string') {
        setCustomerId(data.customerId);
      }
      if (data?.ok) {
        emitLoyaltyEvent({
          type: 'loyalty.commit',
          merchantId: activeMerchantId,
          customerId: resolveCustomerIdFromToken(userToken),
          orderId,
          receiptNumber: normalizedReceiptNumber || undefined,
          redeemApplied: typeof data?.redeemApplied === 'number' ? data.redeemApplied : undefined,
          earnApplied: typeof data?.earnApplied === 'number' ? data.earnApplied : undefined,
          alreadyCommitted: Boolean(data?.alreadyCommitted),
          mode,
        });
        setHoldId(null);
        setResult(null);
        setOrderId('O-' + Math.floor(Math.random() * 100000));
        return data;
      }
      alert('Commit вернул неуспех: ' + JSON.stringify(data));
      return null;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Ошибка commit: ' + message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const loadCustomerBalance = async (customerId: string, merchant: string): Promise<number | null> => {
    try {
      const r = await fetch(`${API_BASE}/loyalty/balance/${merchant}/${encodeURIComponent(customerId)}`, {
        credentials: 'include',
      });
      if (!r.ok) return null;
      const data = await r.json();
      if (typeof data?.balance === 'number') return data.balance;
      return null;
    } catch {
      return null;
    }
  };

  const loadCustomerLevel = async (merchant: string, customerId: string): Promise<string | null> => {
    try {
      const r = await fetch(`${API_BASE}/levels/${merchant}/${encodeURIComponent(customerId)}`, {
        credentials: 'include',
      });
      if (!r.ok) return null;
      const data = await r.json();
      const levelName = data?.current?.name ?? data?.level?.name ?? null;
      return levelName ? String(levelName) : null;
    } catch {
      return null;
    }
  };

  const fetchCustomerOverview = async (token: string) => {
    const merchant = session?.merchantId || merchantId;
    if (!merchant) return;
    const fallbackName = extractNameFromToken(token);
    try {
      const r = await fetch(`${API_BASE}/loyalty/cashier/customer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: merchant, userToken: token }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || r.statusText);
      }
      const data = await r.json();
      const resolvedCustomerId =
        typeof data?.customerId === 'string' && data.customerId.trim().length > 0
          ? data.customerId.trim()
          : null;
      const nameFromApi =
        typeof data?.name === 'string' && data.name.trim().length > 0
          ? data.name.trim()
          : null;
      setCustomerId(resolvedCustomerId);
      const balanceHint =
        typeof data?.balance === 'number' ? data.balance : null;
      const balancePromise =
        resolvedCustomerId != null
          ? balanceHint != null
            ? Promise.resolve(balanceHint)
            : loadCustomerBalance(resolvedCustomerId, merchant)
          : Promise.resolve<number | null>(null);
      const levelPromise =
        resolvedCustomerId != null
          ? loadCustomerLevel(merchant, resolvedCustomerId)
          : Promise.resolve<string | null>(null);
      const [balance, levelName] = await Promise.all([
        balancePromise,
        levelPromise,
      ]);
      setOverview({
        customerId: resolvedCustomerId,
        name: nameFromApi ?? fallbackName ?? null,
        levelName,
        balance,
      });
    } catch (e: unknown) {
      setCustomerId(null);
      setOverview({
        customerId: null,
        name: fallbackName ?? null,
        levelName: null,
        balance: null,
      });
      const message = e instanceof Error ? e.message : String(e);
      alert('Не удалось загрузить данные клиента: ' + message);
    }
  };

  const resetFlow = () => {
    setFlowStep('idle');
    setPurchaseAmountInput('');
    setReceiptInput('');
    setSelectedPoints(0);
    setLastRequestedRedeem(0);
    setQuoteError('');
    setConfirmSnapshot(null);
    setReceiptData(null);
    setResult(null);
    setHoldId(null);
    setCustomerId(null);
    setOverview({ customerId: null, name: null, levelName: null, balance: null });
    setUserToken('');
    setManualTokenInput('');
    setReceiptNumber('');
    setTotal(0);
  };

  const beginFlow = async (token: string) => {
    setUserToken(token);
    setCustomerId(null);
    setOverview({ customerId: null, name: null, levelName: null, balance: null });
    setManualTokenInput('');
    setFlowStep('details');
    setPurchaseAmountInput('');
    setReceiptInput('');
    setSelectedPoints(0);
    setLastRequestedRedeem(0);
    setQuoteError('');
    setConfirmSnapshot(null);
    setReceiptData(null);
    setResult(null);
    setHoldId(null);
    await fetchCustomerOverview(token);
  };

  const handleDetailsContinue = async () => {
    setQuoteError('');
    const parsedAmount = Number(purchaseAmountInput.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setQuoteError('Введите сумму покупки больше нуля.');
      return;
    }
    setTotal(parsedAmount);
    setReceiptNumber(receiptInput.trim());
    if (mode === 'redeem') {
      const quote = await callQuote({
        total: parsedAmount,
        mode: 'redeem',
        receiptNumber: receiptInput.trim(),
      });
      if (!quote) return;
      const maxRedeem = (quote as QuoteRedeemResp)?.pointsToBurn ?? 0;
      setSelectedPoints(maxRedeem);
      setLastRequestedRedeem(maxRedeem);
      setFlowStep('points');
    } else {
      const quote = await callQuote({
        total: parsedAmount,
        mode: 'earn',
        receiptNumber: receiptInput.trim(),
      });
      if (!quote) return;
      const earn = (quote as QuoteEarnResp)?.pointsToEarn ?? 0;
      setConfirmSnapshot({
        purchaseTotal: parsedAmount,
        finalPayable: parsedAmount,
        pointsEarn: earn,
        pointsBurn: 0,
      });
      setFlowStep('confirm');
    }
  };

  const handlePointsSubmit = async (redeemAll: boolean) => {
    if (mode !== 'redeem') return;
    const quote = result as QuoteRedeemResp | null;
    const maxRedeem = quote?.pointsToBurn ?? 0;
    const desired = redeemAll ? maxRedeem : Math.min(selectedPoints, maxRedeem);
    const normalized = Number.isFinite(desired) && desired > 0 ? Math.round(desired) : 0;
    setSelectedPoints(normalized);
    if (normalized === 0) {
      const earnOnly = await callQuote({
        total,
        mode: 'earn',
        receiptNumber,
      });
      if (!earnOnly) return;
      const earn = (earnOnly as QuoteEarnResp)?.pointsToEarn ?? 0;
      setConfirmSnapshot({
        purchaseTotal: total,
        finalPayable: total,
        pointsEarn: earn,
        pointsBurn: 0,
      });
      setMode('earn');
      setFlowStep('confirm');
      return;
    }

    let effectiveQuote = (result as QuoteRedeemResp) ?? null;
    let redeemToUse = normalized;
    if (normalized !== lastRequestedRedeem) {
      const updated = await callQuote({
        total,
        mode: 'redeem',
        receiptNumber,
      });
      if (!updated) return;
      effectiveQuote = updated as QuoteRedeemResp;
      const updatedRedeem = effectiveQuote.pointsToBurn ?? normalized;
      redeemToUse = updatedRedeem;
      setSelectedPoints(updatedRedeem);
      setLastRequestedRedeem(updatedRedeem);
    }

    const finalPayable =
      typeof effectiveQuote?.finalPayable === 'number'
        ? effectiveQuote.finalPayable
        : Math.max(total - redeemToUse, 0);
    setConfirmSnapshot({
      purchaseTotal: total,
      finalPayable,
      pointsEarn: 0,
      pointsBurn: redeemToUse,
    });
    setFlowStep('confirm');
  };

  const handleConfirm = async () => {
    const data = await callCommit();
    if (!data) return;
    const appliedRedeem = typeof data?.redeemApplied === 'number' ? data.redeemApplied : selectedPoints;
    const appliedEarn = typeof data?.earnApplied === 'number' ? data.earnApplied : 0;
    setReceiptData({
      purchaseTotal: total,
      pointsEarn: appliedEarn,
      pointsBurn: appliedRedeem,
      finalPayable: typeof data?.finalPayable === 'number' ? data.finalPayable : total - appliedRedeem,
    });
    setFlowStep('receipt');
    await fetchCustomerOverview(userToken);
    loadHistory(true);
  };

  const handleReceiptClose = () => {
    setReceiptData(null);
    resetFlow();
  };

  const loadHistory = async (reset = false) => {
    if (histBusy) return;
    const activeMerchantId = session?.merchantId || merchantId;
    const outletId = session?.outlet?.id || null;
    if (!activeMerchantId || !outletId) return;
    setHistBusy(true);
    try {
      const url = new URL(`${API_BASE}/loyalty/cashier/outlet-transactions`);
      url.searchParams.set('merchantId', activeMerchantId);
      url.searchParams.set('outletId', outletId);
      url.searchParams.set('limit', '20');
      if (!reset && histNextBefore) url.searchParams.set('before', histNextBefore);
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || r.statusText);
      }
      const data = await r.json();
      const items: Txn[] = Array.isArray(data.items) ? data.items : [];
      setAllowSameReceipt(Boolean(data.allowSameReceipt));
      setHistory((old) => (reset ? items : [...old, ...items]));
      setHistNextBefore(typeof data.nextBefore === 'string' ? data.nextBefore : null);
      if (reset) {
        const refunds = items
          .filter((i) => i.mode === 'REFUND')
          .map((i) => ({
            id: i.id,
            createdAt: i.createdAt,
            amount: i.refundRedeem ?? i.amount ?? 0,
            receiptNumber: i.receiptNumber ?? null,
          }));
        setRefundHistory(refunds);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Ошибка истории: ' + message);
    } finally {
      setHistBusy(false);
    }
  };

  useEffect(() => {
    setHistory([]);
    setRefundHistory([]);
    setHistNextBefore(null);
  }, [session?.outlet?.id, session?.merchantId, merchantId]);

  const loadRefundPreview = async () => {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    const code = refundReceiptNumber.trim();
    if (!code) {
      setRefundError('Укажите номер чека или ID операции');
      setRefundPreview(null);
      return;
    }
    const activeMerchantId = session?.merchantId || merchantId;
    const outletId = session?.outlet?.id || null;
    if (!outletId) {
      setRefundError('Нет выбранной торговой точки');
      setRefundPreview(null);
      return;
    }
    setRefundBusy(true);
    setRefundError('');
    setRefundPreview(null);
    try {
      let found: Txn | null = null;
      let nextBefore: string | null = null;
      // Поиск чека по истории точки (несколько страниц на всякий случай)
      for (let page = 0; page < 5 && !found; page += 1) {
        const url = new URL(`${API_BASE}/loyalty/cashier/outlet-transactions`);
        url.searchParams.set('merchantId', activeMerchantId);
        url.searchParams.set('outletId', outletId);
        url.searchParams.set('limit', '50');
        if (nextBefore) url.searchParams.set('before', nextBefore);
        const r = await fetch(url.toString(), { credentials: 'include' });
        if (!r.ok) {
          const text = await r.text();
          throw new Error(text || r.statusText);
        }
        const data = await r.json();
        const items: Txn[] = Array.isArray(data.items) ? data.items : [];
        found =
          items.find(
            (i) =>
              i.mode === 'PURCHASE' &&
              (i.receiptNumber === code || (i.orderId ?? '').trim() === code),
          ) ?? null;
        if (found) break;
        nextBefore =
          typeof data.nextBefore === 'string' && data.nextBefore
            ? data.nextBefore
            : null;
        if (!nextBefore) break;
      }
      if (!found) {
        setRefundError('Чек с таким номером или ID операции не найден');
        setRefundPreview(null);
        return;
      }
      const purchaseAmount = found.purchaseAmount ?? 0;
      const pointsToRestore = Math.max(0, found.redeemApplied ?? 0);
      const pointsToRevoke = Math.max(0, found.earnApplied ?? 0);
      setRefundPreview({
        receiptId: found.id,
        orderId: found.orderId ?? null,
        receiptNumber: found.receiptNumber ?? null,
        customerName: found.customerName ?? null,
        purchaseAmount,
        pointsToRestore,
        pointsToRevoke,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setRefundError(message || 'Не удалось получить данные по чеку');
      setRefundPreview(null);
    } finally {
      setRefundBusy(false);
    }
  };

  const doRefund = async () => {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    const code = refundReceiptNumber.trim();
    if (!code) {
      setRefundError('Укажите номер чека или ID операции');
      return;
    }
    const preview = refundPreview;
    if (!preview) {
      await loadRefundPreview();
      if (!refundPreview) return;
    }
    const effective = preview ?? refundPreview!;
    const activeMerchantId = session?.merchantId || merchantId;
    setRefundBusy(true);
    setRefundError('');
    try {
      const r = await fetch(`${API_BASE}/loyalty/refund`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: activeMerchantId,
          invoice_num: effective.orderId || code,
          order_id: effective.orderId || undefined,
          receiptNumber: effective.receiptNumber || code,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (typeof data?.customerId === 'string') {
        setCustomerId(data.customerId);
      }
      setRefundReceiptNumber('');
      setRefundPreview(null);
      loadHistory(true);
      alert('Возврат выполнен. Баллы пересчитаны.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setRefundError(message || 'Ошибка возврата');
    } finally {
      setRefundBusy(false);
    }
  };

  const loadLeaderboard = useCallback(async () => {
    if (!session) {
      setLeaderboard([]);
      setMotivationInfo(null);
      return;
    }
    setLeaderboardLoading(true);
    setLeaderboardError('');
    try {
      const url = new URL(`${API_BASE}/loyalty/cashier/leaderboard`);
      url.searchParams.set('merchantId', session.merchantId);
      if (leaderboardOutletFilter) {
        url.searchParams.set('outletId', leaderboardOutletFilter);
      }
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const settings: LeaderboardSettings = data?.settings ?? {};
      const period: LeaderboardPeriod = data?.period ?? {};
      const periodKind =
        typeof period?.kind === 'string'
          ? period.kind
          : typeof settings?.leaderboardPeriod === 'string'
            ? settings.leaderboardPeriod
            : 'week';
      const periodLabel =
        typeof period?.label === 'string'
          ? period.label
          : buildMotivationPeriodLabel(
              periodKind,
              period?.customDays ?? settings?.customDays ?? null,
            );
      const info = {
        enabled: Boolean(data?.enabled),
        periodKind,
        periodLabel,
        pointsNew: Number(
          settings?.pointsForNewCustomer ?? MOTIVATION_DEFAULT_NEW_POINTS,
        ),
        pointsExisting: Number(
          settings?.pointsForExistingCustomer ??
            MOTIVATION_DEFAULT_EXISTING_POINTS,
        ),
      };
      setMotivationInfo(info);
      const items: RawLeaderboardItem[] = Array.isArray(data?.items)
        ? data.items
        : [];
      const entries: LeaderboardEntry[] = items.map((item) => ({
        staffId: String(item.staffId ?? ''),
        staffName:
          typeof item.staffName === 'string'
            ? item.staffName
            : typeof item.staffDisplayName === 'string'
              ? item.staffDisplayName
              : typeof item.staffLogin === 'string'
                ? item.staffLogin
                : '—',
        outletName:
          typeof item.outletName === 'string' ? item.outletName : null,
        points: Number(item.points ?? 0),
      }));
      entries.sort((a, b) => b.points - a.points);
      setLeaderboard(entries);
    } catch (e: unknown) {
      setLeaderboard([]);
      setMotivationInfo(null);
      const message = e instanceof Error ? e.message : String(e ?? '');
      setLeaderboardError(message || 'Не удалось загрузить рейтинг');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [session, leaderboardOutletFilter]);

  useEffect(() => {
    if (activeTab === 'rating') {
      void loadLeaderboard();
    }
  }, [activeTab, loadLeaderboard]);

  const scanHandledRef = useRef(false);
  useEffect(() => {
    if (scanOpen) scanHandledRef.current = false;
  }, [scanOpen]);

  const scannedTokensRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('scannedQrKeys_v1');
      if (raw) scannedTokensRef.current = new Set(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);
  const saveScanned = () => {
    try {
      sessionStorage.setItem('scannedQrKeys_v1', JSON.stringify(Array.from(scannedTokensRef.current)));
    } catch {
      /* noop */
    }
  };

  const onScan = async (text: string) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    setScanOpen(false);
    const key = qrKeyFromToken(text);
    if (scannedTokensRef.current.has(key)) {
      alert('Этот QR уже сканирован. Попросите клиента обновить QR в мини-аппе.');
      return;
    }
    scannedTokensRef.current.add(key);
    saveScanned();
    await beginFlow(text);
  };

  const staffName = useMemo(() => {
    if (!session) return '';
    return (
      session.staff.displayName?.trim() ||
      [session.staff.firstName, session.staff.lastName].filter(Boolean).join(' ') ||
      session.staff.login ||
      session.staff.id
    );
  }, [session]);

  const outletName = useMemo(() => {
    if (!session) return '';
    return session.outlet.name || session.outlet.id || '';
  }, [session]);

  const pageTitle = useMemo(() => {
    if (activeTab === 'history') return 'История операций';
    if (activeTab === 'rating') return 'Рейтинг сотрудников';
    if (activeTab === 'returns') return 'Возвраты по чекам';
    switch (flowStep) {
      case 'details':
        return 'Оформление покупки';
      case 'points':
        return 'Списание баллов';
      case 'confirm':
        return 'Подтверждение операции';
      case 'receipt':
        return 'Чек операции';
      default:
        return 'Главная';
    }
  }, [activeTab, flowStep]);

  const renderAuth = () => (
    <div className="flex flex-col min-h-screen bg-slate-900 text-white">
      <div className="flex-1 flex flex-col px-6 py-8">
        <div className="mt-8">
          <h1 className="text-3xl font-semibold">Терминал кассира</h1>
          <p className="text-sm text-slate-300 mt-2">Авторизуйтесь, чтобы начать обслуживание клиентов.</p>
        </div>
        <div className="mt-10 space-y-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <span className={step === 'merchant' ? 'text-white' : ''}>1. Мерчант</span>
            <span className="opacity-40">•</span>
            <span className={step === 'pin' ? 'text-white' : ''}>2. PIN</span>
            <span className="opacity-40">•</span>
            <span className={step === 'terminal' ? 'text-white' : ''}>3. Терминал</span>
          </div>
          {step === 'merchant' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Логин мерчанта</label>
                <input
                  value={merchantLogin}
                  onChange={(e) => setMerchantLogin(e.target.value)}
                  placeholder="Например, greenmarket"
                  className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Пароль (9 цифр)</label>
                <SegmentedInput length={9} groupSize={3} value={passwordDigits} onChange={setPasswordDigits} placeholderChar="○" autoFocus />
              </div>
              <button
                onClick={cashierLogin}
                disabled={!merchantLogin.trim() || passwordDigits.length !== 9}
                className="w-full rounded-full bg-emerald-400 py-3 text-slate-900 font-semibold disabled:opacity-30"
              >
                Продолжить
              </button>
              {authMsg && <div className="text-sm text-red-400">{authMsg}</div>}
            </div>
          )}
          {step === 'pin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-sm text-slate-400">
                <div>Логин: <span className="text-white">{normalizedLogin || '—'}</span></div>
                <button className="text-emerald-300" onClick={() => { setStaffLookup(null); setStep('merchant'); }}>Изменить</button>
              </div>
              <div className="space-y-3">
                <label className="text-sm text-slate-300">PIN сотрудника</label>
                <SegmentedInput
                  length={4}
                  value={pinDigits}
                  onChange={(val) => {
                    setPinDigits(val);
                    if (val.length < 4) setStaffLookup(null);
                  }}
                  onComplete={lookupStaffByPin}
                  placeholderChar="○"
                />
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <button
                    onClick={() => lookupStaffByPin(pinDigits)}
                    disabled={pinDigits.length !== 4}
                    className="rounded-full border border-slate-700 px-4 py-2 disabled:opacity-30"
                  >
                    Проверить PIN
                  </button>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-emerald-400"
                      checked={rememberPin}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRememberPin(checked);
                        if (checked && pinDigits.length === 4) {
                          writeCookie(COOKIE_PIN, pinDigits);
                        } else if (!checked) {
                          deleteCookie(COOKIE_PIN);
                        }
                      }}
                    />
                    <span>Сохранить PIN</span>
                  </label>
                </div>
              </div>
              {staffLookup && (
                <div className="rounded-3xl bg-slate-800 p-4 space-y-2">
                  <div className="text-xs text-slate-400">Сотрудник</div>
                  <div className="text-lg font-semibold">
                    {[staffLookup.staff.firstName, staffLookup.staff.lastName].filter(Boolean).join(' ') ||
                      staffLookup.staff.login ||
                      staffLookup.staff.id}
                  </div>
                  <div className="text-xs text-emerald-300">{staffLookup.staff.role}</div>
                  {staffLookup.outlet && (
                    <div className="text-sm text-slate-300">Точка: {staffLookup.outlet.name}</div>
                  )}
                  {staffLookup.accesses?.length ? (
                    <div className="text-xs text-slate-400">
                      Доступ к {staffLookup.accesses.length} точкам
                    </div>
                  ) : null}
                </div>
              )}
              <button
                onClick={startCashierSessionAuth}
                disabled={!staffLookup}
                className="w-full rounded-full bg-emerald-400 py-3 text-slate-900 font-semibold disabled:opacity-30"
              >
                Продолжить в терминал
              </button>
              {authMsg && <div className="text-sm text-red-400">{authMsg}</div>}
            </div>
          )}
        </div>
      </div>
      <div className="px-6 pb-8 text-xs text-slate-500">© {new Date().getFullYear()} Программа лояльности</div>
    </div>
  );

  const renderHomeTab = () => (
    <div className="flex-1 overflow-y-auto px-6 pb-32">
      <div className="mt-6 space-y-6">
        {flowStep === 'idle' && (
          <div className="rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 shadow-xl">
            <div className="text-sm text-slate-400">Сотрудник</div>
            <div className="text-xl font-semibold text-white">{staffName}</div>
            <div className="text-sm text-slate-400 mt-3">Торговая точка</div>
            <div className="text-base text-white">{outletName || '—'}</div>
          </div>
        )}

        {flowStep === 'idle' && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-slate-800/80 backdrop-blur p-6 text-center">
              <p className="text-sm text-slate-300">Чтобы начать, отсканируйте QR клиента или введите токен вручную.</p>
            </div>
            <button
              onClick={() => setScanOpen(true)}
              className="mx-auto flex h-48 w-48 items-center justify-center rounded-full bg-emerald-400 text-slate-900 text-lg font-semibold shadow-emerald-500/40 shadow-lg"
            >
              Сканировать QR
            </button>
            <div className="rounded-3xl bg-slate-800/80 backdrop-blur p-6 space-y-4">
              <div className="text-sm text-slate-300">Ручной ввод токена</div>
              <div className="flex items-center gap-3">
                <input
                  value={manualTokenInput}
                  onChange={(e) => setManualTokenInput(e.target.value)}
                  placeholder="Вставьте токен клиента"
                  className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => manualTokenInput.trim() && beginFlow(manualTokenInput.trim())}
                  className="rounded-full bg-emerald-500 px-4 py-3 text-slate-900 text-sm font-semibold"
                >
                  Продолжить
                </button>
              </div>
            </div>
          </div>
        )}

        {flowStep !== 'idle' && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-slate-800/60 backdrop-blur p-6 space-y-4">
              <div className="text-sm text-slate-300">Информация о клиенте</div>
              <div className="text-lg font-semibold text-white">{overview.name || 'Имя неизвестно'}</div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Уровень</span>
                <span className="font-medium text-emerald-300">{overview.levelName || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Баланс</span>
                <span className="font-medium text-white">{formatCurrency(overview.balance)}</span>
              </div>
            </div>

            {flowStep === 'details' && (
              <div className="rounded-3xl bg-slate-800/60 backdrop-blur p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Сумма покупки</label>
                  <input
                    inputMode="decimal"
                    value={purchaseAmountInput}
                    onChange={(e) => setPurchaseAmountInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Номер чека</label>
                  <input
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                    placeholder="Например, 123456"
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-2 bg-slate-900 rounded-2xl p-1">
                  <button
                    onClick={() => setMode('redeem')}
                    className={`flex-1 rounded-2xl py-3 text-sm font-semibold ${mode === 'redeem' ? 'bg-emerald-500 text-slate-900' : 'text-slate-400'}`}
                  >
                    Списание баллов
                  </button>
                  <button
                    onClick={() => setMode('earn')}
                    className={`flex-1 rounded-2xl py-3 text-sm font-semibold ${mode === 'earn' ? 'bg-emerald-500 text-slate-900' : 'text-slate-400'}`}
                  >
                    Только начисление
                  </button>
                </div>
                {quoteError && <div className="text-sm text-red-400">{quoteError}</div>}
                <div className="flex gap-3">
                  <button
                    onClick={resetFlow}
                    className="flex-1 rounded-full border border-slate-600 py-3 text-sm font-semibold text-slate-300"
                  >
                    Отменить
                  </button>
                  <button
                    onClick={handleDetailsContinue}
                    disabled={busy}
                    className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
                  >
                    Продолжить
                  </button>
                </div>
              </div>
            )}

            {flowStep === 'points' && (
              <div className="rounded-3xl bg-slate-800/60 backdrop-blur p-6 space-y-5">
                <div className="text-sm text-slate-300">Доступно для оплаты</div>
                <div className="text-3xl font-semibold text-white">
                  {formatCurrency((result as QuoteRedeemResp)?.discountToApply ?? selectedPoints)}
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Баллов к списанию</span>
                  <button
                    onClick={() => handlePointsSubmit(true)}
                    disabled={busy}
                    className="text-emerald-300 font-medium disabled:opacity-40"
                  >
                    СПИСАТЬ ВСЕ
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">СПИСАТЬ БАЛЛЫ</label>
                  <div className="flex items-center gap-3">
                    <input
                      inputMode="numeric"
                      value={selectedPoints ? String(selectedPoints) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const next = Number(raw);
                        if (!Number.isFinite(next)) return;
                        const max = (result as QuoteRedeemResp)?.pointsToBurn ?? 0;
                        setSelectedPoints(Math.min(next, max));
                      }}
                      placeholder="0"
                      className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-400">☆</span>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Можно использовать: {formatPoints((result as QuoteRedeemResp)?.pointsToBurn ?? 0)} баллов
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setFlowStep('details')}
                    className="flex-1 rounded-full border border-slate-600 py-3 text-sm font-semibold text-slate-300"
                  >
                    Назад
                  </button>
                  <button
                    onClick={() => handlePointsSubmit(false)}
                    disabled={busy}
                    className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
                  >
                    {selectedPoints > 0 ? 'СПИСАТЬ' : 'НЕ СПИСЫВАТЬ'}
                  </button>
                </div>
              </div>
            )}

            {flowStep === 'confirm' && confirmSnapshot && (
              <div className="rounded-3xl bg-slate-800/60 backdrop-blur p-6 space-y-4">
                <div className="text-sm text-slate-300">Подтвердите операцию</div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span>Сумма покупки</span>
                    <span className="text-white font-semibold">{formatCurrency(confirmSnapshot.purchaseTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Клиенту будет начислено</span>
                    <span className="text-emerald-300 font-semibold">{formatPoints(confirmSnapshot.pointsEarn)} баллов</span>
                  </div>
                  <div className="flex justify-between">
                    <span>С клиента будет списано</span>
                    <span className="text-orange-300 font-semibold">{formatPoints(confirmSnapshot.pointsBurn)} баллов</span>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setFlowStep(mode === 'redeem' ? 'points' : 'details')}
                    className="flex-1 rounded-full border border-slate-600 py-3 text-sm font-semibold text-slate-300"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={busy}
                    className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
                  >
                    ОК
                  </button>
                </div>
              </div>
            )}

            {flowStep === 'receipt' && receiptData && (
              <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-8 shadow-2xl">
                <div className="absolute left-1/2 top-0 h-6 w-24 -translate-x-1/2 rounded-b-full bg-slate-800" />
                <div className="animate-[receipt_0.6s_ease-out]">
                  <div className="text-center text-sm text-slate-400">ИТОГО</div>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <div>
                      <div className="uppercase text-xs tracking-wider text-slate-500">Покупатель</div>
                      <div className="text-white font-semibold">{overview.name || '—'}</div>
                    </div>
                    <div>
                      <div className="uppercase text-xs tracking-wider text-slate-500">Сотрудник</div>
                      <div className="text-white font-semibold">{staffName || '—'}</div>
                    </div>
                    <div className="border-t border-dashed border-slate-700 pt-3 mt-3 space-y-2">
                      <div className="flex justify-between">
                        <span>Сумма покупки</span>
                        <span className="text-white">{formatCurrency(receiptData.purchaseTotal)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-300">
                        <span>Начислено баллов</span>
                        <span>{formatPoints(receiptData.pointsEarn)}</span>
                      </div>
                      <div className="flex justify-between text-orange-300">
                        <span>Списано баллов</span>
                        <span>{formatPoints(receiptData.pointsBurn)}</span>
                      </div>
                    </div>
                    <div className="border-t border-dashed border-slate-700 pt-3 mt-3 flex justify-between text-lg font-semibold text-white">
                      <span>К ОПЛАТЕ</span>
                      <span>{formatCurrency(receiptData.finalPayable)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleReceiptClose}
                  className="mt-6 w-full rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryTab = () => {
    const outletName =
      session?.outlet?.name || session?.outlet?.id || 'ваша торговая точка';
    return (
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        <div className="mt-6 space-y-4">
          <div className="rounded-3xl bg-slate-800/60 p-4 text-sm text-slate-300">
            История операций по точке: <span className="text-white">{outletName}</span>
          </div>
          <button
            onClick={() => loadHistory(true)}
            disabled={histBusy || !session?.outlet?.id}
            className="w-full rounded-full bg-slate-800 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Загрузить историю
          </button>
          {!session?.outlet?.id && (
            <div className="text-xs text-slate-500">
              История станет доступна после выбора торговой точки.
            </div>
          )}
          <div className="space-y-4">
            {history.map((item) => {
              const isPurchase = item.mode === 'PURCHASE';
              const isRefund = item.mode === 'REFUND';
              const isTx = item.mode === 'TXN';
              const isEarn = item.type === 'EARN';
              const isRedeem = item.type === 'REDEEM';
              const typeLabel = isPurchase
                ? 'Покупка'
                : isRefund
                  ? 'Возврат'
                  : isEarn
                    ? 'Начисление'
                    : isRedeem
                      ? 'Списание'
                      : item.type || 'Операция';
              const color =
                isPurchase || isEarn
                  ? 'text-emerald-300'
                  : isRefund || isRedeem
                    ? 'text-orange-300'
                    : 'text-slate-100';
              const bg =
                isPurchase || isEarn
                  ? 'bg-emerald-500/10'
                  : isRefund || isRedeem
                    ? 'bg-orange-500/10'
                    : 'bg-slate-700/50';
              const amount = item.amount ?? 0;
              const topAmount = isPurchase || isRefund
                ? item.purchaseAmount ?? amount
                : amount;
              const sign = isPurchase || isRefund ? '' : topAmount > 0 ? '+' : '';

              return (
                <div
                  key={item.id}
                  className="space-y-3 rounded-3xl bg-slate-900/60 border border-slate-800 p-4"
                >
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span className="text-xs text-slate-500">
                      {item.receiptNumber ? `Чек ${item.receiptNumber}` : 'Чек не указан'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${bg} ${color}`}
                    >
                      {typeLabel}
                    </div>
                    <div
                      className={`text-base font-semibold ${
                        isPurchase ? 'text-white' : color
                      }`}
                    >
                      {sign}
                      {formatCurrency(Math.abs(topAmount))}
                    </div>
                  </div>

                  {(isPurchase || isRefund) && (() => {
                    const redeemVal = Math.abs(
                      isRefund
                        ? item.refundRedeem ?? 0
                        : item.redeemApplied ?? 0,
                    );
                    const earnVal = Math.abs(
                      isRefund ? item.refundEarn ?? 0 : item.earnApplied ?? 0,
                    );
                    const sections: Array<{
                      label: string;
                      value: number;
                      colorClass: string;
                    }> = [];
                    if (redeemVal > 0) {
                      sections.push({
                        label: isRefund ? 'Возврат списаний' : 'Списано баллов',
                        value: redeemVal,
                        colorClass: 'text-orange-200',
                      });
                    }
                    if (earnVal > 0) {
                      sections.push({
                        label: isRefund ? 'Возврат начислений' : 'Начислено баллов',
                        value: earnVal,
                        colorClass: 'text-emerald-200',
                      });
                    }
                    if (!sections.length) return null;
                    return (
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                        {sections.map((section) => (
                          <div key={section.label}>
                            <div className="text-slate-500">{section.label}</div>
                            <div className={section.colorClass}>
                              {formatPoints(section.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {isTx && (
                    <div className="text-xs text-slate-500 space-y-1">
                      {isEarn && amount !== 0 && (
                        <div>Начислено {formatPoints(Math.abs(amount))} баллов</div>
                      )}
                      {isRedeem && amount !== 0 && (
                        <div>Списано {formatPoints(Math.abs(amount))} баллов</div>
                      )}
                      {item.type === 'REFUND' && amount !== 0 && (
                        <div>Возврат на {formatPoints(Math.abs(amount))} баллов</div>
                      )}
                    </div>
                  )}

                  {(item.staffName || item.customerName) && (
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60 mt-2">
                      <span>Сотрудник: {item.staffName || '—'}</span>
                      <span>Клиент: {item.customerName || '—'}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {!history.length && (
              <div className="text-sm text-slate-400">Нет операций по этой точке.</div>
            )}
            {histNextBefore && (
              <button
                onClick={() => loadHistory(false)}
                disabled={histBusy}
                className="w-full rounded-full border border-slate-700 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Показать ещё
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRatingTab = () => {
    const filterActive = Boolean(leaderboardOutletFilter);
    const outletLabel =
      session?.outlet?.name ||
      session?.outlet?.id ||
      leaderboardOutletFilter ||
      '';
    const info = motivationInfo;
    const infoSummary =
      info && info.enabled
        ? `Период: ${info.periodLabel}. Баллы за нового клиента — ${info.pointsNew}, за постоянного — ${info.pointsExisting}.`
        : null;
    const infoModalText = info
      ? info.enabled
        ? `Рейтинг строится за ${info.periodLabel.toLowerCase()}. Кассир получает ${info.pointsNew} очков за покупку нового клиента и ${info.pointsExisting} очков за обслуживание постоянного клиента.`
        : 'Мотивация персонала отключена в портале. Новые очки не начисляются, пока функция выключена.'
      : 'Настройки мотивации загружаются из портала мерчанта.';
    return (
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Рейтинг сотрудников</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRatingInfoOpen(true)}
                className="h-10 w-10 rounded-full border border-slate-700 text-lg text-white"
              >
                ?
              </button>
              <button
                onClick={() => {
                  if (!session?.outlet?.id) return;
                  setLeaderboardOutletFilter((prev) =>
                    prev ? null : session.outlet!.id,
                  );
                }}
                disabled={!session?.outlet?.id}
                className={`h-10 w-10 rounded-full border ${
                  filterActive
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 text-white'
                } disabled:opacity-40`}
                title={
                  session?.outlet?.id
                    ? filterActive
                      ? 'Показаны только результаты по вашей точке'
                      : 'Отфильтровать рейтинг по вашей точке'
                    : 'Фильтр доступен после выбора торговой точки'
                }
              >
                ⛃
              </button>
            </div>
          </div>
          {infoSummary && (
            <div className="text-xs text-slate-400">{infoSummary}</div>
          )}
          {filterActive && outletLabel && (
            <div className="text-xs text-emerald-300">
              Фильтр: {outletLabel}
            </div>
          )}
          {leaderboardLoading && (
            <div className="text-sm text-slate-400">Загружаем данные...</div>
          )}
          {leaderboardError && (
            <div className="text-sm text-red-400">{leaderboardError}</div>
          )}
          {!leaderboardLoading && info && !info.enabled && (
            <div className="rounded-3xl bg-slate-800/60 p-4 text-sm text-slate-400">
              Мотивация персонала отключена в портале, новые очки не начисляются.
            </div>
          )}
          <div className="space-y-4">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.staffId}
                className="rounded-3xl bg-slate-800/70 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-500">#{index + 1}</div>
                  <div className="text-base font-semibold text-white">
                    {entry.staffName}
                  </div>
                  <div className="text-xs text-slate-400">
                    {entry.outletName || '—'}
                  </div>
                </div>
                <div className="text-lg font-semibold text-emerald-300">
                  {formatPoints(entry.points)}
                </div>
              </div>
            ))}
            {!leaderboard.length && !leaderboardLoading && (
              <div className="rounded-3xl bg-slate-800/60 p-4 text-sm text-slate-400">
                Нет данных для отображения.
              </div>
            )}
          </div>
        </div>
        {ratingInfoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Информация</h3>
              <p className="text-sm text-slate-300">{infoModalText}</p>
              <button
                onClick={() => setRatingInfoOpen(false)}
                className="w-full rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderReturnsTab = () => (
    <div className="flex-1 overflow-y-auto px-6 pb-32">
      <div className="mt-6 space-y-6">
        <div className="rounded-3xl bg-slate-800/70 p-6 space-y-4">
          <div className="text-sm text-slate-300">Оформить возврат по чеку</div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Номер чека или ID операции</label>
            <input
              value={refundReceiptNumber}
              onChange={(e) => {
                setRefundReceiptNumber(e.target.value);
                setRefundPreview(null);
                setRefundError('');
              }}
              placeholder="Например, 123456 или O-123"
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {refundError && <div className="text-sm text-red-400">{refundError}</div>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setRefundReceiptNumber('');
                setRefundPreview(null);
                setRefundError('');
              }}
              className="flex-1 rounded-full border border-slate-600 py-3 text-sm font-semibold text-slate-300"
            >
              Отмена
            </button>
            <button
              onClick={loadRefundPreview}
              disabled={refundBusy || !refundReceiptNumber.trim()}
              className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
            >
              Найти чек
            </button>
          </div>
        </div>

        {refundPreview && (
          <div className="rounded-3xl bg-slate-800/70 p-6 space-y-4">
            <div className="text-sm text-slate-300">Подтвердите возврат</div>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Клиент</span>
                <span className="font-semibold text-white">
                  {refundPreview.customerName || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Сумма покупки</span>
                <span className="font-semibold text-white">
                  {formatCurrency(refundPreview.purchaseAmount)}
                </span>
              </div>
              {refundPreview.pointsToRestore > 0 && (
                <div className="flex items-center justify-between">
                  <span>Вернём списанные баллы</span>
                  <span className="font-semibold text-emerald-300">
                    {formatPoints(refundPreview.pointsToRestore)} баллов
                  </span>
                </div>
              )}
              {refundPreview.pointsToRevoke > 0 && (
                <div className="flex items-center justify-between">
                  <span>Спишем начисленные баллы</span>
                  <span className="font-semibold text-orange-300">
                    {formatPoints(refundPreview.pointsToRevoke)} баллов
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setRefundPreview(null);
                }}
                className="flex-1 rounded-full border border-slate-600 py-3 text-sm font-semibold text-slate-300"
              >
                Отмена
              </button>
              <button
                onClick={doRefund}
                disabled={refundBusy}
                className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-40"
              >
                Подтвердить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (step !== 'terminal' || !session) {
    return renderAuth();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <header className="px-6 pt-10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">{pageTitle}</h1>
            <button onClick={logoutStaff} className="text-sm text-slate-400 underline">Выйти</button>
          </div>
        </header>
        <div className="flex-1">
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'rating' && renderRatingTab()}
          {activeTab === 'returns' && renderReturnsTab()}
        </div>
        <nav className="sticky bottom-0 flex w-full items-center justify-between bg-slate-900/90 px-6 py-4 backdrop-blur">
          {[
            { key: 'home', label: 'Главная', icon: '⌂' },
            { key: 'history', label: 'История', icon: '⟲' },
            { key: 'rating', label: 'Рейтинг', icon: '★' },
            { key: 'returns', label: 'Возвраты', icon: '↺' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key as typeof activeTab)}
              className={`flex flex-col items-center text-xs ${activeTab === item.key ? 'text-emerald-300' : 'text-slate-400'}`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {scanOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-white">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Сканирование QR</h2>
              <button onClick={() => setScanOpen(false)} className="text-2xl">×</button>
            </div>
            <div className="rounded-3xl bg-slate-900 p-4">
              <QrScanner onResult={onScan} onClose={() => setScanOpen(false)} />
            </div>
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Или введите токен вручную</div>
              <input
                value={manualTokenInput}
                onChange={(e) => setManualTokenInput(e.target.value)}
                placeholder="Токен клиента"
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => {
                  if (manualTokenInput.trim()) {
                    void beginFlow(manualTokenInput.trim());
                    setScanOpen(false);
                  }
                }}
                className="w-full rounded-full bg-emerald-500 py-3 text-sm font-semibold text-slate-900"
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
