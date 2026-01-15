'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QrScanner from '../components/QrScanner';
import {
  Award,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Gift,
  History,
  Home,
  KeyRound,
  Keyboard,
  Loader2,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Store,
  Trophy,
  User,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';

type QuoteRedeemResp = {
  canRedeem?: boolean;
  discountToApply?: number;
  pointsToBurn?: number;
  finalPayable?: number;
  holdId?: string;
  message?: string;
  postEarnPoints?: number;
  postEarnOnAmount?: number;
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
  purchaseAmount?: number | null;
  earnApplied?: number | null;
  redeemApplied?: number | null;
  refundEarn?: number | null;
  refundRedeem?: number | null;
  staffId?: string | null;
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

type ClientProfile = {
  id: string;
  name: string;
  level: string;
  balance: number;
  avatar: string;
  redeemRateBps?: number | null;
  minPaymentAmount?: number | null;
};

type LevelInfo = {
  name: string | null;
  redeemRateBps: number | null;
  minPaymentAmount: number | null;
};

type UiTransaction = {
  id: string;
  checkId: string;
  date: Date;
  type: 'sale' | 'return';
  client: string;
  staff: string;
  staffId?: string | null;
  amount: number;
  pointsAccrued: number;
  pointsRedeemed: number;
  orderId?: string | null;
  receiptNumber?: string | null;
};

type Tab = 'checkout' | 'history' | 'rating' | 'returns';

type CheckoutMode =
  | 'landing'
  | 'manual_input'
  | 'scanning'
  | 'profile'
  | 'amount'
  | 'redeem'
  | 'precheck'
  | 'success';

type CheckoutStep =
  | 'search'
  | 'amount'
  | 'mode'
  | 'redeem'
  | 'precheck'
  | 'success';

type DesktopView = 'main' | 'history' | 'return' | 'rating';

type TxMode = 'accrue' | 'redeem';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || '';
const LOYALTY_EVENT_CHANNEL = 'loyalty:events';
const LOYALTY_EVENT_STORAGE_KEY = 'loyalty:lastEvent';

const isBrowser = typeof window !== 'undefined';
const API_ORIGIN_FALLBACK = 'http://localhost';

const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE) {
    return new URL(`${API_BASE}${normalizedPath}`);
  }
  if (isBrowser && window.location?.origin) {
    return new URL(normalizedPath, window.location.origin);
  }
  return new URL(normalizedPath, API_ORIGIN_FALLBACK);
};

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

const buildOrderId = () => {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `O-${stamp}-${rand}`;
};

const qrKeyFromToken = (token: string): string | null => {
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
  return null;
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

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPoints = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
    value,
  );
};

const ClientHeader = React.memo(function ClientHeader({
  client,
}: {
  client: ClientProfile;
}) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between mb-6">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">
          {client.avatar}
        </div>
        <div>
          <h3 className="font-bold text-gray-900 leading-tight">{client.name}</h3>
          <div className="flex items-center space-x-2 text-xs">
            <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
              {client.level}
            </span>
            <span className="text-gray-500">ID: {client.id}</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <span className="block text-xs text-gray-500 uppercase font-bold">Баланс</span>
        <span className="text-xl font-bold text-purple-600">{formatPoints(client.balance)} Б</span>
      </div>
    </div>
  );
});

const readApiError = (payload: unknown): string | null => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.trim() || null;
  if (typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>;
    if (typeof anyPayload.message === 'string') return anyPayload.message;
    if (
      Array.isArray(anyPayload.message) &&
      typeof anyPayload.message[0] === 'string'
    ) {
      return anyPayload.message[0];
    }
    if (typeof anyPayload.error === 'string') return anyPayload.error;
  }
  return null;
};

const readErrorMessage = async (res: Response, fallback: string) => {
  const text = await res.text().catch(() => '');
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {}
  return readApiError(json || text) || fallback;
};

const stripExceptionPrefix = (message: string) =>
  message
    .replace(/^UnauthorizedException:\s*/i, '')
    .replace(/^BadRequestException:\s*/i, '')
    .replace(/^NotFoundException:\s*/i, '')
    .trim();

const humanizeCashierAuthError = (message: string): string => {
  const raw = stripExceptionPrefix(message || '');
  const lower = raw.toLowerCase();
  if (!raw) return 'Не удалось выполнить действие';
  if (lower.includes('invalid cashier merchant login')) {
    return 'Неверный логин мерчанта';
  }
  if (lower.includes('invalid cashier credentials')) {
    return 'Неверный логин или пароль мерчанта';
  }
  if (lower.includes('merchantlogin and 9-digit password required')) {
    return 'Укажите логин мерчанта и 9‑значный пароль';
  }
  if (lower.includes('activationcode (9 digits) required')) {
    return 'Введите код активации (9 цифр)';
  }
  if (lower.includes('invalid or expired activation code')) {
    return 'Неверный или истёкший код активации';
  }
  if (lower.includes('device not activated')) {
    return 'Устройство не активировано. Введите код активации';
  }
  if (lower.includes('device activated for another merchant')) {
    return 'Устройство активировано для другого мерчанта. Сбросьте устройство и активируйте заново';
  }
  if (lower.includes('pincode (4 digits) required')) {
    return 'Введите PIN сотрудника (4 цифры)';
  }
  if (lower.includes('staff access by pin not found')) {
    return 'PIN не найден. Проверьте PIN и попробуйте снова';
  }
  if (lower.includes('pin не уникален')) {
    return raw;
  }
  if (lower.includes('staff inactive')) {
    return 'Сотрудник не активен. Обратитесь к администратору';
  }
  if (lower.includes('invalid pin') || lower.includes('pin assigned to another outlet')) {
    return 'Неверный PIN или нет доступа к торговой точке';
  }
  if (lower.includes('outlet for pin access not found')) {
    return 'Для этого PIN не найдена торговая точка';
  }
  return raw.length > 400 ? raw.slice(0, 400) : raw;
};

const humanizeQuoteError = (message: string): string => {
  const raw = stripExceptionPrefix(message || '');
  const lower = raw.toLowerCase();
  if (lower.includes('qr токен уже использован')) {
    return 'Этот QR уже использован. Попросите клиента обновить QR в приложении.';
  }
  if (lower.includes('customer not found') || lower.includes('merchant customer not found')) {
    return 'Клиент не найден';
  }
  if (lower.includes('err_jwt_expired') || lower.includes('jwtexpired')) {
    return 'Код истёк по времени. Попросите клиента обновить его в приложении и попробуйте ещё раз.';
  }
  if (lower.includes('qr выписан для другого мерчанта')) {
    return 'QR выписан для другого мерчанта.';
  }
  if (lower.includes('bad qr token')) {
    return 'QR не распознан. Попросите клиента открыть QR заново.';
  }
  if (lower.includes('short qr code required')) {
    return 'Введите 9‑значный код из приложения.';
  }
  if (lower.includes('jwt required for quote')) {
    return 'Нужен защищённый QR. Отсканируйте код из приложения.';
  }
  if (lower.includes('нельзя одновременно начислять')) {
    return 'Нельзя одновременно начислять и списывать баллы в одном чеке.';
  }
  if (lower.includes('начисления заблокированы')) {
    return 'Начисления заблокированы администратором.';
  }
  if (lower.includes('списания заблокированы')) {
    return 'Списания заблокированы администратором.';
  }
  return raw || 'Не удалось выполнить расчёт.';
};

const humanizeRefundError = (message: string): string => {
  const raw = stripExceptionPrefix(message || '');
  if (!raw) return 'Не удалось оформить возврат.';
  if (raw.toLowerCase().includes('receipt')) {
    return 'Чек с таким номером не найден.';
  }
  return raw.length > 400 ? raw.slice(0, 400) : raw;
};

