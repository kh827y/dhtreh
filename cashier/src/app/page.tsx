'use client';

import { useEffect, useRef, useState } from 'react';
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
type Txn = { id: string; type: 'EARN'|'REDEEM'|'REFUND'|'ADJUST'; amount: number; orderId?: string|null; receiptNumber?: string|null; createdAt: string; outletId?: string|null; outletPosType?: string|null; outletLastSeenAt?: string|null };
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

const COOKIE_LOGIN = 'cashier_login';
const COOKIE_PASSWORD = 'cashier_password';
const COOKIE_PIN = 'cashier_pin';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // ~180 дней в секундах

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

export default function Page() {
  const [merchantId, setMerchantId] = useState<string>(MERCHANT);

  const [mode, setMode] = useState<'redeem' | 'earn'>('redeem');
  const [userToken, setUserToken] = useState<string>('user-1'); // сюда вставится отсканированный JWT
  const [orderId, setOrderId] = useState<string>('O-1');
  const [total, setTotal] = useState<number>(1000);
  const [eligibleTotal, setEligibleTotal] = useState<number>(1000);
  const [receiptNumber, setReceiptNumber] = useState<string>('');

  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // refund UI
  const [refundReceiptNumber, setRefundReceiptNumber] = useState<string>('');
  const [refundTotal, setRefundTotal] = useState<number>(0);

  // history UI
  const [history, setHistory] = useState<Txn[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histNextBefore, setHistNextBefore] = useState<string | null>(null);

  // сессия кассира
  const [session, setSession] = useState<CashierSessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [rememberPin, setRememberPin] = useState<boolean>(false);
  // cashier auth (merchant login + 9-digit password)
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
  const password9 = passwordDigits;

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

  const mapSessionResponse = (payload: any): CashierSessionInfo => {
    const staffData = payload?.staff ?? {};
    const outletData = payload?.outlet ?? {};
    return {
      sessionId: payload?.sessionId || '',
      merchantId: String(payload?.merchantId || MERCHANT || ''),
      staff: {
        id: String(staffData?.id || ''),
        role: staffData?.role || 'CASHIER',
        login: staffData?.login ?? null,
        firstName: staffData?.firstName ?? null,
        lastName: staffData?.lastName ?? null,
        displayName: staffData?.displayName ?? null,
      },
      outlet: {
        id: String(outletData?.id || ''),
        name:
          typeof outletData?.name === 'string'
            ? outletData.name
            : outletData?.id ?? null,
      },
      startedAt: payload?.startedAt || new Date().toISOString(),
      lastSeenAt: payload?.lastSeenAt ?? null,
      rememberPin: Boolean(payload?.rememberPin),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Сгенерируем уникальный orderId при первом монтировании, чтобы избежать идемпотентных коллизий после перезагрузки
  useEffect(() => {
    setOrderId('O-' + Math.floor(Date.now() % 1_000_000));
  }, []);

  async function callQuote() {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    setBusy(true);
    const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
    setResult(null);
    setHoldId(null);
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
          mode,
          userToken,
          orderId,
          total,
          eligibleTotal,
          outletId: activeOutletId || undefined,
          staffId: activeStaffId || undefined,
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || r.statusText);
      }
      const data = await r.json();
      setResult(data);
      setHoldId((data as any).holdId ?? null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setScanOpen(false);
      if (msg.includes('QR токен уже использован')) {
        alert('Этот QR уже использован. Попросите клиента обновить QR в мини-аппе.');
      } else if (msg.includes('ERR_JWT_EXPIRED') || msg.includes('JWTExpired') || msg.includes('"exp"')) {
        alert('QR истёк по времени. Попросите клиента обновить QR в мини-аппе и отсканируйте заново.');
      } else if (msg.includes('другого мерчанта')) {
        alert('QR выписан для другого мерчанта.');
      } else {
        alert('Ошибка запроса: ' + msg);
      }
    } finally {
      setBusy(false);
    }
  }

  // ===== Cashier Auth =====
  const normalizedLogin = merchantLogin.trim().toLowerCase().replace(/[^a-z]/g, '') || merchantLogin.trim().toLowerCase();

  async function cashierLogin() {
    setAuthMsg('');
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9)
        throw new Error('Укажите логин мерчанта и 9‑значный пароль');
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
    } catch (e: any) {
      setAuthMsg(String(e?.message || e));
    }
  }

  async function lookupStaffByPin(pin: string) {
    setAuthMsg('');
    if (!pin || pin.length !== 4) return;
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9)
        throw new Error('Сначала выполните вход мерчанта');
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
              name:
                typeof data.outlet.name === 'string'
                  ? data.outlet.name
                  : String(data.outlet.id),
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
    } catch (e: any) {
      setAuthMsg(String(e?.message || e));
    }
  }

  async function startCashierSessionAuth() {
    setAuthMsg('');
    try {
      if (!normalizedLogin || !password9 || password9.length !== 9)
        throw new Error('Сначала войдите как мерчант (логин/пароль 9 цифр)');
      if (!pinDigits || pinDigits.length !== 4)
        throw new Error('Введите PIN сотрудника');
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
    } catch (e: any) {
      setAuthMsg(String(e?.message || e));
    }
  }

  async function logoutStaff() {
    try {
      await fetch(`${API_BASE}/loyalty/cashier/session`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      // ignore logout errors, cookie will be cleared client-side
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
  }

  async function callCommit() {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    if (!holdId) return alert('Сначала сделайте расчёт (QUOTE).');
    setBusy(true);
    const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
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
        alert(data?.alreadyCommitted ? 'Операция уже была зафиксирована ранее (идемпотентно).' : 'Операция зафиксирована.');
        setHoldId(null);
        setResult(null);
        setReceiptNumber('');
        setOrderId('O-' + Math.floor(Math.random() * 100000));
        // не очищаем список сканирований — повторный скан того же QR должен блокироваться
      } else {
        alert('Commit вернул неуспех: ' + JSON.stringify(data));
      }
    } catch (e: any) {
      alert('Ошибка commit: ' + e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadBalance() {
    try {
      const activeMerchantId = session?.merchantId || merchantId;
      const r = await fetch(`${API_BASE}/loyalty/balance/${activeMerchantId}/${encodeURIComponent(userToken)}`, {
        credentials: 'include',
      });
      const data = await r.json();
      alert(`Баланс клиента ${data.customerId} в мерчанте ${data.merchantId}: ${data.balance} ₽`);
    } catch (e: any) {
      alert('Ошибка получения баланса: ' + e?.message);
    }
  }

  // защита от повторных onResult
  const scanHandledRef = useRef(false);
  // сбрасываем флаг только при открытии окна сканера
  useEffect(() => { if (scanOpen) scanHandledRef.current = false; }, [scanOpen]);
  // блок повторных сканов (храним ключи в sessionStorage, переживает HMR/обновления)
  const scannedTokensRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('scannedQrKeys_v1');
      if (raw) scannedTokensRef.current = new Set(JSON.parse(raw));
    } catch {}
  }, []);
  const saveScanned = () => {
    try { sessionStorage.setItem('scannedQrKeys_v1', JSON.stringify(Array.from(scannedTokensRef.current))); } catch {}
  };
  const base64UrlDecode = (s: string) => {
    try {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
      return atob(s + '='.repeat(pad));
    } catch { return ''; }
  };
  const extractQrKey = (text: string): string => {
    const t = (text || '').trim();
    const parts = t.split('.');
    if (parts.length === 3) {
      try { const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}'); if (payload?.jti) return `jti:${payload.jti}`; } catch {}
    }
    return `raw:${t}`;
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
    const fallback = history.find(
      (h) =>
        h.receiptNumber &&
        h.orderId &&
        h.receiptNumber.trim() === normalized,
    );
    return fallback?.orderId ?? null;
  };

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
      // ignore broadcast errors
    }
    try {
      localStorage.setItem(LOYALTY_EVENT_STORAGE_KEY, JSON.stringify(enriched));
    } catch {
      // ignore storage errors
    }
  };

  function onScan(text: string) {
    // первым делом ставим флаг, чтобы отсечь повторные вызовы в этом открытии
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    // закрываем окно сканера до любых alert, чтобы не ловить лавину повторов
    setScanOpen(false);
    // если этот же токен уже сканировался — показываем одно предупреждение
    const key = extractQrKey(text);
    if (scannedTokensRef.current.has(key)) {
      alert('Этот QR уже сканирован. Попросите клиента обновить QR в мини-аппе.');
      return;
    }
    scannedTokensRef.current.add(key); saveScanned();
    // Всегда подставляем считанный токен, чтобы кассир видел, что считано
    setUserToken(text);
    // авто-QUOTE
    setTimeout(() => { callQuote(); }, 100);
  }

  // ==== Refund ====
  async function doRefund() {
    if (!session) {
      alert('Сначала авторизуйтесь в кассире.');
      return;
    }
    const receipt = refundReceiptNumber.trim();
    if (!receipt || refundTotal <= 0)
      return alert('Укажи номер чека и сумму возврата (>0)');
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
      alert(`Refund OK. share=${(data.share*100).toFixed(1)}%, +${data.pointsRestored} / -${data.pointsRevoked}`);
    } catch (e: any) {
      alert('Ошибка refund: ' + e?.message);
    }
  }

  // ==== История ====
  async function loadHistory(reset = false) {
    if (histBusy) return;
    setHistBusy(true);
    try {
      const activeMerchantId = session?.merchantId || merchantId;
      let customerId = userToken;
      if (userToken.split('.').length === 3) {
        const manual = prompt('Для истории нужен merchantCustomerId (например, mc_...). Введите его или customerId:');
        if (!manual) { setHistBusy(false); return; }
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
      setHistory(old => reset ? items : [...old, ...items]);
      setHistNextBefore(data.nextBefore ?? null);
    } catch (e: any) {
      alert('Ошибка истории: ' + e?.message);
    } finally {
      setHistBusy(false);
    }
  }

  useEffect(() => { setHistory([]); setHistNextBefore(null); }, [userToken, merchantId]);

  // загрузка списков точек/сотрудников
  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Виртуальный терминал кассира</h1>
      <div style={{ color: '#666', marginTop: 6 }}>Мерчант: <code>{merchantId}</code></div>

      {/* Cashier Auth */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fafafa' }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>Авторизация кассира</h2>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.7, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: step === 'merchant' ? 700 : 500 }}>1. Логин мерчанта</span>
          <span style={{ fontWeight: step === 'pin' ? 700 : 500 }}>2. PIN сотрудника</span>
          <span style={{ fontWeight: step === 'terminal' ? 700 : 500 }}>3. Работа в терминале</span>
        </div>

        {step === 'merchant' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Логин мерчанта</label>
              <input
                value={merchantLogin}
                onChange={(e)=>setMerchantLogin(e.target.value)}
                placeholder="Например, greenmarket"
                style={{ padding: 10, borderRadius: 8, border: '1px solid #ddd', maxWidth: 280 }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Пароль (9 цифр)</label>
              <SegmentedInput length={9} groupSize={3} value={passwordDigits} onChange={setPasswordDigits} placeholderChar="○" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={cashierLogin}
                style={{ padding: '8px 16px' }}
                disabled={!merchantLogin.trim() || passwordDigits.length !== 9}
              >
                Войти в панель кассира
              </button>
            </div>
            {authMsg && <div style={{ color: '#d33' }}>{authMsg}</div>}
          </div>
        )}

        {step === 'pin' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, opacity: 0.75 }}>Логин мерчанта:</div>
              <code style={{ padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #eee' }}>{normalizedLogin || '—'}</code>
              <button className="btn btn-ghost" onClick={() => { setStaffLookup(null); setStep('merchant'); }}>Изменить</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>PIN сотрудника</label>
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
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => lookupStaffByPin(pinDigits)} disabled={pinDigits.length !== 4} style={{ padding: '6px 12px' }}>Проверить PIN</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.75 }}>
                  <input
                    type="checkbox"
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
                  Сохранить PIN
                </label>
              </div>
            </div>
            {staffLookup && (
              <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid #e1e1e1', borderRadius: 10, background: '#fff' }}>
                <div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Сотрудник</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {[staffLookup.staff.firstName, staffLookup.staff.lastName].filter(Boolean).join(' ') || staffLookup.staff.login || staffLookup.staff.id}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{staffLookup.staff.role}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Торговая точка</div>
                  <div style={{ fontSize: 15 }}>
                    {staffLookup.outlet
                      ? `${staffLookup.outlet.name || staffLookup.outlet.id} (${staffLookup.outlet.id})`
                      : 'Определяется автоматически'}
                  </div>
                </div>
                {staffLookup.accesses.length > 1 && (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    Доступные точки: {staffLookup.accesses.map((acc) => acc.outletName || acc.outletId).join(', ')}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={startCashierSessionAuth}
                style={{ padding: '8px 16px' }}
                disabled={!staffLookup?.staff?.id}
              >
                Перейти к терминалу
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setStaffLookup(null);
                  setStep('merchant');
                }}
              >
                Назад
              </button>
            </div>
            {authMsg && <div style={{ color: '#d33' }}>{authMsg}</div>}
          </div>
        )}

        {step === 'terminal' && session && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Мерчант:</div>
            <code style={{ padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #eee', width: 'fit-content' }}>{session.merchantId || normalizedLogin || merchantLogin || '—'}</code>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Сотрудник:</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {session.staff.displayName?.trim() || [session.staff.firstName, session.staff.lastName].filter(Boolean).join(' ') || session.staff.login || session.staff.id}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>Роль: {session.staff.role}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Торговая точка:</div>
            <div style={{ fontSize: 15 }}>
              {session.outlet.name || session.outlet.id || '—'}{session.outlet.id ? ` (${session.outlet.id})` : ''}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Сессия с: {new Date(session.startedAt).toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={logoutStaff}>Выйти из сессии</button>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Клиент (userToken/сканер):
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder="сканируй QR или вставь токен"
              style={{ flex: 1, minWidth: 280, padding: 8 }}
            />
            <button onClick={() => setScanOpen(true)} disabled={scanOpen} style={{ padding: '8px 12px' }}>
              Сканировать QR
            </button>
            <button onClick={loadBalance} style={{ padding: '8px 12px' }}>
              Баланс
            </button>
          </div>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Сумма чека (total):
            <input type="number" value={total} onChange={(e) => setTotal(+e.target.value)} style={{ width: '100%', padding: 8 }} />
          </label>
          <label style={{ flex: 1 }}>
            База (eligibleTotal):
            <input type="number" value={eligibleTotal} onChange={(e) => setEligibleTotal(+e.target.value)} style={{ width: '100%', padding: 8 }} />
          </label>
        </div>
        <label>
          Номер чека (опц.):
          <input
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="например, 123456 или A-77"
            style={{ width: '100%', padding: 8 }}
          />
        </label>
        <div>
          Режим:&nbsp;
          <label><input type="radio" name="mode" checked={mode === 'redeem'} onChange={() => setMode('redeem')} /> Списать</label>
          &nbsp;&nbsp;
          <label><input type="radio" name="mode" checked={mode === 'earn'} onChange={() => setMode('earn')} /> Начислить</label>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={callQuote} disabled={busy || !session} style={{ padding: '8px 16px' }}>Посчитать (QUOTE)</button>
          <button onClick={callCommit} disabled={busy || !holdId || !session} style={{ padding: '8px 16px' }}>Оплачено (COMMIT)</button>
        </div>

        {result && (
          <pre style={{ background: '#f6f6f6', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {holdId && <div>Текущий holdId: <code>{holdId}</code></div>}
      </div>

      {scanOpen && <div style={{ marginTop: 20 }}><QrScanner onResult={onScan} onClose={() => setScanOpen(false)} /></div>}

      {/* Refund */}
      <h2 style={{ marginTop: 28 }}>Refund</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input value={refundReceiptNumber} onChange={(e) => setRefundReceiptNumber(e.target.value)} placeholder="номер чека" style={{ padding: 8, flex: 1, minWidth: 220 }} />
        <input type="number" value={refundTotal} onChange={(e) => setRefundTotal(+e.target.value)} placeholder="refundTotal" style={{ padding: 8, width: 160 }} />
        <button onClick={doRefund} disabled={!session} style={{ padding: '8px 16px' }}>Сделать возврат</button>
      </div>

      {/* History */}
      <h2 style={{ marginTop: 28 }}>История операций</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={() => loadHistory(true)} disabled={histBusy} style={{ padding: '6px 10px' }}>Загрузить</button>
        {histNextBefore && <button onClick={() => loadHistory(false)} disabled={histBusy} style={{ padding: '6px 10px' }}>Показать ещё</button>}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {history.map(h => (
          <div key={h.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{h.type}</b>
              <span>{new Date(h.createdAt).toLocaleString()}</span>
            </div>
            <div>
              Сумма: <b>{h.amount > 0 ? '+' : ''}{h.amount} ₽</b>
              {h.receiptNumber ? ` · Чек: ${h.receiptNumber}` : ''}
              {h.outletId ? ` · Точка: ${h.outletId}` : ''}
              {h.outletPosType ? ` · POS: ${h.outletPosType}` : ''}
              {h.outletLastSeenAt ? ` · Активность: ${new Date(h.outletLastSeenAt).toLocaleString()}` : ''}
            </div>
          </div>
        ))}
        {(!history.length && !histBusy) && <div style={{ color: '#666' }}>Нет данных</div>}
      </div>

      <p style={{ marginTop: 24, color: '#666' }}>
        Камера работает на <code>http://localhost</code> без HTTPS. Если открываешь с другого IP — понадобится HTTPS.
      </p>
    </main>
  );
}
