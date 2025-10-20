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
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'ADJUST';
  amount: number;
  orderId?: string | null;
  receiptNumber?: string | null;
  createdAt: string;
  outletId?: string | null;
  outletPosType?: string | null;
  outletLastSeenAt?: string | null;
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

type RefundHistoryItem = {
  id: string;
  createdAt: string;
  amount: number;
  receiptNumber?: string | null;
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

export default function Page() {
  const [merchantId, setMerchantId] = useState<string>(MERCHANT);

  const [mode, setMode] = useState<'redeem' | 'earn'>('redeem');
  const [userToken, setUserToken] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [total, setTotal] = useState<number>(0);
  const [eligibleTotal, setEligibleTotal] = useState<number>(0);
  const [receiptNumber, setReceiptNumber] = useState<string>('');

  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const [refundReceiptNumber, setRefundReceiptNumber] = useState<string>('');
  const [refundTotal, setRefundTotal] = useState<number>(0);

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
  const [ratingInfoOpen, setRatingInfoOpen] = useState(false);
  const [refundHistory, setRefundHistory] = useState<RefundHistoryItem[]>([]);

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
    overrides?: Partial<{ total: number; eligibleTotal: number; mode: 'redeem' | 'earn'; receiptNumber: string }>,
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
    const eligibleToSend = overrides?.eligibleTotal ?? eligibleTotal;
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
          eligibleTotal: eligibleToSend,
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
      const data = await r.json();
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

  const loadCustomerBalance = async (token: string, merchant: string): Promise<number | null> => {
    try {
      const r = await fetch(`${API_BASE}/loyalty/balance/${merchant}/${encodeURIComponent(token)}`, {
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
    const customerId = resolveCustomerIdFromToken(token);
    const name = extractNameFromToken(token);
    const [balance, levelName] = await Promise.all([
      loadCustomerBalance(token, merchant),
      customerId ? loadCustomerLevel(merchant, customerId) : Promise.resolve(null),
    ]);
    setOverview({
      customerId: customerId ?? token || null,
      name: name ?? null,
      levelName,
      balance,
    });
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
    setOverview({ customerId: null, name: null, levelName: null, balance: null });
    setUserToken('');
    setManualTokenInput('');
    setReceiptNumber('');
    setTotal(0);
    setEligibleTotal(0);
  };

  const beginFlow = async (token: string) => {
    setUserToken(token);
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
    setEligibleTotal(parsedAmount);
    if (mode === 'redeem') {
      const quote = await callQuote({
        total: parsedAmount,
        eligibleTotal: parsedAmount,
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
        eligibleTotal: parsedAmount,
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
        eligibleTotal: 0,
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

    if (normalized !== lastRequestedRedeem) {
      const updated = await callQuote({
        total,
        eligibleTotal: normalized,
        mode: 'redeem',
        receiptNumber,
      });
      if (!updated) return;
      const updatedRedeem = (updated as QuoteRedeemResp).pointsToBurn ?? normalized;
      setSelectedPoints(updatedRedeem);
      setLastRequestedRedeem(updatedRedeem);
    }

    const current = (result as QuoteRedeemResp) ?? {};
    const finalPayable = current.finalPayable ?? Math.max(total - selectedPoints, 0);
    setConfirmSnapshot({
      purchaseTotal: total,
      finalPayable,
      pointsEarn: 0,
      pointsBurn: selectedPoints,
    });
    setFlowStep('confirm');
  }

  const handlePointsChange = (value: number) => {
    if (mode !== 'redeem') {
      setSelectedPoints(0);
      return;
    }
    const quote = result as QuoteRedeemResp | null;
    const maxRedeem = quote?.pointsToBurn ?? 0;
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(Math.round(value), maxRedeem)) : 0;
    setSelectedPoints(normalized);
  };

  const handlePointsInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    handlePointsChange(digits ? Number(digits) : 0);
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
      finalPayable: total - appliedRedeem,
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
    setHistBusy(true);
    try {
      const activeMerchantId = session?.merchantId || merchantId;
      let customerId = userToken;
      if (userToken.split('.').length === 3) {
        const manual = prompt('Для истории нужен merchantCustomerId (например, mc_...). Введите его или customerId:');
        if (!manual) {
          setHistBusy(false);
          return;
        }
        customerId = manual;
      }
      const url = new URL(`${API_BASE}/loyalty/transactions`);
      url.searchParams.set('merchantId', activeMerchantId);
      url.searchParams.set('merchantCustomerId', customerId);
      url.searchParams.set('customerId', customerId);
      url.searchParams.set('limit', '20');
      if (!reset && histNextBefore) url.searchParams.set('before', histNextBefore);
      const r = await fetch(url.toString(), { credentials: 'include' });
      const data = await r.json();
      const items: Txn[] = data.items ?? [];
      setHistory((old) => (reset ? items : [...old, ...items]));
      setHistNextBefore(data.nextBefore ?? null);
      if (reset) {
        const refunds = items.filter((i) => i.type === 'REFUND').map((i) => ({
          id: i.id,
          createdAt: i.createdAt,
          amount: i.amount,
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
    setHistNextBefore(null);
  }, [userToken, merchantId]);

  const findOrderIdForReceipt = (candidate: string): string | null => {
    const normalized = candidate.trim();
    if (!normalized) return null;
    const priority = history.find(
      (h) =>
        h.receiptNumber &&
        h.orderId &&
        h.receiptNumber.trim() === normalized &&
        (h.type === 'REDEEM' || h.type === 'EARN'),
    );
    if (priority?.orderId) return priority.orderId;
    const fallback = history.find((h) => h.receiptNumber && h.orderId && h.receiptNumber.trim() === normalized);
    return fallback?.orderId ?? null;
  };

  const doRefund = async () => {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    const receipt = refundReceiptNumber.trim();
    if (!receipt || refundTotal <= 0) {
      alert('Укажи номер чека и сумму возврата (>0)');
      return;
    }
    const resolvedOrderId = findOrderIdForReceipt(receipt);
    if (!resolvedOrderId) {
      alert('Не нашли операцию с таким номером чека. Загрузите историю клиента и попробуйте снова.');
      return;
    }
    try {
      const activeMerchantId = session?.merchantId || merchantId;
      const activeOutletId = session?.outlet?.id || undefined;
      const activeStaffId = session?.staff?.id || undefined;
      const r = await fetch(`${API_BASE}/loyalty/refund`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: activeMerchantId,
          orderId: resolvedOrderId,
          refundTotal,
          outletId: activeOutletId || undefined,
          staffId: activeStaffId || undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setRefundReceiptNumber('');
      alert(`Возврат выполнен. share=${(data.share * 100).toFixed(1)}%, восстановлено ${data.pointsRestored}, списано ${data.pointsRevoked}`);
      loadHistory(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Ошибка refund: ' + message);
    }
  };

  const loadLeaderboard = useCallback(async () => {
    if (!session) {
      setLeaderboard([]);
      return;
    }
    setLeaderboardLoading(true);
    setLeaderboardError('');
    try {
      const url = new URL(`${API_BASE}/loyalty/cashier/leaderboard`);
      url.searchParams.set('merchantId', session.merchantId);
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const items: RawLeaderboardItem[] = Array.isArray(data?.items) ? data.items : [];
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
        outletName: typeof item.outletName === 'string' ? item.outletName : null,
        points: Number(item.points ?? 0),
      }));
      entries.sort((a, b) => b.points - a.points);
      setLeaderboard(entries);
    } catch (e: unknown) {
      setLeaderboard([]);
      const message = e instanceof Error ? e.message : String(e ?? '');
      setLeaderboardError(message || 'Не удалось загрузить рейтинг');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [session]);

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

  const flowHeader = useMemo(() => {
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
  }, [flowStep]);

  const renderAuth = () => (
    <main className="min-h-screen bg-gradient-to-br from-sky-500 via-violet-500 to-fuchsia-500 px-5 py-10 text-slate-900 md:flex md:items-center md:justify-center">
      <div className="mx-auto w-full max-w-md space-y-10 rounded-[36px] bg-white/90 p-8 shadow-[0_40px_90px_-35px_rgba(76,29,149,0.55)] backdrop-blur">
        <div className="space-y-3 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Терминал</span>
          <h1 className="text-3xl font-bold text-slate-900">Панель кассира</h1>
          <p className="text-sm text-slate-600">Авторизуйтесь, чтобы начать обслуживание клиентов.</p>
        </div>
        <div className="flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
          <span className={step === 'merchant' ? 'text-violet-500' : ''}>1. Мерчант</span>
          <span className="opacity-50">•</span>
          <span className={step === 'pin' ? 'text-violet-500' : ''}>2. PIN</span>
          <span className="opacity-50">•</span>
          <span className={step === 'terminal' ? 'text-violet-500' : ''}>3. Терминал</span>
        </div>
        {step === 'merchant' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Логин мерчанта</label>
              <input
                value={merchantLogin}
                onChange={(e) => setMerchantLogin(e.target.value)}
                placeholder="Например, greenmarket"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Пароль (9 цифр)</label>
              <div className="rounded-2xl border border-dashed border-violet-200 bg-gradient-to-r from-violet-50 to-sky-50 p-3">
                <SegmentedInput length={9} groupSize={3} value={passwordDigits} onChange={setPasswordDigits} placeholderChar="○" autoFocus />
              </div>
            </div>
            <button
              onClick={cashierLogin}
              disabled={!merchantLogin.trim() || passwordDigits.length !== 9}
              className="w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-base font-semibold text-white shadow-lg shadow-fuchsia-200/70 transition hover:brightness-110 disabled:opacity-40"
            >
              Продолжить
            </button>
            {authMsg && <div className="text-sm text-rose-500">{authMsg}</div>}
          </div>
        )}
        {step === 'pin' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <div>
                Логин: <span className="font-semibold text-slate-800">{normalizedLogin || '—'}</span>
              </div>
              <button className="text-violet-500 underline" onClick={() => { setStaffLookup(null); setStep('merchant'); }}>
                Изменить
              </button>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700">PIN сотрудника</label>
              <div className="rounded-2xl border border-dashed border-violet-200 bg-gradient-to-r from-violet-50 to-sky-50 p-3">
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
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <button
                  onClick={() => lookupStaffByPin(pinDigits)}
                  disabled={pinDigits.length !== 4}
                  className="rounded-full border border-violet-200 px-4 py-2 font-semibold text-violet-600 transition hover:border-violet-400 disabled:opacity-40"
                >
                  Проверить PIN
                </button>
                <label className="flex items-center gap-2 text-slate-500">
                  <input
                    type="checkbox"
                    className="accent-violet-500"
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
              <div className="rounded-[28px] bg-gradient-to-r from-sky-100 via-fuchsia-100 to-rose-100 p-5 shadow-inner">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Сотрудник</div>
                <div className="pt-2 text-lg font-semibold text-slate-900">
                  {[staffLookup.staff.firstName, staffLookup.staff.lastName].filter(Boolean).join(' ') ||
                    staffLookup.staff.login ||
                    staffLookup.staff.id}
                </div>
                <div className="text-xs font-medium text-violet-600">{staffLookup.staff.role}</div>
                {staffLookup.outlet && (
                  <div className="text-sm text-slate-600">Точка: {staffLookup.outlet.name}</div>
                )}
                {staffLookup.accesses?.length ? (
                  <div className="text-xs text-slate-500">
                    Доступ к {staffLookup.accesses.length} точкам
                  </div>
                ) : null}
              </div>
            )}
            <button
              onClick={startCashierSessionAuth}
              disabled={!staffLookup}
              className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-lime-200/70 transition hover:brightness-110 disabled:opacity-40"
            >
              Продолжить в терминал
            </button>
            {authMsg && <div className="text-sm text-rose-500">{authMsg}</div>}
          </div>
        )}
        <div className="text-center text-xs text-slate-400">© {new Date().getFullYear()} Программа лояльности</div>
      </div>
    </main>
  );
  const renderHomeTab = () => {
    const redeemQuote = (result as QuoteRedeemResp | null) ?? null;

    return (
      <div className="flex-1 overflow-y-auto px-2 pb-32 sm:px-4">
        <div className="mt-6 space-y-6">
          <div className="rounded-[32px] bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-500 p-[1px] shadow-[0_25px_55px_-25px_rgba(120,40,200,0.65)]">
            <div className="rounded-[30px] bg-white/95 p-6 text-slate-900">
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Сотрудник</div>
              <div className="pt-3 text-xl font-semibold text-slate-900">{staffName}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50/80 p-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">Точка</div>
                  <div className="pt-1 font-medium text-slate-800">{outletName || '—'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50/80 p-3 text-right">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">Смена</div>
                  <div className="pt-1 font-medium text-slate-800">#{session?.sessionId?.slice(-6) || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {flowStep === 'idle' && (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-white/85 p-5 text-center text-sm text-slate-600 shadow-inner">
                Чтобы начать обслуживание, отсканируйте QR клиента или введите токен вручную.
              </div>
              <button
                onClick={() => setScanOpen(true)}
                className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-500 text-lg font-semibold text-white shadow-[0_30px_60px_-30px_rgba(14,116,144,0.85)] transition hover:scale-[1.02] active:scale-[0.98]"
              >
                Сканировать QR
              </button>
              <div className="space-y-4 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                <div className="text-sm font-medium text-slate-700">Ручной ввод токена</div>
                <div className="flex items-center gap-3">
                  <input
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                    placeholder="Вставьте токен клиента"
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <button
                    onClick={() => manualTokenInput.trim() && beginFlow(manualTokenInput.trim())}
                    className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 text-sm font-semibold text-slate-900 shadow-md shadow-emerald-200/60"
                  >
                    Продолжить
                  </button>
                </div>
              </div>
            </div>
          )}

          {flowStep !== 'idle' && (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Информация о клиенте</div>
                <div className="pt-3 text-lg font-semibold text-slate-900">{overview.name || 'Имя неизвестно'}</div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Уровень</span>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-600">{overview.levelName || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Баланс</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(overview.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>ID клиента</span>
                    <span>{overview.customerId || '—'}</span>
                  </div>
                </div>
              </div>

              {flowStep === 'details' && (
                <div className="space-y-6 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Сумма покупки</label>
                    <input
                      inputMode="decimal"
                      value={purchaseAmountInput}
                      onChange={(e) => setPurchaseAmountInput(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Номер чека</label>
                    <input
                      value={receiptInput}
                      onChange={(e) => setReceiptInput(e.target.value)}
                      placeholder="Например, 123456"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                    <button
                      onClick={() => setMode('redeem')}
                      className={`rounded-2xl py-3 text-sm font-semibold transition ${mode === 'redeem' ? 'bg-white text-emerald-500 shadow' : 'text-slate-500'}`}
                    >
                      Списание баллов
                    </button>
                    <button
                      onClick={() => setMode('earn')}
                      className={`rounded-2xl py-3 text-sm font-semibold transition ${mode === 'earn' ? 'bg-white text-indigo-500 shadow' : 'text-slate-500'}`}
                    >
                      Только начисление
                    </button>
                  </div>
                  {quoteError && <div className="text-sm text-rose-500">{quoteError}</div>}
                  <div className="flex gap-3">
                    <button
                      onClick={resetFlow}
                      className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Отменить
                    </button>
                    <button
                      onClick={handleDetailsContinue}
                      disabled={busy}
                      className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70 transition hover:brightness-110 disabled:opacity-40"
                    >
                      Продолжить
                    </button>
                  </div>
                </div>
              )}

              {flowStep === 'points' && redeemQuote && (
                <div className="space-y-5 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">Доступно для оплаты</div>
                    <div className="text-lg font-semibold text-emerald-500">{formatCurrency(redeemQuote.discountToApply)}</div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Баланс для списания</span>
                    <span className="font-semibold text-slate-900">{formatPoints(redeemQuote.pointsToBurn)} баллов</span>
                  </div>
                  <button
                    onClick={() => handlePointsChange(redeemQuote.pointsToBurn ?? 0)}
                    className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 py-3 text-sm font-semibold text-slate-900 shadow-md shadow-emerald-200/60"
                  >
                    Списать всё
                  </button>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Списать баллы</label>
                    <input
                      inputMode="numeric"
                      value={selectedPoints ? String(selectedPoints) : ''}
                      onChange={(e) => handlePointsInput(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                    Можно использовать: {formatPoints(redeemQuote.pointsToBurn)} баллов
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setFlowStep('details')}
                      className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Назад
                    </button>
                    <button
                      onClick={() => void handlePointsSubmit(false)}
                      disabled={busy}
                      className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70 transition hover:brightness-110 disabled:opacity-40"
                    >
                      {selectedPoints > 0 ? 'Списать' : 'Не списывать'}
                    </button>
                  </div>
                </div>
              )}

              {flowStep === 'confirm' && confirmSnapshot && (
                <div className="space-y-4 rounded-[28px] bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
                  <div className="text-lg font-semibold text-slate-900">Подтвердите операцию</div>
                  <div className="space-y-3 text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span>Сумма покупки</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(confirmSnapshot.purchaseTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Клиенту будет начислено</span>
                      <span className="font-semibold text-emerald-500">{formatPoints(confirmSnapshot.pointsEarn)} баллов</span>
                    </div>
                    <div className="flex justify-between">
                      <span>С клиента будет списано</span>
                      <span className="font-semibold text-amber-500">{formatPoints(confirmSnapshot.pointsBurn)} баллов</span>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setFlowStep(mode === 'redeem' ? 'points' : 'details')}
                      className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={busy}
                      className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70 transition hover:brightness-110 disabled:opacity-40"
                    >
                      ОК
                    </button>
                  </div>
                </div>
              )}

              {flowStep === 'receipt' && receiptData && (
                <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-indigo-900 to-slate-900 px-6 py-8 text-white shadow-[0_35px_70px_-40px_rgba(30,41,59,0.95)]">
                  <div className="absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 rounded-b-full bg-white/20" />
                  <div className="animate-[receipt_0.6s_ease-out]">
                    <div className="text-center text-sm uppercase tracking-[0.4em] text-white/60">Итог</div>
                    <div className="mt-4 space-y-4 text-sm text-white/80">
                      <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-white/50">Покупатель</div>
                        <div className="text-white font-semibold">{overview.name || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-white/50">Сотрудник</div>
                        <div className="text-white font-semibold">{staffName || '—'}</div>
                      </div>
                      <div className="border-t border-dashed border-white/20 pt-3 mt-3 space-y-2">
                        <div className="flex justify-between">
                          <span>Сумма покупки</span>
                          <span className="font-semibold text-white">{formatCurrency(receiptData.purchaseTotal)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-300">
                          <span>Начислено баллов</span>
                          <span>{formatPoints(receiptData.pointsEarn)}</span>
                        </div>
                        <div className="flex justify-between text-amber-300">
                          <span>Списано баллов</span>
                          <span>{formatPoints(receiptData.pointsBurn)}</span>
                        </div>
                      </div>
                      <div className="border-t border-dashed border-white/20 pt-3 mt-3 flex justify-between text-lg font-semibold text-white">
                        <span>К оплате</span>
                        <span>{formatCurrency(receiptData.finalPayable)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleReceiptClose}
                    className="mt-6 w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 py-3 text-sm font-semibold text-slate-900 shadow-md shadow-emerald-200/60"
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
  };
  const renderHistoryTab = () => (
    <div className="flex-1 overflow-y-auto px-2 pb-32 sm:px-4">
      <div className="mt-6 space-y-4">
        <button
          onClick={() => loadHistory(true)}
          disabled={histBusy}
          className="w-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200/70 transition hover:brightness-110 disabled:opacity-40"
        >
          Загрузить историю
        </button>
        <div className="space-y-4">
          {history.map((item) => {
            const isEarn = item.type === 'EARN';
            const isRedeem = item.type === 'REDEEM';
            const isRefund = item.type === 'REFUND';
            const color = isEarn ? 'text-emerald-600' : isRedeem ? 'text-amber-600' : isRefund ? 'text-rose-600' : 'text-slate-600';
            const badge = isEarn ? 'bg-emerald-100 text-emerald-700' : isRedeem ? 'bg-amber-100 text-amber-700' : isRefund ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600';
            const cardBg = isEarn
              ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-emerald-100/70'
              : isRedeem
              ? 'border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/70'
              : isRefund
              ? 'border-rose-200/70 bg-gradient-to-br from-rose-50 to-rose-100/70'
              : 'border-slate-200/70 bg-white/90';
            const sign = item.amount > 0 ? '+' : '';
            return (
              <div key={item.id} className={`space-y-2 rounded-[24px] border px-5 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)] ${cardBg}`}>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span className="font-medium text-slate-600">{item.outletId || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span className={`rounded-full px-3 py-1 text-[11px] ${badge}`}>{item.type}</span>
                  {item.outletPosType && <span className="text-slate-400">{item.outletPosType}</span>}
                </div>
                <div className={`text-lg font-semibold ${color}`}>
                  {sign}{item.amount} ₽
                </div>
                <div className="text-xs text-slate-500">
                  {item.receiptNumber ? `Чек ${item.receiptNumber}` : 'Чек не указан'}
                </div>
                <div className="text-xs text-slate-500">
                  {isEarn && `Клиенту начислено ${Math.abs(item.amount)} ☆`}
                  {isRedeem && `С клиента списано ${Math.abs(item.amount)} ☆`}
                  {isRefund && `Возврат ${Math.abs(item.amount)} ₽`}
                  {!isEarn && !isRedeem && !isRefund && item.amount !== 0 && `Изменение на ${Math.abs(item.amount)} ₽`}
                </div>
              </div>
            );
          })}
          {!history.length && <div className="rounded-[24px] bg-white/90 px-5 py-4 text-sm text-slate-500 shadow-inner">Нет операций</div>}
          {histNextBefore && (
            <button
              onClick={() => loadHistory(false)}
              disabled={histBusy}
              className="w-full rounded-full border border-slate-200 bg-white/90 py-3 text-sm font-semibold text-slate-600 shadow-[0_15px_35px_-30px_rgba(15,23,42,0.4)] transition hover:border-slate-300 disabled:opacity-40"
            >
              Показать ещё
            </button>
          )}
        </div>
      </div>
    </div>
  );
  const renderRatingTab = () => (
    <div className="flex-1 overflow-y-auto px-2 pb-32 sm:px-4">
      <div className="mt-6 space-y-6">
        <div className="rounded-[28px] bg-gradient-to-r from-indigo-500 to-fuchsia-500 p-[1px] shadow-[0_25px_55px_-25px_rgba(120,40,200,0.65)]">
          <div className="flex items-center justify-between rounded-[26px] bg-white/95 px-5 py-4 text-slate-900">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Рейтинг сотрудников</h2>
              <p className="text-xs text-slate-500">Лучшие за последние дни</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRatingInfoOpen(true)}
                className="h-10 w-10 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-lg font-semibold text-white shadow-md shadow-fuchsia-200/70"
              >
                ?
              </button>
              <button className="h-10 w-10 rounded-full border border-slate-200 bg-white text-lg text-slate-500 shadow-sm">⛃</button>
            </div>
          </div>
        </div>
        {leaderboardLoading && <div className="rounded-[26px] bg-white/90 px-5 py-4 text-sm text-slate-500 shadow-inner">Загружаем данные...</div>}
        {leaderboardError && <div className="rounded-[26px] bg-rose-50 px-5 py-4 text-sm text-rose-500 shadow-inner">{leaderboardError}</div>}
        <div className="space-y-4">
          {leaderboard.map((entry, index) => (
            <div key={entry.staffId} className="flex items-center justify-between rounded-[26px] border border-slate-200/70 bg-white/95 px-5 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">#{index + 1}</div>
                <div className="pt-1 text-base font-semibold text-slate-900">{entry.staffName}</div>
                <div className="text-xs text-slate-500">{entry.outletName || '—'}</div>
              </div>
              <div className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-lg font-semibold text-white shadow-md shadow-amber-200/60">
                {formatPoints(entry.points)}
              </div>
            </div>
          ))}
          {!leaderboard.length && !leaderboardLoading && (
            <div className="rounded-[26px] bg-white/90 px-5 py-4 text-sm text-slate-500 shadow-inner">
              Нет данных для отображения.
            </div>
          )}
        </div>
      </div>
      {ratingInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-sm space-y-4 rounded-[32px] bg-white/95 p-6 text-slate-900 shadow-[0_30px_60px_-30px_rgba(30,64,175,0.6)]">
            <h3 className="text-lg font-semibold text-slate-900">Информация</h3>
            <p className="text-sm text-slate-600">
              Рейтинг строится за последние N дней. Сотруднику начисляется N очков — за начисление бонусов старому клиенту, N очков — за начисление бонусов новому клиенту.
            </p>
            <button
              onClick={() => setRatingInfoOpen(false)}
              className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
  const renderReturnsTab = () => (
    <div className="flex-1 overflow-y-auto px-2 pb-32 sm:px-4">
      <div className="mt-6 space-y-6">
        <div className="space-y-4 rounded-[28px] bg-white/95 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)]">
          <div className="text-sm font-semibold text-slate-800">Оформить возврат по чеку</div>
          <input
            value={refundReceiptNumber}
            onChange={(e) => setRefundReceiptNumber(e.target.value)}
            placeholder="Номер чека"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <input
            type="number"
            value={refundTotal ? String(refundTotal) : ''}
            onChange={(e) => setRefundTotal(Number(e.target.value))}
            placeholder="Сумма возврата"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <button
            onClick={doRefund}
            className="w-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/70"
          >
            Оформить возврат
          </button>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">История возвратов</h3>
          {refundHistory.map((item) => (
            <div key={item.id} className="rounded-[26px] border border-rose-200/60 bg-gradient-to-br from-rose-50 to-rose-100/70 px-5 py-4 shadow-[0_18px_40px_-32px_rgba(159,18,57,0.55)]">
              <div className="text-sm font-medium text-rose-600">Возврат {formatCurrency(Math.abs(item.amount))}</div>
              <div className="text-xs text-rose-500">{formatDateTime(item.createdAt)}</div>
              <div className="text-xs text-rose-500/80">Чек {item.receiptNumber || '—'}</div>
            </div>
          ))}
          {!refundHistory.length && <div className="rounded-[26px] bg-white/90 px-5 py-4 text-sm text-slate-500 shadow-inner">Пока нет возвратов.</div>}
        </div>
      </div>
    </div>
  );
  if (step !== 'terminal' || !session) {
    return renderAuth();
  }

  return (
    <main className="flex min-h-screen justify-center bg-gradient-to-br from-sky-500 via-violet-500 to-fuchsia-500 px-4 text-slate-900">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col overflow-hidden rounded-none bg-white/90 px-5 pb-28 pt-8 shadow-[0_40px_90px_-35px_rgba(76,29,149,0.55)] backdrop-blur md:my-12 md:rounded-[40px] md:px-8 md:pb-32">
        <header className="rounded-[28px] bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-5 text-white shadow-lg shadow-fuchsia-300/60">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-white/70">{session.merchantId}</div>
              <h1 className="pt-2 text-2xl font-semibold text-white">{flowHeader}</h1>
            </div>
            <button
              onClick={logoutStaff}
              className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
            >
              Выйти
            </button>
          </div>
        </header>
        <div className="mt-6 flex-1">
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'rating' && renderRatingTab()}
          {activeTab === 'returns' && renderReturnsTab()}
        </div>
        <nav className="sticky bottom-0 mt-8 flex items-center justify-between rounded-full border border-slate-200/70 bg-white/95 px-4 py-3 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)]">
          {[
            { key: 'home', label: 'Главная', icon: '🏠' },
            { key: 'history', label: 'История', icon: '🗂️' },
            { key: 'rating', label: 'Рейтинг', icon: '⭐' },
            { key: 'returns', label: 'Возвраты', icon: '↩️' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key as typeof activeTab)}
              className={`flex flex-col items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${activeTab === item.key ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-200/70' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="w-full max-w-sm space-y-6 rounded-[32px] bg-white/95 p-6 text-slate-900 shadow-[0_40px_90px_-35px_rgba(76,29,149,0.55)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Сканирование QR</h2>
              <button onClick={() => setScanOpen(false)} className="text-2xl text-slate-400 transition hover:text-slate-600">×</button>
            </div>
            <div className="rounded-[28px] bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 p-4">
              <QrScanner onResult={onScan} onClose={() => setScanOpen(false)} />
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">Или введите токен вручную</div>
              <input
                value={manualTokenInput}
                onChange={(e) => setManualTokenInput(e.target.value)}
                placeholder="Токен клиента"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                onClick={() => {
                  if (manualTokenInput.trim()) {
                    void beginFlow(manualTokenInput.trim());
                    setScanOpen(false);
                  }
                }}
                className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70"
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

