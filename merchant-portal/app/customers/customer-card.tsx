"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Ban,
  Unlock,
  PlusCircle,
  MinusCircle,
  Gift,
  Phone,
  Mail,
  Copy,
  Wallet,
  Clock,
  TrendingUp,
  MessageSquare,
  Store,
  Star,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getFullName,
  type CustomerRecord,
  type CustomerTransaction,
} from "./data";
import { normalizeCustomer } from "./normalize";
import CustomerFormModal, { type CustomerFormPayload } from "./customer-form-modal";
import ComplimentaryModal from "./complimentary-modal";
import {
  buildLevelLookups,
  getAvatarClass,
  getBadgeClass,
  getCustomerLevelLabel,
  getCustomerLevelRank,
} from "./level-utils";

type OutletOption = {
  id: string;
  name: string;
};

type LevelOption = {
  id: string;
  name: string;
  label: string;
  isInitial?: boolean;
  thresholdAmount?: number | null;
};

const ITEMS_PER_PAGE = 5;

type TabKey = "expiration" | "history" | "reviews" | "referrals";

function readApiError(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return readApiError(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.filter(Boolean).join(", ");
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return null;
}

function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `₽${Math.round(Number(value)).toLocaleString("ru-RU")}`;
}

function formatPoints(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU");
  } catch {
    return "—";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDateTimeParts(value?: string | null): { date: string; time: string } {
  const fallback = { date: "—", time: "" };
  if (!value) return fallback;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    const dateLabel = date.toLocaleDateString("ru-RU");
    const timeLabel = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return { date: dateLabel, time: timeLabel };
  } catch {
    return fallback;
  }
}