const extractInitials = (value: string) => {
  const parts = (value || '')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .join('');
  return initials || value.slice(0, 2).toUpperCase();
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

  const [session, setSession] = useState<CashierSessionInfo | null>(null);
  const [rememberPin, setRememberPin] = useState<boolean>(false);
  const [deviceActive, setDeviceActive] = useState<boolean>(false);

  const [authStep, setAuthStep] = useState<
    'app_login' | 'staff_pin' | 'authorized'
  >('app_login');
  const [appLogin, setAppLogin] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinMessage, setPinMessage] = useState('');

  const [activeView, setActiveView] = useState<DesktopView>('main');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('search');
  const [currentClient, setCurrentClient] = useState<ClientProfile | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  const [txAmount, setTxAmount] = useState('');
  const [txCheckId, setTxCheckId] = useState('');
  const [txRedeemPoints, setTxRedeemPoints] = useState('');
  const [txAccruePoints, setTxAccruePoints] = useState(0);
  const [txFinalAmount, setTxFinalAmount] = useState(0);
  const [txType, setTxType] = useState<TxMode>('accrue');

  const [userToken, setUserToken] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [actionError, setActionError] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);

  const [historyRaw, setHistoryRaw] = useState<Txn[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histNextBefore, setHistNextBefore] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'return'>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [returnTx, setReturnTx] = useState<UiTransaction | null>(null);
  const [returnSearchInput, setReturnSearchInput] = useState('');
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [motivationInfo, setMotivationInfo] = useState<{
    enabled: boolean;
    periodLabel: string;
    pointsNew: number;
    pointsExisting: number;
  } | null>(null);
  const [ratingFilter, setRatingFilter] = useState<'all' | 'my_outlet'>('all');

  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [refundError, setRefundError] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('checkout');
  const [mobileMode, setMobileMode] = useState<CheckoutMode>('landing');
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedTx, setSelectedTx] = useState<UiTransaction | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    staff: '',
    amountFrom: '',
    amountTo: '',
  });
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);

  const [isMobile, setIsMobile] = useState(false);

  const normalizedLogin = appLogin.trim().toLowerCase();

  useEffect(() => {
    if (!isBrowser || !window.matchMedia) return;
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(query.matches);
    update();
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  useEffect(() => {
    if (!actionError || !isMobile) return;
    alert(actionError);
    setActionError('');
  }, [actionError, isMobile]);

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
      try {
        const resp = await fetch(`${API_BASE}/loyalty/cashier/session`, {
          credentials: 'include',
        });
        if (resp.ok) {
          const data = await resp.json().catch(() => null);
          if (cancelled) return;
          if (data?.active) {
            const info = mapSessionResponse(data);
            setSession(info);
            setMerchantId(info.merchantId || MERCHANT);
            setRememberPin(Boolean(info.rememberPin));
            setAuthStep('authorized');
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      setSession(null);

      try {
        const resp = await fetch(`${API_BASE}/loyalty/cashier/device`, {
          credentials: 'include',
        });
        if (resp.ok) {
          const data = await resp.json().catch(() => null);
          if (cancelled) return;
          if (data?.active) {
            const login = typeof data?.login === 'string' ? String(data.login) : '';
            const mid = typeof data?.merchantId === 'string' ? String(data.merchantId) : '';
            setDeviceActive(true);
            if (mid) setMerchantId(mid);
            if (login) setAppLogin(login);
            setAuthStep('staff_pin');
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      setDeviceActive(false);
      setPin('');
      setAuthError('');
      setAuthStep('app_login');
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setOrderId(buildOrderId());
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
    if (!isBrowser) return;
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

  const activateDevice = async () => {
    setAuthError('');
    try {
      if (!normalizedLogin || !appPassword || appPassword.length !== 9) {
        throw new Error('Укажите логин мерчанта и 9‑значный код активации');
      }
      const r = await fetch(`${API_BASE}/loyalty/cashier/activate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantLogin: normalizedLogin, activationCode: appPassword }),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось активировать устройство'));
      const data = await r.json();
      const resolvedMerchantId = data?.merchantId ? String(data.merchantId) : '';
      const resolvedLogin = data?.login ? String(data.login) : normalizedLogin;
      if (resolvedMerchantId) setMerchantId(resolvedMerchantId);
      setDeviceActive(true);
      setAppLogin(resolvedLogin);
      setPin('');
      setAppPassword('');
      setAuthStep('staff_pin');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAuthError(humanizeCashierAuthError(message));
    }
  };

  const startCashierSession = async (pinCode: string) => {
    setPinMessage('');
    try {
      if (!deviceActive) throw new Error('Device not activated');
      if (!normalizedLogin) throw new Error('merchantLogin required');
      const r = await fetch(`${API_BASE}/loyalty/cashier/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantLogin: normalizedLogin, pinCode, rememberPin }),
      });
      if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось войти по PIN'));
      const data = await r.json();
      const sessionInfo = mapSessionResponse(data);
      setSession(sessionInfo);
      setMerchantId(sessionInfo.merchantId || MERCHANT);
      setRememberPin(Boolean(sessionInfo.rememberPin));
      setPin('');
      setAuthStep('authorized');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPinMessage(humanizeCashierAuthError(message));
      setPinError(true);
      setTimeout(() => {
        setPin('');
        setPinError(false);
        setPinMessage('');
      }, 800);
    }
  };

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setPinError(false);
      setPinMessage('');
      if (newPin.length === 4) {
        void startCashierSession(newPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
    setPinMessage('');
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
    resetAll();

    try {
      const resp = await fetch(`${API_BASE}/loyalty/cashier/device`, {
        credentials: 'include',
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data?.active) {
          const login = typeof data?.login === 'string' ? String(data.login) : '';
          const mid = typeof data?.merchantId === 'string' ? String(data.merchantId) : '';
          setDeviceActive(true);
          if (mid) setMerchantId(mid);
          if (login) setAppLogin(login);
          setAuthStep('staff_pin');
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setDeviceActive(false);
    setAuthStep('app_login');
  };

  const deactivateDevice = async () => {
    setAuthError('');
    try {
      await fetch(`${API_BASE}/loyalty/cashier/device`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      /* ignore */
    }
    setDeviceActive(false);
    setPin('');
    setAppPassword('');
    setAuthStep('app_login');
  };

  const loadCustomerBalance = async (customerIdValue: string, merchant: string): Promise<number | null> => {
    try {
      const r = await fetch(
        `${API_BASE}/loyalty/balance/${merchant}/${encodeURIComponent(customerIdValue)}`,
        { credentials: 'include' },
      );
      if (!r.ok) return null;
      const data = await r.json();
      if (typeof data?.balance === 'number') return data.balance;
      return null;
    } catch {
      return null;
    }
  };

  const loadCustomerLevel = async (merchant: string, customerIdValue: string): Promise<LevelInfo | null> => {
    try {
      const r = await fetch(`${API_BASE}/levels/${merchant}/${encodeURIComponent(customerIdValue)}`, {
        credentials: 'include',
      });
      if (!r.ok) return null;
      const data = await r.json();
      const level = data?.current ?? data?.level ?? null;
      const levelName = typeof level?.name === 'string' && level.name.trim() ? level.name.trim() : null;
      const redeemRateValue = level?.redeemRateBps ?? level?.redeemLimitBps;
      const minPaymentValue = level?.minPaymentAmount ?? level?.minPayment;
      const rawRedeemRate = redeemRateValue != null ? Number(redeemRateValue) : Number.NaN;
      const rawMinPayment = minPaymentValue != null ? Number(minPaymentValue) : Number.NaN;
      return {
        name: levelName,
        redeemRateBps: Number.isFinite(rawRedeemRate) ? Math.max(0, Math.floor(rawRedeemRate)) : null,
        minPaymentAmount: Number.isFinite(rawMinPayment) ? Math.max(0, Math.floor(rawMinPayment)) : null,
      };
    } catch {
      return null;
    }
  };

  const fetchCustomerOverview = async (token: string): Promise<ClientProfile | null> => {
    const merchant = session?.merchantId || merchantId;
    if (!merchant) return null;
    const fallbackName = extractNameFromToken(token);
    const fallbackId = resolveCustomerIdFromToken(token);
    try {
      const r = await fetch(`${API_BASE}/loyalty/cashier/customer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: merchant, userToken: token }),
      });
      if (!r.ok) {
        const msg = await readErrorMessage(r, 'Не удалось загрузить данные клиента');
        throw new Error(msg);
      }
      const data = await r.json();
      const resolvedCustomerId =
        typeof data?.customerId === 'string' && data.customerId.trim().length > 0
          ? data.customerId.trim()
          : fallbackId;
      const nameFromApi =
        typeof data?.name === 'string' && data.name.trim().length > 0 ? data.name.trim() : null;
      setCustomerId(resolvedCustomerId ?? null);
      const balanceHint = typeof data?.balance === 'number' ? data.balance : null;
      const redeemLimitRaw =
        typeof data?.redeemLimitBps === 'number'
          ? data.redeemLimitBps
          : typeof data?.redeemRateBps === 'number'
            ? data.redeemRateBps
            : null;
      const redeemLimitHint =
        redeemLimitRaw != null && Number.isFinite(redeemLimitRaw)
          ? Math.max(0, Math.floor(Number(redeemLimitRaw)))
          : null;
      const minPaymentRaw =
        typeof data?.minPaymentAmount === 'number'
          ? data.minPaymentAmount
          : typeof data?.minPayment === 'number'
            ? data.minPayment
            : null;
      const minPaymentHint =
        minPaymentRaw != null && Number.isFinite(minPaymentRaw)
          ? Math.max(0, Math.floor(Number(minPaymentRaw)))
          : null;
      const balancePromise =
        resolvedCustomerId != null
          ? balanceHint != null
            ? Promise.resolve(balanceHint)
            : loadCustomerBalance(resolvedCustomerId, merchant)
          : Promise.resolve<number | null>(null);
      const levelPromise =
        resolvedCustomerId != null
          ? loadCustomerLevel(merchant, resolvedCustomerId)
          : Promise.resolve<LevelInfo | null>(null);
      const [balance, levelInfo] = await Promise.all([balancePromise, levelPromise]);
      const name = nameFromApi ?? fallbackName ?? 'Новый клиент';
      const redeemRateBps =
        redeemLimitHint != null && levelInfo?.redeemRateBps != null
          ? Math.min(redeemLimitHint, levelInfo.redeemRateBps)
          : redeemLimitHint ?? levelInfo?.redeemRateBps ?? null;
      const minPaymentAmount =
        minPaymentHint != null && levelInfo?.minPaymentAmount != null
          ? Math.max(minPaymentHint, levelInfo.minPaymentAmount)
          : minPaymentHint ?? levelInfo?.minPaymentAmount ?? null;
      const profile: ClientProfile = {
        id: resolvedCustomerId ?? fallbackId ?? '—',
        name,
        level: levelInfo?.name ?? 'Base',
        balance: balance ?? 0,
        avatar: extractInitials(name),
        redeemRateBps,
        minPaymentAmount,
      };
      setCurrentClient(profile);
      return profile;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setCustomerId(null);
      setCurrentClient(null);
      setActionError(humanizeQuoteError(message));
      return null;
    }
  };

  const cancelHoldIfNeeded = async (holdToCancel: string | null) => {
    if (!holdToCancel) return;
    try {
      const url = buildApiUrl('/loyalty/cancel');
      await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdId: holdToCancel }),
      });
    } catch {
      /* ignore */
    }
  };

  const resetQuoteState = (options?: { clearRedeem?: boolean }) => {
    setHoldId(null);
    setResult(null);
    setTxAccruePoints(0);
    setTxFinalAmount(0);
    setActionError('');
    if (options?.clearRedeem) {
      setTxRedeemPoints('');
    }
  };

  const resetTransaction = () => {
    void cancelHoldIfNeeded(holdId);
    setTxAmount('');
    setTxCheckId('');
    setTxType('accrue');
    resetQuoteState({ clearRedeem: true });
  };

  const resetCheckout = () => {
    resetTransaction();
    setInputValue('');
    setCurrentClient(null);
    setCheckoutStep('search');
  };

  const resetAll = (options?: { preserveTab?: boolean }) => {
    resetCheckout();
    setReturnTx(null);
    setReturnSearchInput('');
    setReturnSuccess(false);
    setRefundPreview(null);
    setRefundError('');
    setMobileMode('landing');
    if (!options?.preserveTab) {
      setActiveTab('checkout');
    }
    setSelectedTx(null);
  };

  const handleSwitchView = (view: DesktopView) => {
    setActiveView(view);
    if (view !== 'main') resetCheckout();
    if (view !== 'return') {
      setReturnTx(null);
      setReturnSearchInput('');
      setReturnSuccess(false);
      setRefundPreview(null);
      setRefundError('');
    }
  };

  const beginFlow = async (token: string) => {
    setActionError('');
    resetTransaction();
    setUserToken(token);
    setOrderId(buildOrderId());
    const profile = await fetchCustomerOverview(token);
    if (!profile) return;
    setCheckoutStep('amount');
    setMobileMode('profile');
  };

  const callQuote = async (overrides: {
    total: number;
    mode: 'redeem' | 'earn';
    receiptNumber?: string;
    redeemAmount?: number;
  }): Promise<QuoteRedeemResp | QuoteEarnResp | null> => {
    if (!session) {
      setActionError('Сначала авторизуйтесь в кассире.');
      return null;
    }
    setIsProcessing(true);
    setActionError('');
    setResult(null);
    setHoldId(null);
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
          mode: overrides.mode,
          userToken,
          orderId,
          total: overrides.total,
          outletId: activeOutletId || undefined,
          staffId: activeStaffId || undefined,
          receiptNumber: overrides.receiptNumber || undefined,
          redeemAmount:
            overrides.redeemAmount != null && overrides.redeemAmount > 0
              ? overrides.redeemAmount
              : undefined,
        }),
      });
      if (!r.ok) {
        throw new Error(await readErrorMessage(r, 'Не удалось выполнить расчёт'));
      }
      const data = await r.json();
      setResult(data);
      const holdCandidate = (data as { holdId?: unknown } | null)?.holdId;
      setHoldId(typeof holdCandidate === 'string' ? holdCandidate : null);
      return data;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActionError(humanizeQuoteError(message));
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const callCommit = async () => {
    if (!session) {
      setActionError('Сначала авторизуйтесь в кассире.');
      return null;
    }
    if (!holdId) {
      setActionError('Сначала выполните расчёт.');
      return null;
    }
    setIsProcessing(true);
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const normalizedReceiptNumber = txCheckId.trim();
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
        throw new Error(await readErrorMessage(r, 'Не удалось завершить операцию'));
      }
      const data = await r.json();
      if (typeof data?.customerId === 'string') {
        setCustomerId(data.customerId);
      }
      if (data?.ok) {
        const eventCustomerId =
          typeof data?.customerId === 'string'
            ? data.customerId
            : resolveCustomerIdFromToken(userToken);
        emitLoyaltyEvent({
          type: 'loyalty.commit',
          merchantId: activeMerchantId,
          customerId: eventCustomerId,
          orderId,
          receiptNumber: normalizedReceiptNumber || undefined,
          redeemApplied: typeof data?.redeemApplied === 'number' ? data.redeemApplied : undefined,
          earnApplied: typeof data?.earnApplied === 'number' ? data.earnApplied : undefined,
          alreadyCommitted: Boolean(data?.alreadyCommitted),
          mode: txType === 'redeem' ? 'redeem' : 'earn',
        });
        const appliedRedeem = typeof data?.redeemApplied === 'number' ? data.redeemApplied : Number(txRedeemPoints) || 0;
        const appliedEarn = typeof data?.earnApplied === 'number' ? data.earnApplied : txAccruePoints;
        const totalValue = Number(txAmount) || 0;
        setTxRedeemPoints(appliedRedeem > 0 ? String(appliedRedeem) : '');
        setTxAccruePoints(appliedEarn || 0);
        setTxFinalAmount(Math.max(0, totalValue - appliedRedeem));
        setHoldId(null);
        setResult(null);
        const scannedKey = qrKeyFromToken(userToken);
        if (scannedKey) {
          scannedTokensRef.current.add(scannedKey);
          saveScanned();
        }
        setOrderId(buildOrderId());
        await fetchCustomerOverview(userToken);
        await loadHistory(true);
        return data;
      }
      setActionError('Не удалось завершить операцию.');
      return null;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActionError(humanizeQuoteError(message));
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAccrueQuote = async () => {
    const amountValue = Number(txAmount) || 0;
    if (!amountValue) return;
    await cancelHoldIfNeeded(holdId);
    resetQuoteState({ clearRedeem: true });
    setTxType('accrue');
    const data = await callQuote({
      total: amountValue,
      mode: 'earn',
      receiptNumber: txCheckId || undefined,
    });
    if (!data) return;
    const earn = Number((data as QuoteEarnResp)?.pointsToEarn ?? 0);
    setTxAccruePoints(earn);
    setTxFinalAmount(amountValue);
    setCheckoutStep('precheck');
    setMobileMode('precheck');
  };

  const handleRedeemQuote = async () => {
    const amountValue = Number(txAmount) || 0;
    if (!amountValue) return;
    const redeemValue = Math.max(0, Math.floor(Number(txRedeemPoints) || 0));
    if (!redeemValue || redeemValue > redeemableMax) return;
    await cancelHoldIfNeeded(holdId);
    resetQuoteState();
    setTxType('redeem');
    const data = await callQuote({
      total: amountValue,
      mode: 'redeem',
      receiptNumber: txCheckId || undefined,
      redeemAmount: redeemValue,
    });
    if (!data) return;
    const redeemApplied = Number((data as QuoteRedeemResp)?.discountToApply ?? redeemValue);
    const finalPayable = Number((data as QuoteRedeemResp)?.finalPayable ?? Math.max(0, amountValue - redeemApplied));
    const postEarn = Number((data as QuoteRedeemResp)?.postEarnPoints ?? 0);
    setTxRedeemPoints(redeemApplied > 0 ? String(redeemApplied) : '');
    setTxAccruePoints(postEarn || 0);
    setTxFinalAmount(finalPayable);
    setCheckoutStep('precheck');
    setMobileMode('precheck');
  };

  const handleCommit = async () => {
    const data = await callCommit();
    if (!data) return;
    setCheckoutStep('success');
    setMobileMode('success');
  };

  const loadHistory = async (reset = false) => {
    if (histBusy) return;
    const activeMerchantId = session?.merchantId || merchantId;
    const outletId = session?.outlet?.id || null;
    if (!activeMerchantId || !outletId) return;
    setHistBusy(true);
    try {
      const url = buildApiUrl('/loyalty/cashier/outlet-transactions');
      url.searchParams.set('merchantId', activeMerchantId);
      url.searchParams.set('outletId', outletId);
      url.searchParams.set('limit', '50');
      if (!reset && histNextBefore) url.searchParams.set('before', histNextBefore);
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось загрузить историю'));
      const data = await r.json();
      const items: Txn[] = Array.isArray(data.items) ? data.items : [];
      setHistoryRaw((old) => (reset ? items : [...old, ...items]));
      setHistNextBefore(typeof data.nextBefore === 'string' ? data.nextBefore : null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActionError(humanizeQuoteError(message));
    } finally {
      setHistBusy(false);
    }
  };

  useEffect(() => {
    setHistoryRaw([]);
    setHistNextBefore(null);
    if (session?.outlet?.id) void loadHistory(true);
  }, [session?.outlet?.id, session?.merchantId]);

  const loadLeaderboard = useCallback(async () => {
    if (!session) {
      setLeaderboard([]);
      setMotivationInfo(null);
      return;
    }
    setLeaderboardLoading(true);
    setLeaderboardError('');
    try {
      const url = buildApiUrl('/loyalty/cashier/leaderboard');
      url.searchParams.set('merchantId', session.merchantId);
      if (ratingFilter === 'my_outlet' && session.outlet?.id) {
        url.searchParams.set('outletId', session.outlet.id);
      }
      const r = await fetch(url.toString(), { credentials: 'include' });
      if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось загрузить рейтинг'));
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
          : buildMotivationPeriodLabel(periodKind, period?.customDays ?? settings?.customDays ?? null);
      setMotivationInfo({
        enabled: Boolean(data?.enabled),
        periodLabel,
        pointsNew: Number(settings?.pointsForNewCustomer ?? MOTIVATION_DEFAULT_NEW_POINTS),
        pointsExisting: Number(settings?.pointsForExistingCustomer ?? MOTIVATION_DEFAULT_EXISTING_POINTS),
      });
      const items: RawLeaderboardItem[] = Array.isArray(data?.items) ? data.items : [];
      const entries: LeaderboardEntry[] = items.map((item) => ({
        staffId: String(item?.staffId ?? ''),
        staffName:
          String(item?.staffName ?? item?.staffDisplayName ?? item?.staffLogin ?? '').trim() || 'Сотрудник',
        outletName: typeof item?.outletName === 'string' ? item.outletName : null,
        points: Number(item?.points ?? 0),
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
  }, [session, ratingFilter]);

  useEffect(() => {
    if (activeTab === 'rating' || activeView === 'rating') {
      void loadLeaderboard();
    }
  }, [activeTab, activeView, loadLeaderboard]);

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
    if (key && scannedTokensRef.current.has(key)) {
      setActionError('Этот QR уже использован. Попросите клиента обновить QR в приложении.');
      return;
    }
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

  const staffRole = useMemo(() => {
    const role = session?.staff?.role ?? 'CASHIER';
    if (role.toUpperCase() === 'SENIOR_CASHIER') return 'Старший кассир';
    if (role.toUpperCase() === 'CASHIER') return 'Кассир';
    return role;
  }, [session?.staff?.role]);

  const outletName = useMemo(() => {
    if (!session) return '';
    return session.outlet.name || session.outlet.id || '';
  }, [session]);

  const employee = useMemo(() => {
    const name = staffName || 'Сотрудник';
    return {
      name,
      role: staffRole || 'Кассир',
      outlet: outletName || 'Торговая точка',
      avatar: extractInitials(name),
    };
  }, [staffName, staffRole, outletName]);

  const uiHistory = useMemo<UiTransaction[]>(() => {
    return historyRaw
      .filter((item) => item.mode !== 'TXN' || item.purchaseAmount != null)
      .map((item) => {
        const date = new Date(item.createdAt);
        const amountBase =
          item.purchaseAmount != null ? item.purchaseAmount : Math.abs(Number(item.amount ?? 0));
        let pointsAccrued = 0;
        let pointsRedeemed = 0;
        let type: 'sale' | 'return' = 'sale';
        if (item.mode === 'PURCHASE') {
          pointsAccrued = Math.max(0, Number(item.earnApplied ?? 0));
          pointsRedeemed = Math.max(0, Number(item.redeemApplied ?? 0));
          type = 'sale';
        } else if (item.mode === 'REFUND') {
          pointsAccrued = -Math.max(0, Number(item.refundEarn ?? 0));
          pointsRedeemed = -Math.max(0, Number(item.refundRedeem ?? 0));
          type = 'return';
        } else {
          const amount = Math.round(Number(item.amount ?? 0));
          if (item.type === 'REDEEM') pointsRedeemed = Math.abs(amount);
          if (item.type === 'EARN') pointsAccrued = Math.abs(amount);
          type = item.type === 'REFUND' ? 'return' : 'sale';
        }
        return {
          id: item.id,
          checkId: item.receiptNumber || item.orderId || item.id,
          date,
          type,
          client: item.customerName || 'Клиент',
          staff: item.staffName?.trim() || 'Сотрудник',
          staffId: item.staffId ?? null,
          amount: Math.max(0, Math.round(Number(amountBase) || 0)),
          pointsAccrued,
          pointsRedeemed,
          orderId: item.orderId ?? null,
          receiptNumber: item.receiptNumber ?? null,
        };
      });
  }, [historyRaw]);

  const filteredHistory = useMemo(() => {
    return uiHistory.filter((tx) => {
      if (historySearch) {
        const lowerSearch = historySearch.toLowerCase();
        if (!tx.checkId.toLowerCase().includes(lowerSearch) && !tx.client.toLowerCase().includes(lowerSearch)) {
          return false;
        }
      }
      if (filterDate) {
        if (tx.date.toISOString().split('T')[0] !== filterDate) return false;
      }
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterStaff !== 'all' && tx.staff !== filterStaff) return false;
      return true;
    });
  }, [uiHistory, historySearch, filterDate, filterType, filterStaff]);

  useEffect(() => {
    setCurrentPage(1);
  }, [historySearch, filterDate, filterType, filterStaff]);

  const itemsPerPage = 8;
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(start, start + itemsPerPage);
  }, [filteredHistory, currentPage]);

  const uniqueStaff = useMemo(() => Array.from(new Set(uiHistory.map((tx) => tx.staff))), [uiHistory]);
  const activeStaffId = session?.staff?.id || null;
  const staffScopedHistory = useMemo(() => {
    if (!activeStaffId) return uiHistory;
    return uiHistory.filter((tx) => tx.staffId === activeStaffId);
  }, [uiHistory, activeStaffId]);
  const recentTx = useMemo(() => staffScopedHistory.slice(0, 5), [staffScopedHistory]);

  const shiftStats = useMemo(() => {
    const today = new Date();
    const isSameDay = (date: Date) =>
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    const salesToday = staffScopedHistory.filter((tx) => tx.type === 'sale' && isSameDay(tx.date));
    const revenue = salesToday.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      revenue: Math.max(0, Math.round(revenue)),
      checks: salesToday.length,
    };
  }, [staffScopedHistory]);

  const fmtMoney = (val: number) => val.toLocaleString('ru-RU');

  const handleNumClick = (num: string) => {
    if (inputValue.length < 16) setInputValue((prev) => prev + num);
  };
  const handleBackspace = () => setInputValue((prev) => prev.slice(0, -1));
  const handleClear = () => setInputValue('');

  const handleSearchAction = async (action: 'scan' | 'search') => {
    if (!inputValue && action !== 'scan') return;
    if (action === 'scan') {
      setScanOpen(true);
      setMobileMode('scanning');
      return;
    }
    if (searchBusy) return;
    setActionError('');
    setSearchBusy(true);
    try {
      await beginFlow(inputValue);
    } finally {
      setSearchBusy(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const keys = [
    { label: '1', val: '1' },
    { label: '2', val: '2' },
    { label: '3', val: '3' },
    { label: '4', val: '4' },
    { label: '5', val: '5' },
    { label: '6', val: '6' },
    { label: '7', val: '7' },
    { label: '8', val: '8' },
    { label: '9', val: '9' },
    { label: 'C', val: 'clear', type: 'secondary' },
    { label: '0', val: '0' },
    { label: '⌫', val: 'back', type: 'secondary' },
  ];

  const { redeemableMax, redeemPolicyMax } = useMemo(() => {
    const amountValue = Math.max(0, Number(txAmount) || 0);
    const balanceValue = Math.max(0, currentClient?.balance ?? 0);
    const redeemRateValue = currentClient?.redeemRateBps;
    const minPaymentValue = currentClient?.minPaymentAmount;
    const rawRedeemRate = redeemRateValue != null ? Number(redeemRateValue) : Number.NaN;
    const rawMinPayment = minPaymentValue != null ? Number(minPaymentValue) : Number.NaN;
    const redeemRateBps = Number.isFinite(rawRedeemRate) ? Math.max(0, Math.floor(rawRedeemRate)) : null;
    const minPaymentAmount = Number.isFinite(rawMinPayment) ? Math.max(0, Math.floor(rawMinPayment)) : null;
    const limitByRate = redeemRateBps != null ? Math.floor((amountValue * redeemRateBps) / 10000) : amountValue;
    const limitByMinPayment = minPaymentAmount != null ? Math.max(0, Math.floor(amountValue - minPaymentAmount)) : amountValue;
    const policyMax = Math.max(0, Math.min(amountValue, limitByRate, limitByMinPayment));
    return {
      redeemableMax: Math.max(0, Math.min(balanceValue, policyMax)),
      redeemPolicyMax: policyMax,
    };
  }, [currentClient?.balance, currentClient?.redeemRateBps, currentClient?.minPaymentAmount, txAmount]);

  const handleReturnSearch = async () => {
    if (!returnSearchInput.trim()) return;
    setRefundError('');
    setRefundPreview(null);
    setRefundBusy(true);
    setReturnSuccess(false);
    try {
      if (!session) throw new Error('Сначала авторизуйтесь в кассире.');
      const code = returnSearchInput.trim();
      const activeMerchantId = session?.merchantId || merchantId;
      const outletId = session?.outlet?.id || null;
      if (!outletId) throw new Error('Нет выбранной торговой точки');
      let found: Txn | null = null;
      let nextBefore: string | null = null;
      while (!found) {
        const url = buildApiUrl('/loyalty/cashier/outlet-transactions');
        url.searchParams.set('merchantId', activeMerchantId);
        url.searchParams.set('outletId', outletId);
        url.searchParams.set('limit', '100');
        if (nextBefore) url.searchParams.set('before', nextBefore);
        const r = await fetch(url.toString(), { credentials: 'include' });
        if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось найти чек'));
        const data = await r.json();
        const items: Txn[] = Array.isArray(data.items) ? data.items : [];
        found =
          items.find(
            (i) =>
              i.mode === 'PURCHASE' &&
              (i.receiptNumber === code || (i.orderId ?? '').trim() === code),
          ) ?? null;
        if (found) break;
        nextBefore = typeof data.nextBefore === 'string' ? data.nextBefore : null;
        if (!nextBefore) break;
      }
      if (!found) {
        setRefundError('Чек с таким номером или ID операции не найден');
        setReturnTx(null);
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
      setReturnTx({
        id: found.id,
        checkId: found.receiptNumber || found.orderId || found.id,
        date: new Date(found.createdAt),
        type: 'sale',
        client: found.customerName || 'Клиент',
        staff: found.staffName?.trim() || 'Сотрудник',
        staffId: found.staffId ?? null,
        amount: Math.max(0, Math.round(Number(purchaseAmount) || 0)),
        pointsAccrued: pointsToRevoke,
        pointsRedeemed: pointsToRestore,
        orderId: found.orderId ?? null,
        receiptNumber: found.receiptNumber ?? null,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setRefundError(humanizeRefundError(message));
      setReturnTx(null);
    } finally {
      setRefundBusy(false);
    }
  };

  const doRefund = async () => {
    if (!session) {
      setRefundError('Сначала авторизуйтесь в кассире.');
      return;
    }
    const code = returnSearchInput.trim();
    if (!code) {
      setRefundError('Укажите номер чека или ID операции');
      return;
    }
    const preview = refundPreview;
    if (!preview) {
      await handleReturnSearch();
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
      if (!r.ok) throw new Error(await readErrorMessage(r, 'Не удалось оформить возврат'));
      const data = await r.json();
      if (typeof data?.customerId === 'string') {
        setCustomerId(data.customerId);
      }
      setReturnSearchInput('');
      setRefundPreview(null);
      setReturnTx(null);
      setReturnSuccess(true);
      await loadHistory(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setRefundError(humanizeRefundError(message));
    } finally {
      setRefundBusy(false);
    }
  };

  const handleConfirmReturn = async () => {
    await doRefund();
    if (!isMobile) {
      if (!refundError) {
        alert('Возврат выполнен. Баллы пересчитаны.');
      }
      setReturnTx(null);
      setReturnSearchInput('');
      setReturnSuccess(false);
    }
  };

  const currentUserRating = useMemo(() => {
    const entries = [...leaderboard].sort((a, b) => b.points - a.points);
    const idx = entries.findIndex((u) => u.staffId && session?.staff?.id && u.staffId === session.staff.id);
    if (idx < 0) return null;
    return {
      score: entries[idx]?.points ?? 0,
      rank: idx + 1,
    };
  }, [leaderboard, session?.staff?.id]);

  const filteredLeaderboard = useMemo(() => {
    let data = leaderboard;
    if (ratingFilter === 'my_outlet') {
      data = data.filter((s) => s.outletName === employee.outlet);
    }
    return [...data].sort((a, b) => b.points - a.points);
  }, [leaderboard, ratingFilter, employee.outlet]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  const filteredHistoryMobile = useMemo(() => {
    return uiHistory.filter((tx) => {
      const searchLower = searchQuery.toLowerCase();
      if (searchQuery && !tx.client.toLowerCase().includes(searchLower) && !tx.checkId.includes(searchLower)) {
        return false;
      }
      if (filters.dateFrom) {
        const txDate = new Date(tx.date).setHours(0, 0, 0, 0);
        const fromDate = new Date(filters.dateFrom).setHours(0, 0, 0, 0);
        if (txDate < fromDate) return false;
      }
      if (filters.dateTo) {
        const txDate = new Date(tx.date).setHours(0, 0, 0, 0);
        const toDate = new Date(filters.dateTo).setHours(0, 0, 0, 0);
        if (txDate > toDate) return false;
      }
      if (filters.staff && tx.staff !== filters.staff) return false;
      if (filters.amountFrom && tx.amount < Number(filters.amountFrom)) return false;
      if (filters.amountTo && tx.amount > Number(filters.amountTo)) return false;
      return true;
    });
  }, [uiHistory, searchQuery, filters]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - dragStartY.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragY > 120) {
      closeModal();
    } else {
      setDragY(0);
    }
  };

  const closeModal = () => {
    setSelectedTx(null);
    setIsCopied(false);
    setDragY(0);
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      staff: '',
      amountFrom: '',
      amountTo: '',
    });
  };

  const handleCopyMobile = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  const handleNumpadInput = (key: string, setter: (value: string) => void, value: string) => {
    if (key === 'clear') {
      setter('');
      return;
    }
    if (key === 'backspace') {
      setter(value.slice(0, -1));
      return;
    }
    if (value.length < 15) setter(value + key);
  };

  const startScan = () => {
    setScanOpen(true);
    setMobileMode('scanning');
  };

  const startManualInput = () => {
    setMobileMode('manual_input');
  };

  const performSearch = async () => {
    if (inputValue.length < 3) return;
    await beginFlow(inputValue);
  };

  const startCheckout = (type: TxMode) => {
    setTxType(type);
    setMobileMode('amount');
  };

  const confirmAmount = () => {
    const amountValue = Number(txAmount) || 0;
    if (!amountValue) return;
    if (txType === 'redeem') {
      setMobileMode('redeem');
    } else {
      void handleAccrueQuote();
    }
  };

  const confirmRedeem = () => {
    void handleRedeemQuote();
  };

  const completeTransaction = () => {
    void handleCommit();
  };

  const setRedeemMax = () => {
    setTxRedeemPoints(Math.floor(redeemableMax).toString());
  };

  const handlePrecheckBack = async () => {
    await cancelHoldIfNeeded(holdId);
    resetQuoteState();
    setCheckoutStep(Number(txRedeemPoints) > 0 ? 'redeem' : 'mode');
  };

  const handleMobilePrecheckBack = async () => {
    await cancelHoldIfNeeded(holdId);
    resetQuoteState();
    setMobileMode(txType === 'accrue' ? 'amount' : 'redeem');
  };

  if (authStep === 'app_login') {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-4 [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="p-10 [@media(max-height:700px)]:p-8 [@media(max-height:600px)]:p-6">
            <div className="flex justify-center mb-8 [@media(max-height:700px)]:mb-6 [@media(max-height:600px)]:mb-4">
              <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center shadow-md shadow-purple-200 [@media(max-height:700px)]:w-14 [@media(max-height:700px)]:h-14 [@media(max-height:600px)]:w-12 [@media(max-height:600px)]:h-12">
                <Store size={32} className="text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">Терминал</h2>
            <p className="text-center text-gray-500 text-sm mb-8 font-medium [@media(max-height:700px)]:mb-6 [@media(max-height:600px)]:mb-4 [@media(max-height:600px)]:text-xs">
              Авторизация устройства
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void activateDevice();
              }}
              className="space-y-5 [@media(max-height:600px)]:space-y-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Логин</label>
                <div className="relative">
                  <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={appLogin}
                    onChange={(e) => setAppLogin(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 pl-11 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-medium [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2.5"
                    placeholder="Например: shop_01"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Пароль</label>
                <div className="relative">
                  <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={appPassword}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                      setAppPassword(val);
                    }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-12 py-3.5 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-mono text-lg tracking-widest [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2.5 [@media(max-height:600px)]:text-base"
                    placeholder="•••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs font-medium border border-red-100 [@media(max-height:600px)]:p-2.5 [@media(max-height:600px)]:text-[11px]">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!appLogin || appPassword.length < 9}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg shadow-gray-200 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-4 [@media(max-height:700px)]:py-3.5 [@media(max-height:600px)]:py-3"
              >
                Войти
              </button>
            </form>
          </div>
          <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (authStep === 'staff_pin') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2">
        <button
          onClick={deactivateDevice}
          className="absolute top-6 left-6 text-gray-500 hover:text-gray-900 flex items-center space-x-2 transition-colors [@media(max-height:700px)]:top-3 [@media(max-height:700px)]:left-3 [@media(max-height:600px)]:text-sm"
        >
          <ArrowLeft size={20} /> <span>Сменить терминал</span>
        </button>

        <div className="w-full max-w-sm text-center space-y-8 [@media(max-height:700px)]:space-y-6 [@media(max-height:600px)]:space-y-4">
          <div>
            <div className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center shadow-sm mb-4 [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:mb-3">
              <Lock size={32} className="text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">Вход сотрудника</h2>
            <p className="text-gray-500 mt-2 [@media(max-height:600px)]:text-sm">Введите ваш 4-значный PIN-код</p>
          </div>

          <div className={`flex justify-center space-x-4 mb-8 [@media(max-height:700px)]:space-x-3 [@media(max-height:700px)]:mb-6 [@media(max-height:600px)]:space-x-2 [@media(max-height:600px)]:mb-4 ${pinError ? 'animate-shake' : ''}`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 [@media(max-height:600px)]:w-3 [@media(max-height:600px)]:h-3 ${
                  i < pin.length ? (pinError ? 'bg-red-500 scale-110' : 'bg-purple-600 scale-110') : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          <div className="h-6 [@media(max-height:600px)]:h-5">
            {(pinError || pinMessage) && (
              <p className="text-red-500 text-sm font-medium [@media(max-height:600px)]:text-xs">
                {pinMessage || 'Неверный PIN-код'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 [@media(max-height:700px)]:gap-3 [@media(max-height:600px)]:gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handlePinInput(num.toString());
                }}
                className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:text-lg"
              >
                {num}
              </button>
            ))}
            <div className="w-20 h-20 flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14"></div>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                handlePinInput('0');
              }}
              className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:text-lg"
            >
              0
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                handlePinBackspace();
              }}
              className="w-20 h-20 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-all mx-auto [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14"
            >
              <ChevronLeft size={32} />
            </button>
          </div>
        </div>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          .animate-shake { animation: shake 0.3s ease-in-out; }
        `}</style>
      </div>
    );
  }

  const purchaseAmount = Number(txAmount) || 0;
  const redeemAmount = Math.max(0, Number(txRedeemPoints) || 0);
  const payableAmount = Math.max(0, txFinalAmount || Math.max(purchaseAmount - redeemAmount, 0));

  const renderDesktop = () => (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      {scanOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <div className="relative w-72 h-72 rounded-2xl overflow-hidden bg-gray-900 shadow-2xl ring-4 ring-white/10">
            <QrScanner
              onResult={onScan}
              onClose={() => setScanOpen(false)}
              onError={(message) => {
                setActionError(message);
                setScanOpen(false);
              }}
              className="absolute inset-0"
              viewfinderClassName="w-full h-full"
            />
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-purple-500 rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-purple-500 rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-purple-500 rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-purple-500 rounded-br-xl"></div>
            <div
              className="absolute left-0 w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-[scan_2s_ease-in-out_infinite]"
              style={{ top: '50%' }}
            ></div>
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30">
              <QrCode size={64} className="text-white mb-2" />
              <span className="text-white text-xs tracking-widest font-mono">SCANNING</span>
            </div>
          </div>

          <p className="text-white mt-8 text-lg font-medium tracking-wide">Наведите камеру на QR-код</p>
          <p className="text-white/50 text-sm mt-2">Поиск клиента...</p>

          <button
            onClick={() => setScanOpen(false)}
            className="mt-10 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium backdrop-blur-md transition-all border border-white/10"
          >
            Отмена
          </button>

          <style>{`
            @keyframes scan {
              0% { top: 10%; opacity: 0; }
              25% { opacity: 1; }
              50% { top: 90%; opacity: 1; }
              75% { opacity: 1; }
              100% { top: 10%; opacity: 0; }
            }
          `}</style>
        </div>
      )}

      <aside className="w-20 bg-[#1e293b] flex flex-col items-center py-6 z-30 flex-shrink-0">
        <div
          className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mb-8 shadow-lg shadow-purple-900/30 cursor-pointer"
          onClick={() => handleSwitchView('main')}
        >
          L
        </div>
        <div className="flex-1 flex flex-col items-center space-y-4 w-full">
          <button
            onClick={() => handleSwitchView('main')}
            aria-label="Касса"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${
              activeView === 'main'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Search size={20} />
          </button>
          <button
            onClick={() => handleSwitchView('history')}
            aria-label="История"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${
              activeView === 'history'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <History size={20} />
          </button>
          <button
            onClick={() => handleSwitchView('return')}
            aria-label="Возврат"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${
              activeView === 'return'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <RotateCcw size={20} />
          </button>
          <button
            onClick={() => handleSwitchView('rating')}
            aria-label="Рейтинг"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${
              activeView === 'rating'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Award size={20} />
          </button>
        </div>
        <div className="mt-auto">
          <button
            onClick={logoutStaff}
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors flex items-center justify-center"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
        <header className="h-16 px-6 flex items-center justify-between bg-white border-b border-slate-200">
          <div>
            <h1 className="font-bold text-slate-800 text-lg leading-tight">
              {activeView === 'main'
                ? 'Терминал лояльности'
                : activeView === 'history'
                  ? 'История операций'
                  : activeView === 'return'
                    ? 'Оформление возврата'
                    : 'Рейтинг сотрудников'}
            </h1>
            <div className="flex items-center text-xs text-slate-500 mt-0.5 font-medium">
              <Store size={12} className="mr-1 text-purple-600" />
              <span>{employee.outlet}</span>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="text-right">
              <div className="text-sm font-bold text-slate-900 font-mono">
                {currentTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-xs text-slate-500">
                {currentTime.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </div>
            </div>
            <div className="flex items-center space-x-3 pl-6 border-l border-slate-200">
              <div className="w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-600 font-bold text-xs">
                {employee.avatar}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-sm font-bold text-slate-900">{employee.name}</div>
                <div className="text-xs text-slate-500">{employee.role}</div>
              </div>
            </div>
          </div>
        </header>

        {activeView === 'main' ? (
          <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100/50">
            <div className="w-full max-w-md">
              {actionError && (
                <div className="mb-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs font-medium border border-red-100">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
              {checkoutStep === 'search' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-32 flex flex-col items-center justify-center relative overflow-hidden focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Поиск клиента</label>
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleSearchAction('search');
                        }
                      }}
                      placeholder="Введите код или сканируйте QR"
                      className="w-full bg-transparent border-none text-center text-xl sm:text-2xl font-mono font-medium text-slate-900 tracking-widest outline-none placeholder:text-slate-300 placeholder:font-sans placeholder:text-sm sm:placeholder:text-lg placeholder:font-medium placeholder:tracking-normal focus:placeholder-transparent"
                      autoFocus
                    />
                    <div
                      className={`absolute bottom-0 left-0 h-1.5 bg-purple-600 transition-all duration-300 ease-out ${
                        inputValue ? 'w-full' : 'w-0'
                      }`}
                    ></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {keys.map((k) => (
                      <button
                        key={k.val}
                        onClick={() => {
                          if (k.val === 'clear') handleClear();
                          else if (k.val === 'back') handleBackspace();
                          else handleNumClick(k.val);
                        }}
                        className={`h-16 rounded-xl text-xl font-medium transition-all duration-100 active:scale-[0.98] select-none ${
                          k.label === 'C'
                            ? 'bg-[#FFFBEB] text-[#D97706] border border-[#FEF3C7] hover:bg-[#FEF3C7]'
                            : k.type === 'secondary'
                              ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:border-purple-300 hover:text-purple-600'
                        }`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={() => handleSearchAction('scan')}
                      className="h-14 bg-[#1e293b] hover:bg-[#334155] text-white rounded-xl font-semibold text-base flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]"
                    >
                      <Camera size={20} />
                      <span>Камера</span>
                    </button>
                    <button
                      disabled={!inputValue || searchBusy}
                      onClick={() => handleSearchAction('search')}
                      className={`h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-base flex items-center justify-center space-x-2 transition-all shadow-md shadow-purple-200 active:scale-[0.98] ${
                        searchBusy
                          ? 'disabled:bg-purple-600 disabled:text-white disabled:cursor-wait ring-2 ring-purple-300 ring-offset-2'
                          : 'disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed'
                      }`}
                    >
                      <span>Найти</span>
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === 'amount' && (
                <div>
                  {currentClient && <ClientHeader client={currentClient} />}
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Сумма покупки</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={txAmount}
                          onChange={(e) => setTxAmount(e.target.value)}
                          placeholder="0"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-4 pr-10 text-xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          autoFocus
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₽</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Номер чека <span className="text-gray-400 font-normal">(необязательно)</span>
                      </label>
                      <input
                        type="text"
                        value={txCheckId}
                        onChange={(e) => setTxCheckId(e.target.value)}
                        placeholder="#"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={resetCheckout}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={() => {
                          if (parseFloat(txAmount) > 0) setCheckoutStep('mode');
                        }}
                        disabled={!parseFloat(txAmount)}
                        className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Далее
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {checkoutStep === 'mode' && (
                <div>
                  {currentClient && <ClientHeader client={currentClient} />}
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => {
                        setTxRedeemPoints('');
                        void handleAccrueQuote();
                      }}
                      className="bg-white p-6 rounded-2xl border-2 border-transparent hover:border-purple-500 shadow-sm hover:shadow-md transition-all group text-left"
                    >
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="p-2 bg-green-100 rounded-lg text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors">
                          <Plus size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Начислить баллы</h3>
                      </div>
                      <p className="text-gray-500 text-sm">Клиент копит баллы. Списание не производится.</p>
                    </button>

                    <button
                      onClick={() => setCheckoutStep('redeem')}
                      disabled={!currentClient || currentClient.balance === 0}
                      className="bg-white p-6 rounded-2xl border-2 border-transparent hover:border-orange-500 shadow-sm hover:shadow-md transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="p-2 bg-orange-100 rounded-lg text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                          <Wallet size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Списать баллы</h3>
                      </div>
                      <p className="text-gray-500 text-sm">Оплата части покупки баллами.</p>
                    </button>
                  </div>
                  <button
                    onClick={() => setCheckoutStep('amount')}
                    className="w-full mt-4 py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    Назад
                  </button>
                </div>
              )}

              {checkoutStep === 'redeem' && currentClient && (
                <div>
                  {currentClient && <ClientHeader client={currentClient} />}
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">Списать баллы</label>
                        <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded">
                          Доступно: {redeemableMax}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={txRedeemPoints}
                          onChange={(e) => setTxRedeemPoints(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-4 pr-10 text-xl font-bold text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                          autoFocus
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">Б</span>
                      </div>
                      {redeemAmount > currentClient.balance && (
                        <p className="text-red-500 text-xs mt-1">Недостаточно баллов</p>
                      )}
                      {redeemAmount > purchaseAmount && (
                        <p className="text-red-500 text-xs mt-1">Списание не может превышать сумму</p>
                      )}
                      {redeemAmount <= purchaseAmount && redeemAmount <= currentClient.balance && redeemAmount > redeemPolicyMax && (
                        <p className="text-red-500 text-xs mt-1">Превышен лимит списания по уровню клиента</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={setRedeemMax}
                        className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
                      >
                        Максимум
                      </button>
                      <button
                        onClick={() => setTxRedeemPoints(Math.floor(redeemableMax / 2).toString())}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        50%
                      </button>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setCheckoutStep('mode')}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                      >
                        Назад
                      </button>
                      <button
                        onClick={() => void handleRedeemQuote()}
                        disabled={
                          !txRedeemPoints || redeemAmount <= 0 || redeemAmount > redeemableMax
                        }
                        className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Далее
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {checkoutStep === 'precheck' && (
                <div>
                  {currentClient && <ClientHeader client={currentClient} />}
                  <div className="bg-white rounded-2xl border border-purple-100 shadow-lg overflow-hidden">
                    <div className="bg-purple-600 p-4 text-white text-center">
                      <h3 className="font-bold text-lg">Подтвердите операцию</h3>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex justify-between items-center text-gray-600">
                        <span>Сумма покупки</span>
                        <span className="font-medium">{fmtMoney(purchaseAmount)} ₽</span>
                      </div>
                      {Number(txRedeemPoints) > 0 && (
                        <div className="flex justify-between items-center text-orange-600">
                          <span>Списание баллов</span>
                          <span className="font-bold">-{txRedeemPoints} Б</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-green-600">
                        <span>Начисление баллов</span>
                        <span className="font-bold">+{txAccruePoints} Б</span>
                      </div>

                      {Number(txRedeemPoints) > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 my-2">
                          <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                          <div className="text-left">
                            <h4 className="font-bold text-amber-900 text-sm">Примените скидку на кассе!</h4>
                            <p className="text-amber-800 text-xs mt-1 leading-snug">
                              Не забудьте уменьшить сумму чека на <strong>{txRedeemPoints} ₽</strong> в вашей
                              POS-системе перед оплатой.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="border-t border-gray-100 pt-4 mt-2 flex justify-between items-center text-xl font-bold text-gray-900">
                        <span>К ОПЛАТЕ</span>
                        <span>{fmtMoney(txFinalAmount)} ₽</span>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 flex gap-3">
                      <button
                        onClick={handlePrecheckBack}
                        className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-colors"
                      >
                        Назад
                      </button>
                      <button
                        onClick={() => void handleCommit()}
                        disabled={isProcessing}
                        className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        <Check size={20} /> <span>Провести</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {checkoutStep === 'success' && (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl overflow-hidden relative pb-2 mb-6">
                    <div className="bg-emerald-500 p-6 text-center text-white relative overflow-hidden">
                      <div
                        className="absolute top-0 left-0 w-full h-full opacity-10"
                        style={{
                          backgroundImage: 'radial-gradient(circle, white 2px, transparent 2.5px)',
                          backgroundSize: '10px 10px',
                        }}
                      ></div>
                      <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-white/30">
                        <Check size={32} strokeWidth={3} />
                      </div>
                      <h2 className="text-xl font-bold">Оплата прошла</h2>
                      <p className="text-emerald-100 text-sm">
                        {new Date().toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="p-6 bg-white relative z-10 space-y-5">
                      <div className="flex justify-between items-center text-xs text-slate-400 font-medium uppercase tracking-wider mb-6 pb-4 border-b border-dashed border-slate-100">
                        <span>{employee.outlet}</span>
                        <span>Кассир: {employee.name.split(' ')[0]}</span>
                      </div>

                      {currentClient?.name && (
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span className="font-medium">Клиент</span>
                          <span className="font-semibold text-slate-900">{currentClient.name}</span>
                        </div>
                      )}

                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">Сумма покупки</span>
                          <span className="font-bold text-slate-900">{fmtMoney(purchaseAmount)} ₽</span>
                        </div>
                        {Number(txRedeemPoints) > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-orange-500 flex items-center">
                              <Coins size={14} className="mr-1" /> Списано баллов
                            </span>
                            <span className="font-bold text-orange-500">-{txRedeemPoints}</span>
                          </div>
                        )}
                        {txAccruePoints > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-emerald-600 flex items-center">
                              <Gift size={14} className="mr-1" /> Начислено
                            </span>
                            <span className="font-bold text-emerald-600">+{txAccruePoints}</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex justify-between items-end">
                          <span className="text-xs font-bold text-slate-400 uppercase mb-1">К ОПЛАТЕ</span>
                          <span className="text-3xl font-black text-slate-900 leading-none">{fmtMoney(txFinalAmount)} ₽</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="w-full h-3 absolute bottom-0 left-0 bg-white"
                      style={{
                        maskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                        maskSize: '20px 20px',
                        maskPosition: 'bottom',
                        WebkitMaskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                        WebkitMaskSize: '20px 20px',
                        WebkitMaskPosition: 'bottom',
                      }}
                    ></div>
                  </div>

                  <button
                    onClick={resetCheckout}
                    className="w-full max-w-sm py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] flex items-center justify-center"
                  >
                    Закрыть
                  </button>
                </div>
              )}
            </div>
          </main>
        ) : activeView === 'return' ? (
          <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100">
            <div className="w-full max-w-md space-y-6">
              {returnTx ? (
                <div className="bg-white rounded-2xl shadow-xl shadow-red-900/5 border border-red-100 overflow-hidden">
                  <div className="bg-red-50 p-6 border-b border-red-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-red-900">Подтверждение возврата</h3>
                      <p className="text-red-700 text-sm mt-1">Проверьте данные перед списанием</p>
                    </div>
                    <div className="p-3 bg-white rounded-full text-red-600 shadow-sm">
                      <AlertTriangle size={24} />
                    </div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Номер чека</span>
                        <div className="font-mono font-medium text-gray-900">{returnTx.checkId}</div>
                      </div>
                      <div>
                        <span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Дата продажи</span>
                        <div className="font-medium text-gray-900">{returnTx.date.toLocaleDateString()}</div>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-gray-100">
                        <span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Клиент</span>
                        <div className="font-medium text-gray-900 flex items-center">
                          <User size={16} className="mr-2 text-gray-400" />
                          {returnTx.client}
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Сумма возврата</span>
                        <span className="text-lg font-bold text-gray-900">{fmtMoney(returnTx.amount)} ₽</span>
                      </div>
                      <div className="h-px bg-gray-200"></div>
                      {returnTx.pointsAccrued > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Будет списано</span>
                          <span className="font-bold text-red-600">-{returnTx.pointsAccrued} Б</span>
                        </div>
                      )}
                      {returnTx.pointsRedeemed !== 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Будет возвращено</span>
                          <span className="font-bold text-green-600">+{Math.abs(returnTx.pointsRedeemed)} Б</span>
                        </div>
                      )}
                    </div>
                    {refundError && (
                      <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs font-medium border border-red-100">
                        <AlertTriangle size={14} className="flex-shrink-0" />
                        <span>{refundError}</span>
                      </div>
                    )}
                    <div className="flex space-x-3 pt-2">
                      <button
                        onClick={() => {
                          setReturnTx(null);
                          setReturnSearchInput('');
                          setRefundPreview(null);
                          setRefundError('');
                        }}
                        className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={handleConfirmReturn}
                        disabled={refundBusy}
                        className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        <RotateCcw size={18} />
                        <span>Выполнить возврат</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
                  <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-red-100">
                      <RotateCcw size={28} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Оформление возврата</h2>
                    <p className="text-slate-500 text-sm mt-1 text-center">
                      Введите номер чека для поиска транзакции
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={returnSearchInput}
                        onChange={(e) => setReturnSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleReturnSearch()}
                        placeholder="№ Чека"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-xl px-4 py-3 pl-11 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all outline-none"
                        autoFocus
                      />
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    {refundError && (
                      <p className="text-xs text-red-600 font-medium">{refundError}</p>
                    )}
                    <button
                      onClick={handleReturnSearch}
                      disabled={!returnSearchInput || refundBusy}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
                    >
                      <span>Найти операцию</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        ) : activeView === 'rating' ? (
          <main className="flex-1 flex flex-col items-center p-6 bg-slate-100/50 overflow-hidden">
            {motivationInfo?.enabled ? (
              <div className="w-full max-w-4xl flex flex-col h-full overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 flex-shrink-0">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-50 rounded-full -mr-8 -mt-8 z-0"></div>
                    <div className="relative z-10">
                      <h3 className="text-sm font-medium text-slate-500">Ваш рейтинг</h3>
                      <div className="flex items-baseline mt-2 space-x-2">
                        <span className="text-4xl font-bold text-slate-900">{currentUserRating?.score || 0}</span>
                        {currentUserRating?.rank ? (
                          <span className="text-sm font-medium text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                            {currentUserRating.rank}-е место
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            Нет данных
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 flex items-center">
                        <Clock size={12} className="mr-1" /> Период: {motivationInfo?.periodLabel || '—'}
                      </p>
                    </div>
                    <div className="relative z-10 p-3 bg-yellow-100 rounded-full text-yellow-600 shadow-sm">
                      <Trophy size={32} />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center">
                    <h3 className="text-sm font-medium text-slate-500 mb-3">Правила начисления</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2 text-slate-700 text-sm">
                          <UserPlus size={16} className="text-blue-500" />
                          <span>Новый клиент</span>
                        </div>
                        <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">
                          +{motivationInfo?.pointsNew ?? MOTIVATION_DEFAULT_NEW_POINTS} очков
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2 text-slate-700 text-sm">
                          <User size={16} className="text-purple-500" />
                          <span>Постоянный клиент</span>
                        </div>
                        <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">
                          +{motivationInfo?.pointsExisting ?? MOTIVATION_DEFAULT_EXISTING_POINTS} очков
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                    <h3 className="font-bold text-slate-800">Топ сотрудников</h3>
                    <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                      <button
                        onClick={() => setRatingFilter('all')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          ratingFilter === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Вся сеть
                      </button>
                      <button
                        onClick={() => setRatingFilter('my_outlet')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          ratingFilter === 'my_outlet'
                            ? 'bg-slate-800 text-white shadow'
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Моя точка
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {filteredLeaderboard.map((user, index) => {
                      const isMe = user.staffId === session?.staff?.id;
                      const currentRank = index + 1;
                      return (
                        <div
                          key={user.staffId || user.staffName}
                          className={`flex items-center p-3 rounded-xl mb-2 transition-colors ${
                            isMe ? 'bg-purple-50 border border-purple-100' : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="w-10 flex-shrink-0 flex justify-center">
                            {currentRank === 1 ? (
                              <div className="w-8 h-8 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center shadow-sm">
                                <Crown size={16} fill="currentColor" />
                              </div>
                            ) : currentRank === 2 ? (
                              <div className="w-8 h-8 bg-gray-100 text-slate-500 rounded-full flex items-center justify-center shadow-sm font-bold text-sm">
                                2
                              </div>
                            ) : currentRank === 3 ? (
                              <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center shadow-sm font-bold text-sm">
                                3
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium text-sm">{currentRank}</span>
                            )}
                          </div>
                          <div className="flex items-center flex-1 ml-4">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs mr-3 ${
                                isMe ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'bg-slate-200 text-slate-500'
                              }`}
                            >
                              {extractInitials(user.staffName)}
                            </div>
                            <div>
                              <div className="flex items-center">
                                <span className={`font-bold text-sm ${isMe ? 'text-purple-900' : 'text-slate-900'}`}>
                                  {user.staffName}
                                </span>
                                {isMe && (
                                  <span className="ml-2 text-[10px] bg-purple-200 text-purple-800 px-1.5 rounded font-bold">
                                    Вы
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center mt-0.5">
                                <Store size={10} className="mr-1" />
                                {user.outletName || employee.outlet}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`font-bold text-lg ${isMe ? 'text-purple-700' : 'text-slate-700'}`}>
                              {user.points}
                            </span>
                            <span className="text-[10px] text-slate-400 block uppercase font-medium">очков</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-md">
                <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6 relative">
                  <Award size={48} className="text-slate-400" />
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1">
                    <AlertCircle size={24} className="text-slate-400" fill="white" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Рейтинг отключен</h3>
                <p className="text-slate-500 text-sm">
                  Система рейтинга в данный момент неактивна.
                </p>
              </div>
            )}
          </main>
        ) : (
          <main className="flex-1 flex flex-col bg-slate-50/50 p-6 overflow-hidden min-h-0">
            <div className="max-w-5xl w-full mx-auto h-full flex flex-col min-h-0">
              <div className="flex flex-col space-y-4 mb-6 flex-shrink-0">
                <div className="flex justify-between items-end">
                  <h2 className="text-2xl font-bold text-slate-900">История операций</h2>
                  <div className="text-sm text-slate-500">
                    Найдено: <span className="font-bold text-slate-900">{filteredHistory.length}</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full lg:w-auto">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="№ Чека или Имя клиента..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    />
                  </div>
                  <div className="relative w-full lg:w-40">
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="w-full pl-3 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all text-slate-600"
                    />
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-lg w-full lg:w-auto">
                    {(['all', 'sale', 'return'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`flex-1 lg:flex-none px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                          filterType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {type === 'all' ? 'Все' : type === 'sale' ? 'Продажа' : 'Возврат'}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full lg:w-48">
                    <select
                      value={filterStaff}
                      onChange={(e) => setFilterStaff(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all text-slate-600 appearance-none cursor-pointer"
                    >
                      <option value="all">Все сотрудники</option>
                      {uniqueStaff.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {paginatedHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Search size={48} className="mb-4 opacity-20" />
                        <p>Операции не найдены</p>
                        <button
                          onClick={() => {
                            setHistorySearch('');
                            setFilterType('all');
                            setFilterDate('');
                            setFilterStaff('all');
                          }}
                          className="mt-2 text-purple-600 hover:underline text-sm"
                        >
                          Сбросить фильтры
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {paginatedHistory.map((tx) => {
                          const isReturn = tx.type === 'return';
                          return (
                            <div
                              key={tx.id}
                              className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors group"
                            >
                              <div className="flex items-start sm:items-center w-full sm:w-auto">
                                <div
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 flex-shrink-0 border ${
                                    isReturn
                                      ? 'bg-red-50 text-red-600 border-red-100'
                                      : 'bg-green-50 text-green-600 border-green-100'
                                  }`}
                                >
                                  {isReturn ? <RotateCcw size={18} /> : <Receipt size={18} />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 text-base">{fmtMoney(tx.amount)} ₽</span>
                                    {isReturn && (
                                      <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                                        Возврат
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center text-xs text-slate-500 mt-1 relative">
                                    <button
                                      onClick={() => handleCopy(tx.id, tx.checkId)}
                                      className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors mr-2 group/copy max-w-[180px]"
                                      title="Копировать"
                                    >
                                      <Copy size={10} className="text-slate-400 group-hover/copy:text-slate-600 flex-shrink-0" />
                                      <span className="font-mono truncate">{tx.checkId}</span>
                                    </button>
                                    <span>
                                      {tx.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })},{' '}
                                      {tx.date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {copiedId === tx.id && (
                                      <span className="absolute -bottom-4 left-0 text-[10px] text-green-600 font-medium bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-green-100 shadow-sm z-10 pointer-events-none">
                                        Скопировано!
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col w-full sm:w-1/3 text-left sm:px-4">
                                <div className="flex items-center text-sm font-medium text-slate-900 mb-1">
                                  <User size={14} className="mr-2 text-slate-400" />
                                  <span className="truncate">{tx.client}</span>
                                </div>
                                <div className="flex items-center text-xs text-slate-500">
                                  <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate max-w-[150px]">
                                    Кассир: {tx.staff}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto min-w-[100px] border-t sm:border-0 border-slate-50 pt-2 sm:pt-0">
                                {tx.pointsAccrued !== 0 && (
                                  <div
                                    className={`flex items-center text-sm font-bold ${
                                      tx.pointsAccrued > 0 ? 'text-green-600' : 'text-red-500'
                                    }`}
                                  >
                                    {tx.pointsAccrued > 0 ? '+' : ''}
                                    {tx.pointsAccrued} Б{' '}
                                    {tx.pointsAccrued > 0 ? (
                                      <ArrowUpRight size={14} className="ml-1" />
                                    ) : (
                                      <ArrowDownLeft size={14} className="ml-1" />
                                    )}
                                  </div>
                                )}
                                {tx.pointsRedeemed !== 0 && (
                                  <div
                                    className={`flex items-center text-sm font-bold ${
                                      tx.pointsRedeemed > 0 ? 'text-red-500' : 'text-green-600'
                                    }`}
                                  >
                                    {tx.pointsRedeemed > 0 ? '-' : '+'}
                                    {Math.abs(tx.pointsRedeemed)} Б{' '}
                                    {tx.pointsRedeemed > 0 ? (
                                      <ArrowDownLeft size={14} className="ml-1" />
                                    ) : (
                                      <ArrowUpRight size={14} className="ml-1" />
                                    )}
                                  </div>
                                )}
                                {tx.pointsAccrued === 0 && tx.pointsRedeemed === 0 && (
                                  <span className="text-xs text-slate-400">Без баллов</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
                      <span className="text-xs text-slate-500">
                        Показано {Math.min((currentPage - 1) * itemsPerPage + 1, filteredHistory.length)} -{' '}
                        {Math.min(currentPage * itemsPerPage, filteredHistory.length)} из {filteredHistory.length}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="text-xs font-medium text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 min-w-[30px] text-center">
                          {currentPage}
                        </span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}
      </div>

      <aside className="w-96 bg-white border-l border-slate-200 flex flex-col z-20 shadow-lg hidden xl:flex">
        <div className="p-6 border-b border-purple-800 bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
          <h3 className="text-xs font-bold text-purple-100 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"></span>
            Ваши операции за сегодня
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm shadow-sm">
              <div className="flex items-center space-x-1.5 text-purple-200 mb-1">
                <CreditCard size={12} />
                <span className="text-[10px] font-bold uppercase">Выручка</span>
              </div>
              <div className="text-lg font-bold text-white">{fmtMoney(shiftStats.revenue)} ₽</div>
            </div>
            <div className="bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm shadow-sm">
              <div className="flex items-center space-x-1.5 text-purple-200 mb-1">
                <Receipt size={12} />
                <span className="text-[10px] font-bold uppercase">Чеков</span>
              </div>
              <div className="text-lg font-bold text-white">{shiftStats.checks}</div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
            <h3 className="font-bold text-slate-800 text-sm">Последние</h3>
            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">
              {recentTx.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {recentTx.map((tx) => (
              <div
                key={tx.id}
                className="group p-3 rounded-xl border border-slate-100 bg-white hover:border-purple-200 hover:shadow-md transition-all cursor-pointer relative"
              >
                <div
                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${
                    tx.type === 'return' ? 'bg-red-500' : 'bg-green-500'
                  }`}
                ></div>
                <div className="pl-3">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-bold ${tx.type === 'return' ? 'text-red-600' : 'text-slate-900'}`}>
                        {tx.amount} ₽
                      </span>
                      {tx.type === 'return' && <RotateCcw size={12} className="text-red-500" />}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {tx.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })},{' '}
                      {tx.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center text-xs text-slate-500">
                      <User size={12} className="mr-1.5 text-slate-400" />
                      <span className="truncate max-w-[120px]">{tx.client}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        tx.pointsAccrued > 0
                          ? 'bg-green-50 text-green-700'
                          : tx.pointsRedeemed > 0
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tx.pointsAccrued > 0
                        ? `+${tx.pointsAccrued}`
                        : tx.pointsRedeemed > 0
                          ? `-${tx.pointsRedeemed}`
                          : '0'}{' '}
                      Б
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            onClick={() => handleSwitchView('return')}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"
          >
            <RotateCcw size={16} />
            <span>Оформить возврат</span>
          </button>
        </div>
      </aside>
    </div>
  );

  const Header = () => (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">
          {employee.avatar}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 leading-none">{employee.name}</span>
          <span className="text-[10px] text-gray-500">{employee.outlet}</span>
        </div>
      </div>
      <button onClick={logoutStaff} className="text-gray-400 hover:text-red-500 transition-colors">
        <LogOut size={20} />
      </button>
    </div>
  );

  const BottomNav = () => (
    <div className="h-16 bg-white border-t border-gray-200 grid grid-cols-4 pb-safe z-30 relative">
      {[
        { id: 'checkout', icon: Home, label: 'Касса' },
        { id: 'history', icon: History, label: 'История' },
        { id: 'rating', icon: Trophy, label: 'Рейтинг' },
        { id: 'returns', icon: RotateCcw, label: 'Возврат' },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            resetAll({ preserveTab: true });
            setActiveTab(tab.id as Tab);
          }}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === tab.id ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const DialerNumpad = ({ onInput, onConfirm, confirmLabel, disabled = false, showConfirm = true }: any) => {
    const handlePress = (key: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onInput(key);
    };

    return (
      <div className="w-full flex-1 flex flex-col justify-end pb-6 [@media(max-height:700px)]:flex-none [@media(max-height:700px)]:pb-3 [@media(max-height:600px)]:pb-2">
        <div className="grid grid-cols-3 gap-y-6 gap-x-8 px-8 mb-6 [@media(max-height:700px)]:gap-y-3 [@media(max-height:700px)]:gap-x-5 [@media(max-height:700px)]:px-5 [@media(max-height:700px)]:mb-3 [@media(max-height:600px)]:gap-y-2 [@media(max-height:600px)]:gap-x-4 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:mb-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onPointerDown={handlePress(num.toString())}
              className="text-3xl font-light text-gray-900 active:text-purple-600 transition-colors h-16 flex items-center justify-center rounded-full active:bg-gray-100 [@media(max-height:700px)]:text-2xl [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:text-xl [@media(max-height:600px)]:h-10"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onPointerDown={handlePress('clear')}
            className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center justify-center h-16 active:bg-gray-100 rounded-full [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10"
          >
            Сброс
          </button>
          <button
            type="button"
            onPointerDown={handlePress('0')}
            className="text-3xl font-light text-gray-900 active:text-purple-600 transition-colors h-16 flex items-center justify-center rounded-full active:bg-gray-100 [@media(max-height:700px)]:text-2xl [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:text-xl [@media(max-height:600px)]:h-10"
          >
            0
          </button>
          <button
            type="button"
            onPointerDown={handlePress('backspace')}
            className="flex items-center justify-center h-16 text-gray-400 active:text-gray-600 active:bg-gray-100 rounded-full [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10"
          >
            <ChevronLeft size={32} />
          </button>
        </div>
        {showConfirm && (
          <div className="px-6 [@media(max-height:700px)]:px-4 [@media(max-height:600px)]:px-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled || isProcessing}
              className="w-full h-14 bg-purple-600 text-white rounded-xl text-base font-semibold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none [@media(max-height:700px)]:h-11 [@media(max-height:600px)]:h-10 [@media(max-height:600px)]:text-sm"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : confirmLabel}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderCheckout = () => {
    if (mobileMode === 'landing') {
      return (
        <div className="flex-1 flex flex-col bg-gray-50 p-4 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Ваши операции за сегодня</h2>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-bold text-gray-900">{fmtMoney(shiftStats.revenue)} ₽</span>
                <span className="text-sm text-gray-500 ml-2">выручка</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">{shiftStats.checks}</div>
                <div className="text-xs text-gray-500">чека</div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-4">
            <button
              onClick={startScan}
              className="flex-1 bg-purple-600 text-white rounded-2xl p-6 shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 group"
            >
              <div className="bg-white/20 p-4 rounded-full group-hover:bg-white/30 transition-colors">
                <QrCode size={32} />
              </div>
              <div className="text-center">
                <span className="block text-xl font-bold">Сканировать QR</span>
                <span className="text-sm text-purple-100 opacity-80">Камера устройства</span>
              </div>
            </button>

            <button
              onClick={startManualInput}
              className="flex-1 bg-white text-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 group"
            >
              <div className="bg-gray-100 p-4 rounded-full text-gray-600 group-hover:bg-gray-200 transition-colors">
                <Keyboard size={32} />
              </div>
              <div className="text-center">
                <span className="block text-xl font-bold">Ввести вручную</span>
                <span className="text-sm text-gray-500">Код из приложения</span>
              </div>
            </button>
          </div>
        </div>
      );
    }

    if (mobileMode === 'manual_input') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMobileMode('landing')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="mx-auto font-semibold text-gray-900 [@media(max-height:600px)]:text-sm">Поиск клиента</span>
            <div className="w-8"></div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center">
              <span
                className={`text-4xl font-mono tracking-wider [@media(max-height:700px)]:text-3xl [@media(max-height:600px)]:text-2xl ${
                  inputValue ? 'text-gray-900' : 'text-gray-300'
                }`}
              >
                {inputValue || '000 000 000'}
              </span>
            </div>
            <DialerNumpad
              onInput={(key: string) => handleNumpadInput(key, setInputValue, inputValue)}
              onConfirm={performSearch}
              confirmLabel="Найти"
              disabled={inputValue.length < 3}
            />
          </div>
        </div>
      );
    }

    if (mobileMode === 'scanning') {
      return (
        <div className="flex-1 bg-black relative flex flex-col items-center justify-center">
          <button
            onClick={() => {
              setScanOpen(false);
              setMobileMode('landing');
            }}
            className="absolute top-6 right-6 p-2 bg-white/20 rounded-full text-white"
          >
            <X size={24} />
          </button>
          <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative overflow-hidden">
            {scanOpen && (
              <QrScanner
                onResult={onScan}
                onClose={() => setScanOpen(false)}
                onError={(message) => {
                  setActionError(message);
                  setScanOpen(false);
                  setMobileMode('landing');
                }}
                className="absolute inset-0"
                viewfinderClassName="w-full h-full"
              />
            )}
            <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500 animate-[scan-mobile_2s_ease-in-out_infinite]"></div>
          </div>
          <p className="text-white mt-8 font-medium">Наведите камеру на код</p>
          <style>{`@keyframes scan-mobile { 0% { top: 0; } 100% { top: 100%; } }`}</style>
        </div>
      );
    }

    if (mobileMode === 'profile' && currentClient) {
      return (
        <div className="flex-1 flex flex-col bg-gray-50">
          <div className="bg-white p-6 border-b border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <button onClick={() => setMobileMode('landing')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
              <div className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-bold uppercase tracking-wide border border-purple-100">
                {currentClient.level}
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">{currentClient.name}</h2>
              <p className="text-gray-500 text-sm mt-1">{currentClient.id}</p>
              <div className="mt-6 inline-flex items-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-2xl font-bold text-gray-900 mr-2">{formatPoints(currentClient.balance)}</span>
                <span className="text-sm text-gray-500">баллов</span>
              </div>
            </div>
          </div>

          <div className="p-4 grid gap-4 mt-2">
            <button
              onClick={() => startCheckout('accrue')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                  <Plus size={26} />
                </div>
                <div className="text-left">
                  <span className="block text-lg font-bold text-gray-900">Начислить</span>
                  <span className="text-sm text-gray-500">Обычная покупка</span>
                </div>
              </div>
              <ChevronRight className="text-gray-300" />
            </button>

            <button
              onClick={() => startCheckout('redeem')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                  <Wallet size={26} />
                </div>
                <div className="text-left">
                  <span className="block text-lg font-bold text-gray-900">Списать</span>
                  <span className="text-sm text-gray-500">Оплата баллами</span>
                </div>
              </div>
              <ChevronRight className="text-gray-300" />
            </button>
          </div>
        </div>
      );
    }

    if (mobileMode === 'amount') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMobileMode('profile')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-gray-600 [@media(max-height:600px)]:text-xs">
              Сумма покупки
            </span>
            <div className="w-8"></div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-6 [@media(max-height:700px)]:px-5 [@media(max-height:600px)]:px-4">
              <div className="text-5xl font-semibold text-gray-900 flex items-baseline [@media(max-height:700px)]:text-4xl [@media(max-height:600px)]:text-3xl">
                {txAmount || '0'}
                <span className="text-2xl text-gray-300 ml-2 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">
                  ₽
                </span>
              </div>
              <div className="w-full max-w-sm mt-8 [@media(max-height:700px)]:mt-5 [@media(max-height:600px)]:mt-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 [@media(max-height:600px)]:mb-1">
                  Номер чека (опционально)
                </label>
                <input
                  type="text"
                  value={txCheckId}
                  onChange={(e) => setTxCheckId(e.target.value)}
                  placeholder="12345"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:ring-2 focus:ring-purple-500 focus:bg-white outline-none transition-all [@media(max-height:700px)]:py-2 [@media(max-height:600px)]:py-1.5 [@media(max-height:600px)]:text-sm"
                />
              </div>
            </div>
            <DialerNumpad
              onInput={(key: string) => handleNumpadInput(key, setTxAmount, txAmount)}
              onConfirm={confirmAmount}
              confirmLabel="Далее"
              disabled={!purchaseAmount}
            />
          </div>
        </div>
      );
    }

    if (mobileMode === 'redeem') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMobileMode('amount')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-orange-600 [@media(max-height:600px)]:text-xs">
              Сколько списать?
            </span>
            <div className="w-8"></div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 [@media(max-height:700px)]:px-5 [@media(max-height:700px)]:gap-3 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:gap-2">
              <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3 [@media(max-height:700px)]:p-3 [@media(max-height:700px)]:space-y-2 [@media(max-height:600px)]:p-2 [@media(max-height:600px)]:space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">Сумма покупки</div>
                  <div className="text-lg font-bold text-gray-900 [@media(max-height:700px)]:text-base [@media(max-height:600px)]:text-sm">
                    {purchaseAmount} ₽
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">Доступно</div>
                  <div className="text-sm font-semibold text-orange-700 [@media(max-height:700px)]:text-xs">
                    {formatPoints(redeemableMax)} Б
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">К списанию</div>
                  <div className="flex items-baseline text-4xl font-bold text-gray-900 [@media(max-height:700px)]:text-3xl [@media(max-height:600px)]:text-2xl">
                    {txRedeemPoints || '0'}
                    <span className="text-base text-gray-400 ml-1 [@media(max-height:700px)]:text-sm [@media(max-height:600px)]:text-xs">
                      Б
                    </span>
                  </div>
                </div>
                <button
                  onClick={setRedeemMax}
                  className="w-full px-4 py-3 bg-orange-50 text-orange-700 rounded-lg text-sm font-semibold active:scale-[0.99] transition-all border border-orange-100 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-xs [@media(max-height:600px)]:py-1.5"
                >
                  Списать максимум
                </button>
              </div>
              {redeemAmount > redeemableMax && (
                <div className="text-xs text-red-500">Недостаточно баллов или превышение суммы покупки</div>
              )}
            </div>
            <DialerNumpad
              onInput={(key: string) => handleNumpadInput(key, setTxRedeemPoints, txRedeemPoints)}
              onConfirm={confirmRedeem}
              confirmLabel="Далее"
              disabled={!redeemAmount || redeemAmount > redeemableMax}
            />
          </div>
        </div>
      );
    }

    if (mobileMode === 'precheck') {
      return (
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between">
            <button onClick={handleMobilePrecheckBack} className="p-2 -ml-2 text-gray-500">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-gray-900">Подтверждение</span>
            <div className="w-8"></div>
          </div>

          <div className="p-4 space-y-3">
            <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
              <div className={`p-4 ${txType === 'accrue' ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
                <h3 className="font-bold text-lg text-center">{txType === 'accrue' ? 'Начисление' : 'Списание баллов'}</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-gray-600">
                  <span>Сумма покупки</span>
                  <span className="font-semibold text-gray-900">{purchaseAmount} ₽</span>
                </div>
                {txType === 'redeem' && (
                  <div className="flex justify-between text-orange-600">
                    <span>Списание баллов</span>
                    <span className="font-bold">-{redeemAmount} Б</span>
                  </div>
                )}
                <div className="flex justify-between text-green-600">
                  <span>Начисление баллов</span>
                  <span className="font-bold">+{txAccruePoints} Б</span>
                </div>
                <div className="flex justify-between text-gray-900">
                  <span className="font-semibold">К ОПЛАТЕ</span>
                  <span className="font-bold text-xl">{payableAmount} ₽</span>
                </div>

                {txType === 'redeem' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-left">
                      <h4 className="font-bold text-amber-900 text-sm">Примените скидку на кассе!</h4>
                      <p className="text-amber-800 text-xs mt-1 leading-snug">
                        Не забудьте уменьшить сумму чека на <strong>{redeemAmount} ₽</strong> в вашей POS-системе перед оплатой.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={completeTransaction}
              disabled={isProcessing}
              className="w-full h-14 bg-purple-600 text-white rounded-xl text-base font-semibold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : 'Провести операцию'}
            </button>
          </div>
        </div>
      );
    }

    if (mobileMode === 'success') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-white p-6 min-h-0 overflow-y-auto [@media(max-height:700px)]:justify-start [@media(max-height:700px)]:py-4 [@media(max-height:700px)]:px-4 [@media(max-height:600px)]:py-3 [@media(max-height:600px)]:px-3">
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl overflow-hidden relative mb-6 pb-2 [@media(max-height:700px)]:mb-4 [@media(max-height:700px)]:pb-1 [@media(max-height:600px)]:mb-3">
            <div className="bg-emerald-500 p-6 text-center text-white relative overflow-hidden [@media(max-height:700px)]:p-5 [@media(max-height:600px)]:p-4">
              <div
                className="absolute top-0 left-0 w-full h-full opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle, white 2px, transparent 2.5px)', backgroundSize: '10px 10px' }}
              ></div>
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-white/30 [@media(max-height:700px)]:w-12 [@media(max-height:700px)]:h-12 [@media(max-height:700px)]:mb-2 [@media(max-height:600px)]:w-10 [@media(max-height:600px)]:h-10">
                <Check size={32} strokeWidth={3} />
              </div>
              <h2 className="text-xl font-bold [@media(max-height:700px)]:text-lg [@media(max-height:600px)]:text-base">Оплата прошла</h2>
              <p className="text-emerald-100 text-sm [@media(max-height:700px)]:text-xs">
                {new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <div className="p-6 bg-white relative z-10 space-y-5 [@media(max-height:700px)]:p-5 [@media(max-height:700px)]:space-y-4 [@media(max-height:600px)]:p-4 [@media(max-height:600px)]:space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-400 font-medium uppercase tracking-wider pb-4 border-b border-dashed border-slate-100 [@media(max-height:700px)]:pb-3 [@media(max-height:600px)]:text-[10px] [@media(max-height:600px)]:pb-2">
                <span>{employee.outlet}</span>
                <span>Кассир: {employee.name.split(' ')[0]}</span>
              </div>

              {currentClient?.name && (
                <div className="flex justify-between items-center text-xs text-slate-500 [@media(max-height:600px)]:text-[10px]">
                  <span className="font-medium">Клиент</span>
                  <span className="font-semibold text-slate-900">{currentClient.name}</span>
                </div>
              )}

              <div className="space-y-3 [@media(max-height:700px)]:space-y-2">
                <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                  <span className="text-slate-500">Сумма покупки</span>
                  <span className="font-bold text-slate-900">{purchaseAmount.toLocaleString('ru-RU')} ₽</span>
                </div>
                {redeemAmount > 0 && (
                  <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                    <span className="text-orange-500 flex items-center gap-1">
                      <Wallet size={14} /> Списано баллов
                    </span>
                    <span className="font-bold text-orange-500">-{redeemAmount}</span>
                  </div>
                )}
                {txAccruePoints > 0 && (
                  <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                    <span className="text-emerald-600 flex items-center gap-1">
                      <Plus size={14} /> Начислено
                    </span>
                    <span className="font-bold text-emerald-600">+{txAccruePoints}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-400 uppercase mb-1 [@media(max-height:600px)]:text-[10px]">К ОПЛАТЕ</span>
                  <span className="text-3xl font-black text-slate-900 leading-none [@media(max-height:700px)]:text-2xl [@media(max-height:600px)]:text-xl">
                    {payableAmount.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
            </div>

            <div
              className="w-full h-3 absolute bottom-0 left-0 bg-white [@media(max-height:600px)]:h-2"
              style={{
                maskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                maskSize: '20px 20px',
                maskPosition: 'bottom',
                WebkitMaskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                WebkitMaskSize: '20px 20px',
                WebkitMaskPosition: 'bottom',
              }}
            ></div>
          </div>

          <button
            onClick={() => resetAll()}
            className="w-full max-w-sm h-14 bg-gray-900 text-white rounded-xl font-semibold shadow-md [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10 [@media(max-height:600px)]:text-sm"
          >
            Закрыть
          </button>
        </div>
      );
    }

    return null;
  };

  const renderHistory = () => (
    <div className="flex-1 bg-gray-50 flex flex-col relative min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Чек или клиент..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-lg bg-gray-100 border-none text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
        </div>
        <button
          onClick={() => setIsFilterOpen(true)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            activeFilterCount > 0 ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white min-h-0">
        <div className="divide-y divide-gray-100">
          {filteredHistoryMobile.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Search size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Ничего не найдено</p>
            </div>
          ) : (
            filteredHistoryMobile.map((tx) => (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="p-4 flex justify-between items-center active:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                      tx.type === 'return'
                        ? 'bg-red-50 text-red-600'
                        : tx.pointsRedeemed > 0
                          ? 'bg-orange-50 text-orange-600'
                          : 'bg-green-50 text-green-600'
                    }`}
                  >
                    {tx.type === 'return' ? (
                      <RotateCcw size={18} />
                    ) : tx.pointsRedeemed > 0 ? (
                      <Wallet size={18} />
                    ) : (
                      <Plus size={18} />
                    )}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium text-gray-900 truncate text-sm">{tx.client}</span>
                    <span className="text-xs text-gray-500 flex items-center">{formatDate(tx.date)}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end flex-shrink-0 ml-2">
                  <span className="font-bold text-gray-900 text-sm">{tx.amount} ₽</span>
                  <div className="flex items-center gap-1">
                    {tx.type === 'return' ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">ВОЗВРАТ</span>
                    ) : (
                      <>
                        {tx.pointsAccrued > 0 && <span className="text-xs font-bold text-green-600">+{tx.pointsAccrued}</span>}
                        {tx.pointsRedeemed > 0 && <span className="text-xs font-bold text-red-500">-{tx.pointsRedeemed}</span>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsFilterOpen(false)}
          ></div>
          <div className="w-full bg-white rounded-t-2xl relative z-10 duration-300 max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg">Фильтры</h3>
              <button onClick={() => setIsFilterOpen(false)} className="p-1.5 bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Период</label>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Сотрудник</label>
                <select
                  value={filters.staff}
                  onChange={(e) => setFilters({ ...filters, staff: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">Все сотрудники</option>
                  {uniqueStaff.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Сумма чека</label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="От"
                      value={filters.amountFrom}
                      onChange={(e) => setFilters({ ...filters, amountFrom: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₽</span>
                  </div>
                  <span className="text-gray-400">-</span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      placeholder="До"
                      value={filters.amountTo}
                      onChange={(e) => setFilters({ ...filters, amountTo: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₽</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3 pb-safe-footer">
              <button onClick={clearFilters} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium">
                Сбросить
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="flex-[2] py-3 bg-purple-600 text-white rounded-xl font-bold shadow-sm"
              >
                Показать ({filteredHistoryMobile.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal}></div>

          <div
            className="w-full bg-white rounded-t-2xl relative z-10 duration-300 pb-safe shadow-2xl flex flex-col max-h-[90vh]"
            style={{ transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : 'transform 0.2s' }}
          >
            <div
              className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
            </div>

            <div className="p-6 pt-2">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{selectedTx.amount} ₽</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    {selectedTx.type === 'return' ? 'Возврат' : 'Продажа'} • {formatDate(selectedTx.date)}
                  </p>
                </div>
                <button onClick={closeModal} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase">Чек / ID</span>
                    <div className="text-sm font-mono font-medium text-gray-900 break-all pr-2 mt-1 line-clamp-1">
                      {selectedTx.checkId}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyMobile(selectedTx.checkId)}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      isCopied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-500'
                    }`}
                  >
                    {isCopied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-gray-100 rounded-xl">
                    <span className="text-xs text-gray-400 block mb-1">Клиент</span>
                    <span className="text-sm font-bold text-gray-900">{selectedTx.client}</span>
                  </div>
                  <div className="p-4 border border-gray-100 rounded-xl">
                    <span className="text-xs text-gray-400 block mb-1">Кассир</span>
                    <span className="text-sm font-bold text-gray-900">{selectedTx.staff}</span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 flex justify-between">
                  <span className="text-sm text-gray-500">
                    {selectedTx.pointsAccrued >= 0 ? 'Начислено баллов' : 'Списано баллов'}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      selectedTx.pointsAccrued >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {selectedTx.pointsAccrued >= 0 ? '+' : '-'}
                    {Math.abs(selectedTx.pointsAccrued)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">
                    {selectedTx.pointsRedeemed >= 0 ? 'Списано баллов' : 'Возвращено баллов'}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      selectedTx.pointsRedeemed >= 0 ? 'text-red-500' : 'text-green-600'
                    }`}
                  >
                    {selectedTx.pointsRedeemed >= 0 ? '-' : '+'}
                    {Math.abs(selectedTx.pointsRedeemed)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderRating = () => {
    if (!motivationInfo?.enabled) {
      return (
        <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center text-center p-6">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5 relative">
            <Award size={40} className="text-gray-400" />
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
              <AlertCircle size={20} className="text-gray-400" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Рейтинг отключен</h3>
          <p className="text-sm text-gray-500">Система рейтинга в данный момент неактивна.</p>
        </div>
      );
    }

    return (
      <div className="flex-1 bg-gray-50 flex flex-col">
        <div className="bg-white p-6 border-b border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Мой рейтинг</h2>
              <p className="text-sm text-gray-500 mt-1">Период: {motivationInfo?.periodLabel || '—'}</p>
            </div>
            <div className="text-right">
              <span className="block text-3xl font-bold text-purple-600">{currentUserRating?.score || 0}</span>
              <span className="text-xs text-gray-400 uppercase font-bold">очков</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-3 border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-1.5 rounded-lg shadow-sm mb-1">
                <UserPlus size={16} className="text-blue-500" />
              </div>
              <span className="text-xs text-gray-500">Новый</span>
              <span className="text-sm font-bold text-gray-900">
                +{motivationInfo?.pointsNew ?? MOTIVATION_DEFAULT_NEW_POINTS} очков
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-1.5 rounded-lg shadow-sm mb-1">
                <User size={16} className="text-purple-500" />
              </div>
              <span className="text-xs text-gray-500">Повторный</span>
              <span className="text-sm font-bold text-gray-900">
                +{motivationInfo?.pointsExisting ?? MOTIVATION_DEFAULT_EXISTING_POINTS} очков
              </span>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
            <span>
              Ваше место в рейтинге: <span className="font-bold text-gray-900">{currentUserRating?.rank || '—'}</span>
            </span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 px-2">Топ сотрудников</h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {filteredLeaderboard.map((user, index) => (
              <div key={user.staffId || user.staffName} className="flex items-center justify-between p-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`font-bold w-6 text-center text-sm ${index === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>
                    {index + 1}
                  </span>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                    {extractInitials(user.staffName)}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{user.staffName}</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{user.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderReturns = () => (
    <div className="flex-1 bg-gray-50 flex flex-col p-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4 px-2">Оформление возврата</h2>

      {!returnTx && !returnSuccess ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Номер чека</label>
            <input
              type="text"
              value={returnSearchInput}
              onChange={(e) => setReturnSearchInput(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
              placeholder="12345"
            />
          </div>
          {refundError && <p className="text-xs text-red-600 font-medium">{refundError}</p>}

          <button
            onClick={handleReturnSearch}
            className="w-full h-12 bg-red-600 text-white rounded-lg font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={!returnSearchInput || refundBusy}
          >
            {refundBusy ? <Loader2 className="animate-spin" size={20} /> : 'Найти чек'}
          </button>
        </div>
      ) : returnTx && !returnSuccess ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-red-50 p-4 border-b border-red-100 flex items-center justify-between">
            <h3 className="font-bold text-red-900">Подтверждение возврата</h3>
            <div className="p-2 bg-white rounded-full text-red-600 shadow-sm">
              <AlertTriangle size={20} />
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-500">Чек / ID</span>
                <span className="font-mono font-medium text-gray-900">{returnTx.checkId}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-500">Дата продажи</span>
                <span className="font-medium text-gray-900">{formatDate(returnTx.date)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-500">Клиент</span>
                <span className="font-medium text-gray-900">{returnTx.client}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-gray-500">Сумма возврата</span>
                <span className="font-bold text-gray-900 text-lg">{returnTx.amount} ₽</span>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
              {returnTx.pointsAccrued > 0 && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-600">Будет списано</span>
                  <span className="font-bold text-red-600">-{returnTx.pointsAccrued} Б</span>
                </div>
              )}
              {returnTx.pointsRedeemed > 0 && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-600">Будет возвращено</span>
                  <span className="font-bold text-green-600">+{returnTx.pointsRedeemed} Б</span>
                </div>
              )}
              {returnTx.pointsAccrued === 0 && returnTx.pointsRedeemed === 0 && (
                <span className="text-xs text-gray-400 italic text-center block">
                  Баллы не начислялись и не списывались
                </span>
              )}
            </div>

            {refundError && (
              <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs font-medium border border-red-100">
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span>{refundError}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setReturnTx(null);
                  setReturnSearchInput('');
                  setRefundPreview(null);
                  setRefundError('');
                }}
                className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmReturn}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={refundBusy}
              >
                {refundBusy ? <Loader2 className="animate-spin" size={18} /> : <span>Подтвердить</span>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 text-green-700 p-6 rounded-xl flex flex-col items-center justify-center text-center border border-green-100">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-green-600">
            <Check size={24} strokeWidth={3} />
          </div>
          <h3 className="font-bold text-lg mb-1">Возврат оформлен</h3>
          <p className="text-sm opacity-90 mb-4">Операция успешно отменена, баллы скорректированы.</p>
          <button
            onClick={() => resetAll()}
            className="px-6 py-2 bg-white text-green-700 font-bold rounded-lg shadow-sm text-sm border border-green-200"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );

  const renderMobile = () => (
    <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      <Header />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'checkout' && renderCheckout()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'rating' && renderRating()}
        {activeTab === 'returns' && renderReturns()}
      </div>
      <BottomNav />
    </div>
  );

  return isMobile ? renderMobile() : renderDesktop();
}