function calculateAge(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const month = today.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

const paginate = <T,>(data: T[], page: number) => data.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

const renderPagination = (totalItems: number, currentPage: number, setPage: (p: number) => void) => {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 bg-gray-50/50">
      <span className="text-xs text-gray-500">
        {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)} - {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} из {totalItems}
      </span>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-medium">{currentPage}</span>
        <button
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

type CustomerCardProps = {
  customerId: string;
  initialCustomer?: CustomerRecord | null;
  onBack: () => void;
  onNavigateToCustomer: (id: string) => void;
  onCustomerUpdated?: (customer: CustomerRecord) => void;
};

export default function CustomerCard({
  customerId,
  initialCustomer = null,
  onBack,
  onNavigateToCustomer,
  onCustomerUpdated,
}: CustomerCardProps) {
  const [customer, setCustomer] = React.useState<CustomerRecord | null>(initialCustomer);
  const [customerLoading, setCustomerLoading] = React.useState(!initialCustomer);
  const [toast, setToast] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [existingLogins, setExistingLogins] = React.useState<string[]>([]);
  const [outlets, setOutlets] = React.useState<OutletOption[]>([]);
  const [outletsLoading, setOutletsLoading] = React.useState(true);
  const [levels, setLevels] = React.useState<LevelOption[]>([]);
  const [activeTab, setActiveTab] = React.useState<TabKey>("expiration");
  const [pages, setPages] = React.useState({ expiration: 1, history: 1, reviews: 1, referrals: 1 });
  const [modalType, setModalType] = React.useState<"block" | "accrue" | "redeem" | "gift" | null>(null);
  const [blockForm, setBlockForm] = React.useState<"accrual" | "full">("accrual");
  const [blockSubmitting, setBlockSubmitting] = React.useState(false);

  const levelLookups = React.useMemo(() => buildLevelLookups(levels), [levels]);

  const refundContext = React.useMemo(
    () => buildRefundContext(customer?.transactions ?? []),
    [customer?.transactions],
  );

  async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(readApiError(text) || text || res.statusText);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") || ct.includes("+json")) {
      return text ? ((JSON.parse(text) as unknown) as T) : ((undefined as unknown) as T);
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return (JSON.parse(trimmed) as unknown) as T;
    }
    return ((undefined as unknown) as T);
  }

  const loadCustomer = React.useCallback(
    async (showLoading = true) => {
      if (!customerId) return;
      if (showLoading) {
        setCustomerLoading(true);
      }
      try {
        const data = await api<CustomerRecord>(`/api/customers/${encodeURIComponent(customerId)}`);
        setCustomer(data ? normalizeCustomer(data) : null);
      } catch (e) {
        console.error(e);
        setCustomer(null);
      } finally {
        if (showLoading) {
          setCustomerLoading(false);
        }
      }
    },
    [customerId],
  );

  const reloadCustomer = React.useCallback(async () => {
    if (!customerId) return;
    try {
      const fresh = await api<CustomerRecord>(`/api/customers/${encodeURIComponent(customerId)}`);
      setCustomer(fresh ? normalizeCustomer(fresh) : null);
    } catch (error) {
      console.error(error);
    }
  }, [customerId]);

  React.useEffect(() => {
    void loadCustomer(!initialCustomer);
  }, [loadCustomer, initialCustomer]);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ registeredOnly: "0", excludeMiniapp: "1" });
        const list = await api<CustomerRecord[]>(`/api/customers?${qs.toString()}`);
        if (!aborted) setExistingLogins(Array.isArray(list) ? list.map((c) => c.login) : []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setOutletsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/portal/outlets?status=active", { cache: "no-store" });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || res.statusText);
        }
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        const normalized = items
          .map((item: any) => {
            const rawId =
              typeof item?.id === "string" && item.id.trim()
                ? item.id.trim()
                : item?.id != null
                  ? String(item.id)
                  : "";
            if (!rawId) return null;
            const label =
              typeof item?.name === "string" && item.name.trim()
                ? item.name.trim()
                : typeof item?.code === "string" && item.code.trim()
                  ? item.code.trim()
                  : rawId;
            return { id: rawId, name: label } as OutletOption;
          })
          .filter((item: OutletOption | undefined | null): item is OutletOption => Boolean(item));
        if (!cancelled) {
          setOutlets(normalized);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setOutlets([]);
        }
      } finally {
        if (!cancelled) {
          setOutletsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const payload = await api<any>("/api/portal/loyalty/tiers");
        const source: any[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        const normalized = source
          .map((row) => ({
            id: typeof row?.id === "string" ? row.id : row?.id != null ? String(row.id) : "",
            name: typeof row?.name === "string" ? row.name : "",
            isInitial: Boolean(row?.isInitial),
            isHidden: Boolean(row?.isHidden),
            thresholdAmount: Number(row?.thresholdAmount ?? 0) || 0,
          }))
          .filter((item) => item.id && item.name)
          .sort((a, b) => {
            if (a.thresholdAmount === b.thresholdAmount) {
              return a.name.localeCompare(b.name);
            }
            return a.thresholdAmount - b.thresholdAmount;
          })
          .map((item) => ({
            id: item.id,
            name: item.name,
            label: item.isHidden ? `${item.name} (скрытый)` : item.name,
            isInitial: item.isInitial,
            thresholdAmount: item.thresholdAmount,
          }));
        if (!aborted) setLevels(normalized);
      } catch (error) {
        console.error(error);
        if (!aborted) setLevels([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  React.useEffect(() => {
    setPages({ expiration: 1, history: 1, reviews: 1, referrals: 1 });
  }, [customer?.id]);

  if (customerLoading) {
    return <div className="p-8 text-gray-500">Загрузка данных клиента...</div>;
  }

  if (!customer) {
    return (
      <div className="p-8 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Клиент не найден</h1>
        <p className="text-sm text-gray-500">
          Запрошенная карточка клиента отсутствует. Вернитесь к списку клиентов и выберите другого участника.
        </p>
        <button onClick={onBack} className="text-purple-600 hover:text-purple-700 text-sm font-medium">
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  const fullName = getFullName(customer) || customer.phone || customer.login || "—";
  const levelLabel = getCustomerLevelLabel(customer, levelLookups);
  const levelRank = getCustomerLevelRank(customer, levelLookups);
  const avatarClass = getAvatarClass(levelRank);
  const badgeClass = getBadgeClass(levelRank);
  const genderLabel =
    customer.gender === "male" ? "Мужской" : customer.gender === "female" ? "Женский" : "—";
  const ageValue = customer.age ?? calculateAge(customer.birthday);
  const isBlocked = customer.blocked || customer.redeemBlocked;
  const blockType = customer.redeemBlocked ? "full" : "accrual";

  function handleCopy(value?: string | null) {
    if (!value) return;
    if (!navigator?.clipboard?.writeText) return;
    void navigator.clipboard.writeText(value).then(
      () => setToast("Скопировано"),
      () => {},
    );
  }

  function openBlockModal() {
    setBlockForm(customer.redeemBlocked ? "full" : "accrual");
    setModalType("block");
  }

  async function handleBlockConfirm() {
    try {
      setBlockSubmitting(true);
      const payload = {
        accrualsBlocked: true,
        redemptionsBlocked: blockForm === "full",
      };
      const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setCustomer(normalizeCustomer(saved ?? { ...customer, ...payload }));
      setToast(blockForm === "full" ? "Заблокированы начисления и списания" : "Заблокированы только начисления");
      setModalType(null);
    } catch (error: any) {
      setToast(readApiError(error?.message || error) || "Не удалось обновить блокировку");
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function handleUnblockCustomer() {
    try {
      setBlockSubmitting(true);
      const payload = { accrualsBlocked: false, redemptionsBlocked: false };
      const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setCustomer(normalizeCustomer(saved ?? { ...customer, ...payload }));
      setToast("Блокировка снята");
      setModalType(null);
    } catch (error: any) {
      setToast(readApiError(error?.message || error) || "Не удалось снять блокировку");
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function handleCancelTransaction(operation: CustomerTransaction) {
    if (operation.kind === "REFUND") {
      setToast("Возвраты нельзя отменить");
      return;
    }
    const targetId = operation.receiptId || operation.id;
    if (!targetId) return;
    const confirmMessage = window.confirm("Вы уверены, что хотите отменить транзакцию?");
    if (!confirmMessage) return;
    try {
      const res = await fetch(`/api/operations/log/${encodeURIComponent(targetId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }
      setToast("Операция отменена администратором");
      void reloadCustomer();
    } catch (error: any) {
      setToast(readApiError(error?.message || error) || "Не удалось отменить операцию");
    }
  }

  async function handleEditSubmit(payload: CustomerFormPayload) {
    const trimmedName = payload.firstName.trim();
    const baseBody = {
      phone: payload.login.trim(),
      email: payload.email.trim() || undefined,
      firstName: trimmedName || undefined,
      name: trimmedName || undefined,
      birthday: payload.birthday || undefined,
      gender: payload.gender,
      comment: payload.comment.trim() || undefined,
      levelId: payload.levelId || undefined,
    };
    try {
      const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify(baseBody),
      });
      const normalized = normalizeCustomer(saved ?? { ...customer, ...baseBody });
      setCustomer(normalized);
      onCustomerUpdated?.(normalized);
      setToast("Данные клиента обновлены");
      setEditOpen(false);
    } catch (e: any) {
      setToast(readApiError(e?.message || e) || "Ошибка при сохранении клиента");
    }
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      {toast && (
        <div className="fixed top-24 right-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm shadow-lg z-[120]">
          {toast}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 leading-none">Карточка клиента</h2>
            <span className="text-sm text-gray-500 mt-1">Просмотр и управление профилем</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
              <div className="h-24 bg-gradient-to-r from-purple-600 to-indigo-600"></div>

              <div className="px-6 pb-6 relative">
                <div className="absolute -top-10 left-6">
                  <div className="w-20 h-20 rounded-xl bg-white p-1 shadow-md">
                    <div className={`w-full h-full rounded-lg flex items-center justify-center text-2xl font-bold text-white ${avatarClass}`}>
                      {fullName.charAt(0)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3 mb-2">
                  <button onClick={() => setEditOpen(true)} className="text-gray-400 hover:text-purple-600 transition-colors p-1" title="Редактировать">
                    <Edit size={18} />
                  </button>
                </div>

                <div className="mt-4">
                  <h3 className="text-xl font-bold text-gray-900">{fullName}</h3>
                  <div className="flex items-center space-x-2 mt-1 flex-wrap">
                    <span className="text-sm text-gray-500 font-mono">ID: {customer.id}</span>
                    {isBlocked ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${blockType === "accrual" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                        <Ban size={10} className="mr-1" />
                        {blockType === "accrual" ? "Блок. начислений" : "Заблокирован"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Активен
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeClass}`}>
                      {levelLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Баланс баллов</span>
                    <div className="text-2xl font-bold text-purple-700 mt-0.5">{formatPoints(customer.bonusBalance)} Б</div>
                    {customer.pendingBalance > 0 && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center">
                        <Clock size={10} className="mr-1" />
                        {formatPoints(customer.pendingBalance)} в ожидании
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-2.5 rounded-full shadow-sm text-purple-600">
                    <Wallet size={24} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    onClick={() => setModalType("accrue")}
                    disabled={customer.blocked}
                    className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <PlusCircle size={16} /> <span>Начислить</span>
                  </button>
                  <button
                    onClick={() => setModalType("redeem")}
                    disabled={customer.redeemBlocked}
                    className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <MinusCircle size={16} /> <span>Списать</span>
                  </button>
                  <button
                    onClick={() => setModalType("gift")}
                    disabled={customer.blocked}
                    className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Gift size={16} /> <span>Подарить</span>
                  </button>
                  <button
                    onClick={openBlockModal}
                    disabled={blockSubmitting}
                    className={`flex items-center justify-center space-x-2 py-2.5 px-3 border rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      isBlocked ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    }`}
                  >
                    {isBlocked ? <Unlock size={16} /> : <Ban size={16} />}
                    <span>{isBlocked ? "Разблок." : "Блокировка"}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Контакты</h4>
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-3 text-sm text-gray-600">
                    <Phone size={16} className="text-gray-400" />
                    <span>{customer.phone || customer.login || "—"}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(customer.phone || customer.login)}
                    className="text-gray-300 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-all"
                    title="Копировать"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between group">
                  <div className="flex items-center space-x-3 text-sm text-gray-600">
                    <Mail size={16} className="text-gray-400" />
                    <span className="truncate max-w-[200px]" title={customer.email || undefined}>{customer.email || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Личные данные</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Пол / Возраст</span>
                  <span className="text-sm font-medium text-gray-900">
                    {genderLabel}{ageValue != null ? `, ${ageValue}` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Дата рождения</span>
                  <span className="text-sm font-medium text-gray-900">{formatDate(customer.birthday)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Регистрация</span>
                  <span className="text-sm font-medium text-gray-900">{formatDate(customer.registeredAt)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Приглашение</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Пригласил(а)</span>
                  {customer.referrer ? (
                    <button
                      onClick={() => customer.referrer?.id && onNavigateToCustomer(customer.referrer.id)}
                      className="text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center"
                    >
                      {customer.referrer.name || customer.referrer.phone || customer.referrer.id} <ExternalLink size={12} className="ml-1" />
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-2 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Всего покупок">Всего</span>
                <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(customer.spendTotal)}</div>
                <div className="text-xs text-green-600 mt-1 flex items-center">
                  <TrendingUp size={12} className="mr-1" /> LTV
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Этот месяц">Тек. месяц</span>
                <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(customer.spendCurrentMonth)}</div>
                <div className="text-xs text-gray-400 mt-1">Покупки</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Прошлый месяц">Прош. месяц</span>
                <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(customer.spendPreviousMonth)}</div>
                <div className="text-xs text-gray-400 mt-1">Покупки</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Средний чек">Ср. чек</span>
                <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(customer.averageCheck)}</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Всего чеков">Чеков</span>
                <div className="mt-2 text-lg font-bold text-gray-900">{customer.visits ?? 0}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {customer.visitFrequencyDays != null && customer.visitFrequencyDays > 0
                    ? `~ 1 в ${Math.round(customer.visitFrequencyDays)} дн.`
                    : "—"}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Последний визит">Посл. визит</span>
                <div className="mt-2 text-lg font-bold text-gray-900">
                  {customer.daysSinceLastVisit != null ? `${customer.daysSinceLastVisit} дн.` : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1">назад</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-start space-x-3">
              <MessageSquare className="text-gray-400 mt-1 flex-shrink-0" size={18} />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-gray-900 mb-1">Комментарий к пользователю</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 italic break-words">
                  {customer.comment || "Нет комментария"}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
              <div className="border-b border-gray-200 px-6 bg-gray-50/50">
                <nav className="-mb-px flex space-x-6 overflow-x-auto">
                  {[
                    { id: "expiration", label: "Срок действия баллов" },
                    { id: "history", label: "История операций" },
                    { id: "reviews", label: "Отзывы" },
                    { id: "referrals", label: "Пригласил клиентов" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabKey)}
                      className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === tab.id
                          ? "border-purple-600 text-purple-700"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="flex-1">
                {activeTab === "expiration" && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Начислено</th>
                            <th className="px-6 py-3 font-semibold">Сгорает</th>
                            <th className="px-6 py-3 font-semibold text-right">Сумма</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {customer.expiry.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                                Нет данных о сроках действия баллов.
                              </td>
                            </tr>
                          ) : (
                            paginate(customer.expiry, pages.expiration).map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-gray-900">{formatDate(item.accrualDate)}</td>
                                <td className="px-6 py-3 text-gray-900">{formatDate(item.expiresAt)}</td>
                                <td className="px-6 py-3 text-right font-bold text-orange-600">{formatPoints(item.amount)} Б</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination(customer.expiry.length, pages.expiration, (p) => setPages({ ...pages, expiration: p }))}
                  </>
                )}

                {activeTab === "history" && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 font-semibold w-12">#</th>
                            <th className="px-6 py-3 font-semibold text-right">Сумма</th>
                            <th className="px-6 py-3 font-semibold text-right">Баллов</th>
                            <th className="px-6 py-3 font-semibold">Подробности</th>
                            <th className="px-6 py-3 font-semibold">Дата/время</th>
                            <th className="px-6 py-3 font-semibold">Торговая точка</th>
                            <th className="px-6 py-3 font-semibold">Оценка</th>
                            <th className="px-6 py-3 font-semibold text-right">Действия</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {customer.transactions.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                                Пока нет операций с баллами.
                              </td>
                            </tr>
                          ) : (
                            paginate(customer.transactions, pages.history).map((operation, idx) => {
                              const meta = buildOperationMeta(operation, customer, refundContext);
                              const globalIdx = (pages.history - 1) * ITEMS_PER_PAGE + idx + 1;
                              const pointsValue = Number(operation.change ?? 0);
                              const pointsSign = pointsValue > 0 ? "+" : pointsValue < 0 ? "−" : "";
                              const pointsClass = meta.isInactive ? "text-gray-400" : pointsValue > 0 ? "text-green-600" : pointsValue < 0 ? "text-red-500" : "text-gray-400";
                              const { date, time } = formatDateTimeParts(operation.datetime);

                              return (
                                <tr key={operation.id} className={`hover:bg-gray-50 ${meta.isInactive ? "opacity-60" : ""}`}>
                                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{globalIdx}</td>
                                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                                    {operation.purchaseAmount > 0 ? formatCurrency(operation.purchaseAmount) : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className={`px-6 py-4 text-right font-bold ${pointsClass}`}>
                                    {pointsSign}
                                    {formatPoints(Math.abs(pointsValue))}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{meta.title}</div>
                                    {meta.subtitleMain && (
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {meta.referralCustomerId ? (
                                          <Link
                                            href={`/customers?customerId=${encodeURIComponent(meta.referralCustomerId)}`}
                                            className="text-purple-600 hover:text-purple-800"
                                          >
                                            {meta.subtitleMain}
                                          </Link>
                                        ) : (
                                          meta.subtitleMain
                                        )}
                                      </div>
                                    )}
                                    {meta.subtitleExtra && <div className="text-xs text-gray-500 mt-0.5">{meta.subtitleExtra}</div>}
                                    {meta.note && <div className="text-xs text-gray-500 mt-1">{meta.note}</div>}
                                    {operation.canceledBy?.name && (
                                      <div className="text-[11px] text-gray-400 mt-1">Отменил: {operation.canceledBy.name}</div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-xs">
                                    <div className="font-medium text-gray-900">{date}</div>
                                    <div className="text-gray-500">{time}</div>
                                  </td>
                                  <td className="px-6 py-4 text-gray-900">
                                    <div className="flex items-center space-x-1.5">
                                      <Store size={14} className="text-gray-400" />
                                      <span className="truncate max-w-[140px]" title={operation.outlet || "—"}>
                                        {operation.outlet || "—"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    {operation.rating != null ? (
                                      <div className="flex items-center space-x-1 text-xs font-bold text-gray-700 bg-yellow-50 px-2 py-1 rounded w-fit">
                                        <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                        <span>{operation.rating}</span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {meta.canCancel ? (
                                      <button
                                        onClick={() => handleCancelTransaction(operation)}
                                        title="Отменить операцию"
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <RotateCcw size={16} />
                                      </button>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination(customer.transactions.length, pages.history, (p) => setPages({ ...pages, history: p }))}
                  </>
                )}

                {activeTab === "reviews" && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Дата</th>
                            <th className="px-6 py-3 font-semibold">Точка</th>
                            <th className="px-6 py-3 font-semibold">Оценка</th>
                            <th className="px-6 py-3 font-semibold">Отзыв</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {customer.reviews.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                                Клиент ещё не оставил отзывов.
                              </td>
                            </tr>
                          ) : (
                            paginate(customer.reviews, pages.reviews).map((review) => (
                              <tr key={review.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{formatDate(review.createdAt)}</td>
                                <td className="px-6 py-3 text-gray-900">
                                  <div className="flex items-center space-x-2">
                                    <Store size={14} className="text-gray-400" />
                                    <span className="truncate max-w-[140px]" title={review.outlet || "—"}>{review.outlet || "—"}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-3">
                                  <div className="flex text-yellow-400 text-xs">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <Star key={i} size={12} className={i < (review.rating ?? 0) ? "fill-current" : "text-gray-200"} />
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-gray-700 break-words max-w-xs">
                                  {review.comment || <span className="text-gray-400 italic">Без текста</span>}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination(customer.reviews.length, pages.reviews, (p) => setPages({ ...pages, reviews: p }))}
                  </>
                )}

                {activeTab === "referrals" && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Клиент</th>
                            <th className="px-6 py-3 font-semibold">Телефон</th>
                            <th className="px-6 py-3 font-semibold">Дата</th>
                            <th className="px-6 py-3 font-semibold text-right">Покупок</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {customer.invited.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                                По этому промокоду ещё никто не зарегистрировался.
                              </td>
                            </tr>
                          ) : (
                            paginate(customer.invited, pages.referrals).map((invitee) => (
                              <tr
                                key={invitee.id}
                                className="hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => onNavigateToCustomer(invitee.id)}
                              >
                                <td className="px-6 py-3 font-medium text-purple-600 hover:text-purple-800">
                                  {invitee.name || invitee.phone || invitee.id}
                                </td>
                                <td className="px-6 py-3 text-gray-600">{invitee.phone || "—"}</td>
                                <td className="px-6 py-3 text-gray-600">{formatDate(invitee.joinedAt)}</td>
                                <td className="px-6 py-3 text-right font-medium text-gray-900">{invitee.purchases ?? "—"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {renderPagination(customer.invited.length, pages.referrals, (p) => setPages({ ...pages, referrals: p }))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalType === "accrue" && (
        <AccrueModal
          customer={customer}
          onClose={() => setModalType(null)}
          onSuccess={(message) => {
            setToast(message);
            setModalType(null);
            void reloadCustomer();
          }}
          outlets={outlets}
          outletsLoading={outletsLoading}
        />
      )}

      {modalType === "redeem" && (
        <RedeemModal
          customer={customer}
          onClose={() => setModalType(null)}
          onSuccess={(message) => {
            setToast(message);
            setModalType(null);
            void reloadCustomer();
          }}
          outlets={outlets}
          outletsLoading={outletsLoading}
        />
      )}

      {modalType === "gift" && (
        <ComplimentaryModal
          customer={customer}
          onClose={() => setModalType(null)}
          onSuccess={(message) => {
            setToast(message);
            setModalType(null);
            void reloadCustomer();
          }}
        />
      )}

      {modalType === "block" && (
        <BlockModal
          customerName={fullName}
          isBlocked={isBlocked}
          blockForm={blockForm}
          onChangeBlockForm={setBlockForm}
          onClose={() => setModalType(null)}
          onConfirm={() => (isBlocked ? handleUnblockCustomer() : handleBlockConfirm())}
          submitting={blockSubmitting}
        />
      )}

      <CustomerFormModal
        open={editOpen}
        mode="edit"
        initialValues={mapCustomerToForm(customer)}
        loginToIgnore={customer.login}
        levels={levels.map((level) => ({ id: level.id, name: level.label, isInitial: level.isInitial }))}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        existingLogins={existingLogins}
      />
    </div>
  );
}

type AccrueModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
  outlets: OutletOption[];
  outletsLoading: boolean;
};

type RedeemModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
  outlets: OutletOption[];
  outletsLoading: boolean;
};

type AccrueForm = {
  amount: string;
  receipt: string;
  manualPoints: string;
  outletId: string;
};

type RedeemForm = {
  amount: string;
  outletId: string;
};

type AccrueErrors = Partial<Record<keyof AccrueForm, string>> & { amount?: string; manualPoints?: string };
type RedeemErrors = Partial<Record<keyof RedeemForm, string>> & { amount?: string };

type BlockModalProps = {
  customerName: string;
  isBlocked: boolean;
  blockForm: "accrual" | "full";
  onChangeBlockForm: (value: "accrual" | "full") => void;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
};

const BlockModal: React.FC<BlockModalProps> = ({
  customerName,
  isBlocked,
  blockForm,
  onChangeBlockForm,
  onClose,
  onConfirm,
  submitting,
}) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <h3 className="text-lg font-bold text-gray-900 mb-1">{isBlocked ? "Разблокировать" : "Заблокировать"}</h3>
          <p className="text-sm text-gray-500">{customerName}</p>
        </div>
        <div className="p-6 space-y-4">
          {!isBlocked && (
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="blockType"
                  checked={blockForm === "accrual"}
                  onChange={() => onChangeBlockForm("accrual")}
                  className="text-red-600 focus:ring-red-500"
                  aria-label="Только начисления"
                />
                <div>
                  <span className="block font-medium text-gray-900 text-sm">Только начисления</span>
                  <span className="text-xs text-gray-500">Клиент сможет тратить, но не копить</span>
                </div>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="blockType"
                  checked={blockForm === "full"}
                  onChange={() => onChangeBlockForm("full")}
                  className="text-red-600 focus:ring-red-500"
                  aria-label="Полная блокировка"
                />
                <div>
                  <span className="block font-medium text-gray-900 text-sm">Полная блокировка</span>
                  <span className="text-xs text-gray-500">Начисления и списания запрещены</span>
                </div>
              </label>
            </div>
          )}
          {isBlocked && <p className="text-gray-700 text-sm">Снять все ограничения с этого клиента?</p>}
        </div>
        <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm" disabled={submitting}>
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${
              isBlocked ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            } disabled:opacity-70 disabled:cursor-not-allowed`}
            disabled={submitting}
          >
            {isBlocked ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const AccrueModal: React.FC<AccrueModalProps> = ({
  customer,
  onClose,
  onSuccess,
  outlets,
  outletsLoading,
}) => {
  const [form, setForm] = React.useState<AccrueForm>({
    amount: "",
    receipt: "",
    manualPoints: "",
    outletId: "",
  });
  const [autoCalc, setAutoCalc] = React.useState(() => customer.earnRateBps != null);
  const [errors, setErrors] = React.useState<AccrueErrors>({});
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("modal-blur-active");
    return () => document.body.classList.remove("modal-blur-active");
  }, []);

  const earnRateBps = customer.earnRateBps ?? null;
  const outletsUnavailable = !outletsLoading && outlets.length === 0;

  React.useEffect(() => {
    if (!outlets.length) return;
    const firstOutlet = outlets[0];
    if (!firstOutlet) return;
    setForm((prev) => {
      if (prev.outletId && outlets.some((item) => item.id === prev.outletId)) {
        return prev;
      }
      return { ...prev, outletId: firstOutlet.id };
    });
  }, [outlets]);

  function update<K extends keyof AccrueForm>(key: K, value: AccrueForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const amountValue = React.useMemo(() => {
    const raw = form.amount.replace(",", ".").trim();
    if (!raw) return NaN;
    const num = Number(raw);
    return Number.isFinite(num) ? num : NaN;
  }, [form.amount]);

  const autoPoints = React.useMemo(() => {
    if (!autoCalc || earnRateBps == null) return 0;
    if (!Number.isFinite(amountValue) || amountValue <= 0) return 0;
    return Math.max(0, Math.floor((amountValue * earnRateBps) / 10_000));
  }, [autoCalc, earnRateBps, amountValue]);

  function validate(): boolean {
    const nextErrors: AccrueErrors = {};
    if (!form.amount.trim()) {
      nextErrors.amount = "Укажите сумму покупки";
    } else if (!Number.isFinite(amountValue) || amountValue <= 0) {
      nextErrors.amount = "Сумма должна быть больше 0";
    }

    if (!autoCalc) {
      const raw = form.manualPoints.trim();
      if (!raw) {
        nextErrors.manualPoints = "Укажите количество баллов";
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
          nextErrors.manualPoints = "Количество баллов должно быть больше 0";
        }
      }
    }

    if (outlets.length === 0) {
      if (!outletsLoading) {
        nextErrors.outletId = "Нет доступных торговых точек";
      }
    } else if (!form.outletId) {
      nextErrors.outletId = "Выберите торговую точку";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    if (outletsLoading) {
      setErrors((prev) => ({ ...prev, outletId: "Дождитесь загрузки списка торговых точек" }));
      return;
    }
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        purchaseAmount: Number.isFinite(amountValue) ? amountValue : 0,
        receiptNumber: form.receipt.trim() || undefined,
        outletId: form.outletId || undefined,
      };
      if (!autoCalc) {
        payload.points = Number(form.manualPoints);
      }

      const res = await fetch(`/api/customers/${encodeURIComponent(customer.id)}/transactions/accrual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(readApiError(text) || text || res.statusText);
      }
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      const pointsIssued = data?.pointsIssued ?? (autoCalc ? autoPoints : Number(form.manualPoints));
      const message =
        pointsIssued && Number.isFinite(pointsIssued)
          ? `Начислено ${formatPoints(pointsIssued)} баллов`
          : "Баллы начислены";
      onSuccess(message);
    } catch (error: any) {
      setApiError(readApiError(error?.message || error) || "Не удалось начислить баллы");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  const autoLabel = earnRateBps != null ? `Автокалькуляция (${(earnRateBps / 100).toFixed(2)}%)` : "Автокалькуляция";

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <h3 className="text-lg font-bold text-gray-900">Начисление баллов</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Сумма покупки</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="0 ₽"
            />
            {errors.amount && <span className="text-xs text-red-600 mt-1 block">{errors.amount}</span>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">№ Чека</label>
            <input
              type="text"
              value={form.receipt}
              onChange={(e) => update("receipt", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="Необязательно"
            />
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCalc}
                onChange={(e) => {
                  const next = e.target.checked && earnRateBps != null;
                  setAutoCalc(next);
                  if (!next) {
                    update("manualPoints", autoPoints > 0 ? String(autoPoints) : "");
                  } else {
                    update("manualPoints", "");
                  }
                }}
                className="rounded text-purple-600 focus:ring-purple-500"
                disabled={earnRateBps == null}
              />
              <span className="text-sm text-gray-900">{autoLabel}</span>
            </label>
          </div>

          {!autoCalc && (
            <div className="animate-fade-in">
              <label className="block text-sm font-medium text-gray-700 mb-1">Количество баллов</label>
              <input
                type="number"
                value={form.manualPoints}
                onChange={(e) => update("manualPoints", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
              {errors.manualPoints && <span className="text-xs text-red-600 mt-1 block">{errors.manualPoints}</span>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Торговая точка</label>
            <select
              value={form.outletId}
              onChange={(e) => update("outletId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              disabled={outletsLoading || outletsUnavailable}
            >
              {outletsLoading && <option value="">Загрузка…</option>}
              {!outletsLoading && outlets.length === 0 && <option value="">Нет доступных торговых точек</option>}
              {!outletsLoading &&
                outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
            </select>
            {errors.outletId && <span className="text-xs text-red-600 mt-1 block">{errors.outletId}</span>}
          </div>

          {apiError && <div className="text-sm text-red-600">{apiError}</div>}
        </div>
        <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm" disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed" disabled={submitting || outletsLoading || outletsUnavailable}>
            {submitting ? "Начисляем…" : "Начислить"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

const RedeemModal: React.FC<RedeemModalProps> = ({
  customer,
  onClose,
  onSuccess,
  outlets,
  outletsLoading,
}) => {
  const [form, setForm] = React.useState<RedeemForm>({
    amount: "",
    outletId: "",
  });
  const [errors, setErrors] = React.useState<RedeemErrors>({});
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("modal-blur-active");
    return () => document.body.classList.remove("modal-blur-active");
  }, []);

  const outletsUnavailable = !outletsLoading && outlets.length === 0;

  React.useEffect(() => {
    if (!outlets.length) return;
    const firstOutlet = outlets[0];
    if (!firstOutlet) return;
    setForm((prev) => {
      if (prev.outletId && outlets.some((item) => item.id === prev.outletId)) {
        return prev;
      }
      return { ...prev, outletId: firstOutlet.id };
    });
  }, [outlets]);

  function update<K extends keyof RedeemForm>(key: K, value: RedeemForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: RedeemErrors = {};
    const amountValue = Number(form.amount);
    if (!form.amount.trim()) {
      nextErrors.amount = "Укажите количество баллов";
    } else if (Number.isNaN(amountValue) || amountValue <= 0) {
      nextErrors.amount = "Баллы должны быть больше 0";
    } else if (amountValue > customer.bonusBalance) {
      nextErrors.amount = "Недостаточно баллов на балансе";
    }

    if (outlets.length === 0) {
      if (!outletsLoading) {
        nextErrors.outletId = "Нет доступных торговых точек";
      }
    } else if (!form.outletId) {
      nextErrors.outletId = "Выберите торговую точку";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    if (outletsLoading) {
      setErrors((prev) => ({ ...prev, outletId: "Дождитесь загрузки списка торговых точек" }));
      return;
    }
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        points: Number(form.amount),
        outletId: form.outletId || undefined,
      };

      const res = await fetch(`/api/customers/${encodeURIComponent(customer.id)}/transactions/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(readApiError(text) || text || res.statusText);
      }
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      const pointsRedeemed = data?.pointsRedeemed ?? Number(form.amount);
      const message =
        pointsRedeemed && Number.isFinite(pointsRedeemed)
          ? `Списано ${formatPoints(pointsRedeemed)} баллов`
          : "Баллы списаны";
      onSuccess(message);
    } catch (error: any) {
      setApiError(readApiError(error?.message || error) || "Не удалось списать баллы");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <h3 className="text-lg font-bold text-gray-900">Списание баллов</h3>
          <p className="text-xs text-gray-500 mt-1">
            Доступно: <span className="font-bold text-green-600">{formatPoints(customer.bonusBalance)} Б</span>
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Сумма списания</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
            {errors.amount && <span className="text-xs text-red-600 mt-1 block">{errors.amount}</span>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Торговая точка</label>
            <select
              value={form.outletId}
              onChange={(e) => update("outletId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              disabled={outletsLoading || outletsUnavailable}
            >
              {outletsLoading && <option value="">Загрузка…</option>}
              {!outletsLoading && outlets.length === 0 && <option value="">Нет доступных торговых точек</option>}
              {!outletsLoading &&
                outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
            </select>
            {errors.outletId && <span className="text-xs text-red-600 mt-1 block">{errors.outletId}</span>}
          </div>

          {apiError && <div className="text-sm text-red-600">{apiError}</div>}
        </div>
        <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm" disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed" disabled={submitting || outletsLoading || outletsUnavailable}>
            {submitting ? "Списываем…" : "Списать"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

type RefundEvent = { datetime: string; admin: boolean };
type RefundContext = {
  receiptNumber: string | null;
  purchaseDatetime: string | null;
  refundEvents: RefundEvent[];
};

function getReceiptKey(operation: CustomerTransaction): string | null {
  if (operation.receiptId) return operation.receiptId;
  if (operation.receiptNumber) return `receipt:${operation.receiptNumber}`;
  if (operation.orderId) return `order:${operation.orderId}`;
  return null;
}

function buildRefundContext(transactions: CustomerTransaction[]): Map<string, RefundContext> {
  const map = new Map<string, RefundContext>();
  for (const tx of transactions) {
    const key = getReceiptKey(tx);
    if (!key) continue;
    const txType = (tx.type || "").toString().toUpperCase();
    const current = map.get(key) ?? {
      receiptNumber: tx.receiptNumber ?? null,
      purchaseDatetime: null,
      refundEvents: [],
    };
    if (!current.receiptNumber && tx.receiptNumber) {
      current.receiptNumber = tx.receiptNumber;
    }
    if (txType !== "REFUND" && tx.datetime) {
      const nextDate = new Date(tx.datetime);
      if (!Number.isNaN(nextDate.getTime())) {
        const currentDate = current.purchaseDatetime ? new Date(current.purchaseDatetime) : null;
        if (!currentDate || nextDate < currentDate) {
          current.purchaseDatetime = tx.datetime;
        }
      }
    }
    if (txType === "REFUND") {
      const isAdmin = Boolean(tx?.canceledBy) || (tx.details || "").includes("совершён администратором");
      current.refundEvents.push({ datetime: tx.datetime, admin: isAdmin });
    }
    map.set(key, current);
  }
  return map;
}

function formatRefundDetails(operation: CustomerTransaction, context?: RefundContext): string {
  const receiptLabel =
    (context?.receiptNumber && context.receiptNumber.trim()) ||
    (operation.orderId ? operation.orderId : "") ||
    (operation.receiptId ? operation.receiptId.slice(-6) : "") ||
    (operation.id ? operation.id.slice(-6) : "") ||
    "—";
  const dateLabel = formatDateTime(context?.purchaseDatetime || operation.datetime);
  const adminSuffix = operation.kind === "CANCELED" ? " - совершён администратором" : "";
  return `Возврат покупки #${receiptLabel} (${dateLabel})${adminSuffix}`;
}

function stripAdminCanceledPrefix(details: string): string {
  const value = details || "";
  return value.replace(/^Операция отменена:\s*/i, "").replace(/^Отменено администратором:\s*/i, "").trim();
}

function buildOperationMeta(
  operation: CustomerTransaction,
  customer: CustomerRecord,
  refundContext: Map<string, RefundContext>,
): {
  title: string;
  subtitleMain: string | null;
  subtitleExtra: string | null;
  note: string | null;
  canCancel: boolean;
  isInactive: boolean;
  referralCustomerId: string | null;
} {
  const receiptKey = getReceiptKey(operation);
  const refundInfo = receiptKey ? refundContext.get(receiptKey) : undefined;
  const isRefundOperation = operation.type?.toUpperCase?.() === "REFUND";
  const isRefundedOrigin = !isRefundOperation && Boolean(refundInfo?.refundEvents.length);
  const hasAdminCancelMarker = Boolean(operation.canceledBy);
  const isCanceled = !isRefundOperation && Boolean(operation.canceledAt);
  const isAdminRefundEvent = Boolean(refundInfo?.refundEvents.some((e) => e.admin));
  const isAdminCancel =
    !isRefundOperation &&
    (isAdminRefundEvent || (isCanceled && hasAdminCancelMarker && !isRefundedOrigin));
  const canCancel =
    !isCanceled && !isRefundOperation && !isRefundedOrigin && operation.kind !== "REFUND";
  const isComplimentary = operation.kind === "COMPLIMENTARY";
  const isPromocode = operation.kind === "PROMOCODE";
  const isCampaign = operation.kind === "CAMPAIGN";
  const isBurn = operation.kind === "BURN";
  const isReferral = operation.kind === "REFERRAL";
  const isReferralRollback = operation.kind === "REFERRAL_ROLLBACK";
  const combinedEarn = operation.earnAmount != null ? Math.max(0, Number(operation.earnAmount)) : null;
  const combinedRedeem = operation.redeemAmount != null ? Math.max(0, Number(operation.redeemAmount)) : null;
  const baseDetails = stripAdminCanceledPrefix(operation.details);
  const isCombinedPurchase = operation.kind === "PURCHASE" && (combinedEarn || combinedRedeem);
  const detailsText = isRefundOperation
    ? formatRefundDetails(operation, refundInfo)
    : isAdminCancel
      ? `Отменено администратором: ${baseDetails}`
      : isRefundedOrigin
        ? `Возврат: ${operation.details}`
        : isCanceled
          ? `Отменено администратором: ${baseDetails}`
          : isCombinedPurchase
            ? "Покупка"
            : operation.details;
  const isReferralLike = isReferral || isReferralRollback;
  const isRefundAdmin = isRefundOperation && operation.kind === "CANCELED";
  let headerText: string | null = null;
  let subtitleMain: string | null = null;
  let subtitleExtra: string | null = null;

  if (isPromocode) {
    headerText = "Баллы по промокоду";
    if (operation.note) {
      subtitleMain = operation.note;
    }
  } else if (isCampaign) {
    headerText = "Баллы по акции";
    if (operation.note && operation.note.trim()) {
      subtitleMain = `Акция "${operation.note.trim()}"`;
    } else if (detailsText && detailsText !== headerText) {
      subtitleMain = detailsText;
    }
  } else if (isComplimentary) {
    headerText = "Комплиментарные баллы";
    if (operation.note && operation.note.trim()) {
      subtitleMain = operation.note.trim();
    }
  } else if (isRefundOperation) {
    headerText = "Возврат покупки";
    const adminMarker = " - совершён администратором";
    const raw = (detailsText || "").trim();
    const hasAdminMarker = raw.includes(adminMarker);
    const baseRefund = hasAdminMarker ? raw.replace(adminMarker, "").trim() : raw;
    const prefix = "Возврат покупки";
    let rest = baseRefund;
    if (baseRefund.startsWith(prefix)) {
      rest = baseRefund.slice(prefix.length).trim();
    }
    if (rest) {
      subtitleMain = rest;
    }
    if (hasAdminMarker || isRefundAdmin) {
      subtitleExtra = "Возврат покупки - совершён администратором";
    }
  } else if (isReferralLike) {
    headerText = isReferral ? "Реферальное начисление" : "Возврат реферала";
    const referralLabelBase =
      operation.referralCustomerName ||
      operation.referralCustomerPhone ||
      operation.referralCustomerId ||
      null;
    if (operation.referralCustomerId && referralLabelBase) {
      subtitleMain = referralLabelBase;
    } else if (customer.referrer && isReferral) {
      subtitleMain = "Баллы по реферальной программе";
    } else if (!customer.referrer && isReferral) {
      subtitleMain = "Баллы за регистрацию по реферальной программе";
    }
  } else if (isBurn) {
    headerText = "Сгорание баллов";
  }

  if (!isRefundOperation && isCanceled) {
    headerText = detailsText;
  }

  const showNewHeader =
    isPromocode || isCampaign || isRefundOperation || isReferralLike || isBurn || isComplimentary;
  const showStandaloneNote =
    Boolean(operation.note) &&
    !isPromocode &&
    !isRefundOperation &&
    !isReferralLike &&
    !isBurn &&
    !isCampaign &&
    !isComplimentary;

  return {
    title: showNewHeader ? headerText || detailsText : detailsText,
    subtitleMain,
    subtitleExtra,
    note: showStandaloneNote ? operation.note || null : null,
    canCancel,
    isInactive: isCanceled || isRefundedOrigin,
    referralCustomerId: operation.referralCustomerId ?? null,
  };
}

function mapCustomerToForm(customer: CustomerRecord): Partial<CustomerFormPayload> {
  const birthdayValue = customer.birthday ? customer.birthday.slice(0, 10) : "";
  return {
    login: customer.phone || customer.login,
    email: customer.email ?? "",
    firstName: getFullName(customer) || "",
    tags: customer.tags.join(", "),
    birthday: birthdayValue,
    levelId: customer.levelId ?? null,
    gender: customer.gender,
    comment: customer.comment ?? "",
  };
}
