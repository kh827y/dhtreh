"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import StarRating from "../../../components/StarRating";
import {
  getFullName,
  type CustomerRecord,
  type CustomerTransaction,
} from "../data";
import { normalizeCustomer } from "../normalize";
import { CustomerFormModal, type CustomerFormPayload } from "../customer-form-modal";

const { Edit3, PlusCircle, MinusCircle, Gift, X, XCircle, ChevronLeft, ChevronRight } = Icons;

const CUSTOMER_HISTORY_ICONS: Record<string, React.ReactNode> = {
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
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
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
  referral: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 16C4.8 13 7 12 10 12C13 12 15.2 13 15.5 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
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
};

type OutletOption = {
  id: string;
  name: string;
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
type ComplimentaryForm = {
  points: string;
  expiresIn: string;
  comment: string;
};
type ComplimentaryErrors = Partial<Record<keyof ComplimentaryForm, string>> & {
  points?: string;
  expiresIn?: string;
};

type LevelOption = { id: string; name: string; isInitial?: boolean };

const TABLE_PAGE_SIZE = 7;

export default function CustomerCardPage() {
  const params = useParams<{ customerId: string | string[] }>();
  const customerIdRaw = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const customerId = String(customerIdRaw || '');
  const [customer, setCustomer] = React.useState<CustomerRecord | null>(null);
  const [accrueOpen, setAccrueOpen] = React.useState(false);
  const [redeemOpen, setRedeemOpen] = React.useState(false);
  const [complimentaryOpen, setComplimentaryOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [existingLogins, setExistingLogins] = React.useState<string[]>([]);
  const [outlets, setOutlets] = React.useState<OutletOption[]>([]);
  const [outletsLoading, setOutletsLoading] = React.useState(true);
  const [expiryPageIndex, setExpiryPageIndex] = React.useState(0);
  const [transactionsPageIndex, setTransactionsPageIndex] = React.useState(0);
  const [reviewsPageIndex, setReviewsPageIndex] = React.useState(0);
  const [invitedPageIndex, setInvitedPageIndex] = React.useState(0);
  const [levels, setLevels] = React.useState<LevelOption[]>([]);
  const [blockMenuOpen, setBlockMenuOpen] = React.useState(false);
  const [blockMode, setBlockMode] = React.useState<"earn" | "all">("earn");
  const [blockSubmitting, setBlockSubmitting] = React.useState(false);
  const refundContext = React.useMemo(
    () => buildRefundContext(customer?.transactions ?? []),
    [customer?.transactions],
  );

  // Хелпер для запросов к локальному прокси /api/customers
  async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    if (ct.includes("application/json") || ct.includes("+json")) {
      try {
        return text ? ((JSON.parse(text) as unknown) as T) : ((undefined as unknown) as T);
      } catch {
        // fallthrough to heuristic parsing
      }
    }
    const trimmed = (text || "").trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return (JSON.parse(trimmed) as unknown) as T;
      } catch {
        // ignore
      }
    }
    return ((undefined as unknown) as T);
  }

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const data = await api<CustomerRecord>(`/api/customers/${encodeURIComponent(customerId)}`);
        if (!aborted) setCustomer(data ? normalizeCustomer(data) : null);
      } catch (e) {
        if (!aborted) setCustomer(null);
        console.error(e);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [customerId]);

  // Для проверки уникальности логинов в модалке редактирования
  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const list = await api<CustomerRecord[]>("/api/customers");
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
            threshold: Number(row?.thresholdAmount ?? 0) || 0,
          }))
          .filter((item) => item.id && item.name)
          .sort((a, b) => {
            if (a.threshold === b.threshold) {
              return a.name.localeCompare(b.name);
            }
            return a.threshold - b.threshold;
          })
          .map((item) => ({
            id: item.id,
            name: item.isHidden ? `${item.name} (скрытый)` : item.name,
            isInitial: item.isInitial,
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
    setExpiryPageIndex(0);
    setTransactionsPageIndex(0);
    setReviewsPageIndex(0);
    setInvitedPageIndex(0);
  }, [customer?.id]);

  const reloadCustomer = React.useCallback(async () => {
    if (!customerId) return;
    try {
      const fresh = await api<CustomerRecord>(`/api/customers/${encodeURIComponent(customerId)}`);
      setCustomer(fresh ? normalizeCustomer(fresh) : null);
    } catch (error) {
      console.error(error);
    }
  }, [customerId]);

  if (!customer) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Клиент не найден</h1>
        <p style={{ opacity: 0.7 }}>
          Запрошенная карточка клиента отсутствует. Вернитесь к списку клиентов и выберите другого участника.
        </p>
        <Link href="/customers" style={{ color: "#818cf8" }}>
          ← Вернуться к списку
        </Link>
      </div>
    );
  }

  const fullName = getFullName(customer) || customer.phone || customer.login;
  const profileRows = buildProfileRows(customer);

  const expiryTotalPages = Math.max(1, Math.ceil(customer.expiry.length / TABLE_PAGE_SIZE));
  const expiryPage = Math.min(expiryPageIndex, expiryTotalPages - 1);
  const expiryStartIndex = expiryPage * TABLE_PAGE_SIZE;
  const expiryPageItems = customer.expiry.slice(
    expiryStartIndex,
    expiryStartIndex + TABLE_PAGE_SIZE,
  );
  const hasExpiryPagination = customer.expiry.length > TABLE_PAGE_SIZE;

  const transactionsTotalPages = Math.max(
    1,
    Math.ceil(customer.transactions.length / TABLE_PAGE_SIZE),
  );
  const transactionsPage = Math.min(
    transactionsPageIndex,
    transactionsTotalPages - 1,
  );
  const transactionsStartIndex = transactionsPage * TABLE_PAGE_SIZE;
  const transactionsPageItems = customer.transactions.slice(
    transactionsStartIndex,
    transactionsStartIndex + TABLE_PAGE_SIZE,
  );
  const hasTransactionsPagination =
    customer.transactions.length > TABLE_PAGE_SIZE;

  const reviewsTotalPages = Math.max(
    1,
    Math.ceil(customer.reviews.length / TABLE_PAGE_SIZE),
  );
  const reviewsPage = Math.min(reviewsPageIndex, reviewsTotalPages - 1);
  const reviewsPageItems = customer.reviews.slice(
    reviewsPage * TABLE_PAGE_SIZE,
    reviewsPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE,
  );
  const hasReviewsPagination = customer.reviews.length > TABLE_PAGE_SIZE;

  const invitedTotalPages = Math.max(
    1,
    Math.ceil(customer.invited.length / TABLE_PAGE_SIZE),
  );
  const invitedPage = Math.min(invitedPageIndex, invitedTotalPages - 1);
  const invitedPageItems = customer.invited.slice(
    invitedPage * TABLE_PAGE_SIZE,
    invitedPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE,
  );
  const hasInvitedPagination = customer.invited.length > TABLE_PAGE_SIZE;

  function handleAccrueSuccess(message: string) {
    setToast(message);
    setAccrueOpen(false);
    void reloadCustomer();
  }

  function handleRedeemSuccess(message: string) {
    setToast(message);
    setRedeemOpen(false);
    void reloadCustomer();
  }

  function handleComplimentarySuccess(message: string) {
    setToast(message);
    setComplimentaryOpen(false);
    void reloadCustomer();
  }

  const blockStatus = customer?.redeemBlocked ? "all" : customer?.blocked ? "earn" : "none";

  function toggleBlockMenu() {
    if (!customer) return;
    setBlockMode(customer.redeemBlocked ? "all" : "earn");
    setBlockMenuOpen((prev) => !prev);
  }

  async function handleBlockConfirm(mode: "earn" | "all") {
    if (!customer) return;
    try {
      setBlockSubmitting(true);
      const payload = {
        accrualsBlocked: true,
        redemptionsBlocked: mode === "all",
      };
      const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const normalized = normalizeCustomer(saved ?? { ...customer, ...payload });
      setCustomer(normalized);
      setToast(mode === "all" ? "Заблокированы начисления и списания" : "Заблокированы только начисления");
      setBlockMenuOpen(false);
    } catch (error: any) {
      setToast(error?.message || "Не удалось обновить блокировку");
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function handleUnblockCustomer() {
    if (!customer) return;
    try {
      setBlockSubmitting(true);
      const payload = { accrualsBlocked: false, redemptionsBlocked: false };
      const saved = await api<any>(`/api/customers/${encodeURIComponent(customer.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const normalized = normalizeCustomer(saved ?? { ...customer, ...payload });
      setCustomer(normalized);
      setToast("Блокировка снята");
      setBlockMenuOpen(false);
    } catch (error: any) {
      setToast(error?.message || "Не удалось снять блокировку");
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
      setToast(error?.message || "Не удалось отменить операцию");
    }
  }

  async function handleEditSubmit(payload: CustomerFormPayload) {
    if (!customer) return;
    const trimmedName = payload.firstName.trim();
    const baseBody = {
      phone: payload.login.trim(),
      email: payload.email.trim() || undefined,
      firstName: trimmedName || undefined,
      name: trimmedName || undefined,
      birthday: payload.birthday || undefined,
      gender: payload.gender,
      tags: parseTags(payload.tags),
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
      setToast("Данные клиента обновлены");
      setEditOpen(false);
    } catch (e: any) {
      setToast(e?.message || "Ошибка при сохранении клиента");
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {toast && (
        <div style={toastStyle} role="status">
          {toast}
        </div>
      )}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>{fullName}</h1>
          <div style={{ opacity: 0.7, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>{customer.phone || customer.login}</span>
            <span>•</span>
            <span>Уровень: {customer.levelName || "—"}</span>
            <span>•</span>
            <span>{formatPoints(customer.bonusBalance)} бонусов</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button variant="secondary" leftIcon={<Edit3 size={16} />} onClick={() => setEditOpen(true)}>
            Редактировать
          </Button>
          <div style={{ position: "relative" }}>
            <Button
              variant={blockStatus === "none" ? "danger" : "secondary"}
              leftIcon={<XCircle size={16} />}
              onClick={() => {
                if (blockStatus === "none") toggleBlockMenu();
                else void handleUnblockCustomer();
              }}
              disabled={blockSubmitting}
            >
              {blockStatus === "none" ? "Заблокировать клиента" : "Разблокировать клиента"}
            </Button>
            {blockMenuOpen && blockStatus === "none" && (
              <div style={menuWrapperStyle}>
                <div style={menuCardStyle}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>Что хотите заблокировать?</div>
                  <label style={menuItemStyle}>
                    <input
                      type="radio"
                      checked={blockMode === "earn"}
                      onChange={() => setBlockMode("earn")}
                      disabled={blockSubmitting}
                    />
                    <span>Только начисления</span>
                  </label>
                  <label style={menuItemStyle}>
                    <input
                      type="radio"
                      checked={blockMode === "all"}
                      onChange={() => setBlockMode("all")}
                      disabled={blockSubmitting}
                    />
                    <span>Начисления и списания</span>
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Button variant="secondary" size="sm" onClick={() => setBlockMenuOpen(false)} disabled={blockSubmitting}>
                      Отмена
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => handleBlockConfirm(blockMode)} disabled={blockSubmitting}>
                      {blockSubmitting ? "Сохраняем…" : "Подтвердить"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            leftIcon={<PlusCircle size={16} />}
            onClick={() => setAccrueOpen(true)}
            disabled={customer.blocked}
            title={customer.blocked ? "Начисления недоступны: клиент заблокирован" : undefined}
          >
            Начислить баллы
          </Button>
          <Button
            variant="secondary"
            leftIcon={<MinusCircle size={16} />}
            onClick={() => setRedeemOpen(true)}
            disabled={customer.redeemBlocked}
            title={customer.redeemBlocked ? "Списания недоступны: клиент заблокирован" : undefined}
          >
            Списать баллы
          </Button>
          <Button
            variant="primary"
            leftIcon={<Gift size={16} />}
            onClick={() => setComplimentaryOpen(true)}
            disabled={customer.blocked}
            title={customer.blocked ? "Начисления недоступны: клиент заблокирован" : undefined}
          >
            Начислить комплиментарные баллы
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader title="Профиль" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          {profileRows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Срок действия баллов" subtitle="Начисления и даты сгорания" />
        <CardBody>
          {customer.expiry.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Нет начислений с ограниченным сроком действия.</div>
          ) : (
            <>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>#</th>
                    <th style={headerCellStyle}>Дата начисления</th>
                    <th style={headerCellStyle}>Дата сгорания</th>
                    <th style={headerCellStyle}>Баллов</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryPageItems.map((item, index) => (
                    <tr key={item.id} style={rowStyle}>
                      <td style={cellStyle}>{expiryStartIndex + index + 1}</td>
                      <td style={cellStyle}>{formatDate(item.accrualDate)}</td>
                      <td style={cellStyle}>{formatDate(item.expiresAt)}</td>
                      <td style={cellStyle}>{formatPoints(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasExpiryPagination && (
                <PaginationControls
                  page={expiryPage}
                  totalPages={expiryTotalPages}
                  onPrev={() =>
                    setExpiryPageIndex((current) => Math.max(0, current - 1))
                  }
                  onNext={() =>
                    setExpiryPageIndex((current) =>
                      Math.min(expiryTotalPages - 1, current + 1),
                    )
                  }
                />
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card id="operations">
        <CardHeader title="История операций с баллами" subtitle="Последние начисления и списания" />
        <CardBody>
          {customer.transactions.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Пока нет операций с баллами.</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...tableStyle, minWidth: 960 }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>#</th>
                      <th style={headerCellStyle}>Сумма покупки</th>
                      <th style={headerCellStyle}>Баллов</th>
                      <th style={headerCellStyle}>Подробности/Основание</th>
                      <th style={headerCellStyle}>Дата/время</th>
                      <th style={headerCellStyle}>Торговая точка</th>
                      <th style={headerCellStyle}>Оценка</th>
                      <th style={{ ...headerCellStyle, textAlign: "right" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsPageItems.map((operation, index) => {
                      const isBlockedAccrual = operation.type === "EARN" && operation.blockedAccrual;
                      const receiptKey = getReceiptKey(operation);
                      const refundInfo = receiptKey ? refundContext.get(receiptKey) : undefined;
                      const isRefundOperation = operation.type?.toUpperCase?.() === "REFUND";
                      const isRefundedOrigin =
                        !isRefundOperation && Boolean(refundInfo?.refundEvents.length);
                      const isCanceled = !isRefundOperation && Boolean(operation.canceledAt);
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
                      const hasBreakdown =
                        (combinedEarn != null && combinedEarn > 0) ||
                        (combinedRedeem != null && combinedRedeem > 0);
                      const changePrefix =
                        operation.change > 0 ? "+" : operation.change < 0 ? "−" : "";
                      const isGrayPoints = isCanceled || isRefundedOrigin;
                      const changeColor = isGrayPoints
                        ? "rgba(148,163,184,0.9)"
                        : operation.change > 0 && !isBlockedAccrual
                          ? "#4ade80"
                          : operation.change < 0
                            ? "#f97373"
                            : "rgba(148,163,184,0.9)";
                      const pillBackground = isGrayPoints
                        ? "rgba(148,163,184,0.16)"
                        : operation.change > 0
                          ? "rgba(22,163,74,0.12)"
                          : operation.change < 0
                            ? "rgba(248,113,113,0.12)"
                            : "rgba(148,163,184,0.12)";
                      const detailsColor = isCanceled || isRefundedOrigin
                        ? "#94a3b8"
                        : isComplimentary
                          ? "#f472b6"
                          : isPromocode
                            ? "#facc15"
                            : "inherit";
                      const baseDetails = stripAdminCanceledPrefix(operation.details);
                      const isCombinedPurchase =
                        operation.kind === "PURCHASE" && (combinedEarn || combinedRedeem);
                      const detailsText = isRefundOperation
                        ? formatRefundDetails(operation, refundInfo)
                        : isCanceled
                          ? `Отменено администратором: ${baseDetails}`
                          : isRefundedOrigin
                            ? `Возврат: ${operation.details}`
                            : isCombinedPurchase
                              ? "Покупка"
                              : operation.details;
                      const isReferralLike = isReferral || isReferralRollback;
                      const isRefundAdmin = isRefundOperation && operation.kind === "CANCELED";
                      let headerText: string | null = null;
                      let headerColor = detailsColor;
                      let subtitleMain: string | null = null;
                      let subtitleExtra: string | null = null;

                      if (isPromocode) {
                        headerText = "Баллы по промокоду";
                        headerColor = isCanceled || isRefundedOrigin ? "#94a3b8" : "#facc15";
                        if (operation.note) {
                          subtitleMain = operation.note;
                        }
                      } else if (isCampaign) {
                        headerText = "Баллы по акции";
                        headerColor = isCanceled || isRefundedOrigin ? "#94a3b8" : "#f97316";
                        if (operation.note && operation.note.trim()) {
                          subtitleMain = `Акция "${operation.note.trim()}"`;
                        } else if (detailsText && detailsText !== headerText) {
                          subtitleMain = detailsText;
                        }
                      } else if (isComplimentary) {
                        headerText = "Комплиментарные баллы";
                        headerColor = isCanceled || isRefundedOrigin ? "#94a3b8" : "#f472b6";
                        if (operation.note && operation.note.trim()) {
                          subtitleMain = operation.note.trim();
                        }
                      } else if (isRefundOperation) {
                        headerText = "Возврат покупки";
                        headerColor = isRefundAdmin ? "#94a3b8" : "#0ea5e9";
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
                        headerColor = isCanceled || isRefundedOrigin ? "#94a3b8" : "#7a5af8";

                        const hasLinkedReferral = Boolean(operation.referralCustomerId);
                        const referralLabelBase =
                          operation.referralCustomerName ||
                          operation.referralCustomerPhone ||
                          operation.referralCustomerId ||
                          null;

                        if (hasLinkedReferral && referralLabelBase) {
                          subtitleMain = referralLabelBase;
                        } else if (customer.referrer && isReferral) {
                          subtitleMain = "Баллы по реферальной программе";
                        } else if (!customer.referrer && isReferral) {
                          subtitleMain = "Баллы за регистрацию по реферальной программе";
                        }
                      } else if (isBurn) {
                        headerText = "Сгорание баллов";
                        headerColor = isCanceled || isRefundedOrigin ? "#94a3b8" : "#ef4444";
                      }

                      if (!isRefundOperation && isCanceled) {
                        headerText = detailsText;
                        headerColor = "#94a3b8";
                      }

                      const subtitleColor =
                        isCanceled || isRefundedOrigin || isRefundAdmin
                          ? "rgba(148,163,184,0.9)"
                          : "#6b7280";
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
                      return (
                        <tr
                          key={operation.id}
                          style={{
                            ...rowStyle,
                            opacity: isCanceled || isRefundedOrigin ? 0.6 : isBlockedAccrual ? 0.85 : 1,
                            background: isComplimentary
                              ? "rgba(244,114,182,0.08)"
                              : isPromocode
                                ? "rgba(250,204,21,0.12)"
                                : isCampaign
                                  ? "rgba(249,115,22,0.10)"
                                  : isRefundOperation
                                    ? "rgba(14,165,233,0.12)"
                                    : isReferral || isReferralRollback
                                      ? "rgba(122,90,248,0.10)"
                                      : isBurn
                                        ? "rgba(248,113,113,0.10)"
                                        : rowStyle.background,
                          }}
                        >
                        <td style={cellStyle}>{transactionsStartIndex + index + 1}</td>
                        <td style={cellStyle}>{formatCurrency(operation.purchaseAmount)}</td>
                        <td style={{ ...cellStyle, fontWeight: 600 }}>
                          {hasBreakdown ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {combinedEarn != null && combinedEarn > 0 && (
                                <span
                                  style={{
                                    ...amountPillStyle,
                                    color: isGrayPoints ? "rgba(148,163,184,0.9)" : "#4ade80",
                                    background: isGrayPoints
                                      ? "rgba(148,163,184,0.16)"
                                      : "rgba(22,163,74,0.12)",
                                  }}
                                >
                                  +{formatPoints(combinedEarn)}
                                </span>
                              )}
                              {combinedRedeem != null && combinedRedeem > 0 && (
                                <span
                                  style={{
                                    ...amountPillStyle,
                                    color: isGrayPoints ? "rgba(148,163,184,0.9)" : "#f97373",
                                    background: isGrayPoints
                                      ? "rgba(148,163,184,0.16)"
                                      : "rgba(248,113,113,0.12)",
                                  }}
                                >
                                  −{formatPoints(combinedRedeem)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ ...amountPillStyle, color: changeColor, background: pillBackground }}>
                              {changePrefix}
                              {formatPoints(Math.abs(operation.change))}
                            </span>
                          )}
                        </td>
                        <td style={{ ...cellStyle, verticalAlign: subtitleMain || subtitleExtra ? "top" : "middle" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: subtitleMain || subtitleExtra ? "flex-start" : "center" }}>
                            {showNewHeader ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
                                {isComplimentary && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.complimentary}
                                  </span>
                                )}
                                {isPromocode && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.promo}
                                  </span>
                                )}
                                {isCampaign && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.campaign}
                                  </span>
                                )}
                                {isRefundOperation && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.refund}
                                  </span>
                                )}
                                {isReferralLike && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.referral}
                                  </span>
                                )}
                                {isBurn && (
                                  <span style={{ color: headerColor, display: "flex" }}>
                                    {CUSTOMER_HISTORY_ICONS.burn}
                                  </span>
                                )}
                                <span
                                  style={{
                                    color: headerColor,
                                    fontWeight: isCanceled || isRefundedOrigin || isRefundAdmin ? 600 : 600,
                                  }}
                                >
                                  {headerText || detailsText}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {(isComplimentary || isPromocode) && (
                                  <span
                                    style={{
                                      color: isComplimentary ? "#f472b6" : "#facc15",
                                      display: "flex",
                                    }}
                                  >
                                    {isPromocode ? CUSTOMER_HISTORY_ICONS.promo : <Gift size={14} />}
                                  </span>
                                )}
                                <span
                                  style={{
                                    color: detailsColor,
                                    fontWeight: isCanceled || isRefundedOrigin ? 600 : 500,
                                  }}
                                >
                                  {detailsText}
                                </span>
                              </div>
                            )}
                            {subtitleMain && (
                              <div style={{ fontSize: 12, color: subtitleColor, marginTop: 2 }}>
                                {isReferralLike && operation.referralCustomerId ? (
                                  <Link
                                    href={`/customers/${encodeURIComponent(operation.referralCustomerId)}`}
                                    style={{ color: "inherit", textDecoration: "none" }}
                                  >
                                    <span>Реферал: </span>
                                    <span style={{ textDecoration: "underline" }}>{subtitleMain}</span>
                                  </Link>
                                ) : (
                                  subtitleMain
                                )}
                              </div>
                            )}
                            {subtitleExtra && (
                              <div style={{ fontSize: 12, color: subtitleColor, marginTop: 2 }}>
                                {subtitleExtra}
                              </div>
                            )}
                            {operation.note && showStandaloneNote && (
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: isCanceled || isRefundedOrigin ? 0.6 : 0.75,
                                  marginTop: 4,
                                }}
                              >
                                {operation.note}
                              </div>
                            )}
                            {operation.canceledAt && operation.canceledBy?.name && (
                              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                                Отменил: {operation.canceledBy.name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={cellStyle}>{formatDateTime(operation.datetime)}</td>
                        <td style={cellStyle}>{operation.outlet || "—"}</td>
                        <td style={cellStyle}>
                          {operation.rating != null ? <StarRating rating={operation.rating} size={18} /> : "—"}
                        </td>
                        <td style={{ ...cellStyle, textAlign: "right" }}>
                          {canCancel ? (
                            <button
                              type="button"
                              onClick={() => handleCancelTransaction(operation)}
                              style={cancelButtonStyle}
                            >
                              <XCircle size={14} />
                              <span>Отменить</span>
                            </button>
                          ) : (
                            <span style={{ opacity: 0.45 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              {hasTransactionsPagination && (
                <PaginationControls
                  page={transactionsPage}
                  totalPages={transactionsTotalPages}
                  onPrev={() =>
                    setTransactionsPageIndex((current) => Math.max(0, current - 1))
                  }
                  onNext={() =>
                    setTransactionsPageIndex((current) =>
                      Math.min(transactionsTotalPages - 1, current + 1),
                    )
                  }
                />
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Отзывы клиента" />
        <CardBody>
          {customer.reviews.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Клиент ещё не оставил отзывов.</div>
          ) : (
            <>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Дата</th>
                    <th style={headerCellStyle}>Торговая точка</th>
                    <th style={headerCellStyle}>Оценка</th>
                    <th style={headerCellStyle}>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewsPageItems.map((review) => (
                    <tr key={review.id} style={rowStyle}>
                      <td style={cellStyle}>{formatDateTime(review.createdAt)}</td>
                      <td style={cellStyle}>{review.outlet}</td>
                      <td style={cellStyle}>
                        <StarRating rating={review.rating ?? 0} size={18} />
                      </td>
                      <td style={cellStyle}>{review.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasReviewsPagination && (
                <PaginationControls
                  page={reviewsPage}
                  totalPages={reviewsTotalPages}
                  onPrev={() =>
                    setReviewsPageIndex((current) => Math.max(0, current - 1))
                  }
                  onNext={() =>
                    setReviewsPageIndex((current) =>
                      Math.min(reviewsTotalPages - 1, current + 1),
                    )
                  }
                />
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Пригласил клиентов" subtitle="Промокод и список приглашённых" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Промокод клиента:</span>
            <code style={codeStyle}>{customer.invite?.code ?? "—"}</code>
            <span style={{ fontSize: 13, opacity: 0.65 }}>
              Ссылка: {customer.invite?.link ? (
                <a href={customer.invite.link} style={{ color: "#a5b4fc" }} target="_blank" rel="noreferrer">
                  {customer.invite.link}
                </a>
              ) : (
                "—"
              )}
            </span>
          </div>
          {customer.invited.length === 0 ? (
            <div style={{ opacity: 0.6 }}>По этому промокоду ещё никто не зарегистрировался.</div>
          ) : (
            <>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>Клиент</th>
                    <th style={headerCellStyle}>Телефон</th>
                    <th style={headerCellStyle}>Дата присоединения</th>
                    <th style={headerCellStyle}>Покупок</th>
                  </tr>
                </thead>
                <tbody>
                  {invitedPageItems.map((invitee) => (
                    <tr key={invitee.id} style={rowStyle}>
                      <td style={cellStyle}>{invitee.name || invitee.phone || invitee.id}</td>
                      <td style={cellStyle}>{invitee.phone || "—"}</td>
                      <td style={cellStyle}>{formatDate(invitee.joinedAt)}</td>
                      <td style={cellStyle}>{invitee.purchases != null ? invitee.purchases : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasInvitedPagination && (
                <PaginationControls
                  page={invitedPage}
                  totalPages={invitedTotalPages}
                  onPrev={() =>
                    setInvitedPageIndex((current) => Math.max(0, current - 1))
                  }
                  onNext={() =>
                    setInvitedPageIndex((current) =>
                      Math.min(invitedTotalPages - 1, current + 1),
                    )
                  }
                />
              )}
            </>
          )}
        </CardBody>
      </Card>

      {accrueOpen && (
        <AccrueModal
          customer={customer}
          onClose={() => setAccrueOpen(false)}
          onSuccess={handleAccrueSuccess}
          outlets={outlets}
          outletsLoading={outletsLoading}
        />
      )}

      {redeemOpen && (
        <RedeemModal
          customer={customer}
          onClose={() => setRedeemOpen(false)}
          onSuccess={handleRedeemSuccess}
          outlets={outlets}
          outletsLoading={outletsLoading}
        />
      )}

      {complimentaryOpen && (
        <ComplimentaryModal
          customer={customer}
          onClose={() => setComplimentaryOpen(false)}
          onSuccess={handleComplimentarySuccess}
        />
      )}

      <CustomerFormModal
        open={editOpen}
        mode="edit"
        initialValues={mapCustomerToForm(customer)}
        loginToIgnore={customer.login}
        levels={levels}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        existingLogins={existingLogins}
      />
    </div>
  );
}

function parseTags(tags: string): string[] {
  return tags
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatVisitFrequency(customer: CustomerRecord): string {
  const value = customer.visitFrequencyDays;
  if (value == null || value <= 0) return "—";
  const rounded = Math.max(1, Math.round(value));
  return `≈${rounded.toLocaleString("ru-RU")} дн.`;
}

function buildProfileRows(customer: CustomerRecord) {
  const genderLabel = customer.gender === "male" ? "Мужской" : customer.gender === "female" ? "Женский" : "Не указан";
  const referrerValue = customer.referrer ? (
    <Link href={`/customers/${customer.referrer.id}`} style={{ color: "#a5b4fc", textDecoration: "none" }}>
      {customer.referrer.name || customer.referrer.phone || customer.referrer.id}
    </Link>
  ) : (
    "—"
  );

  return [
    { label: "Телефон", value: customer.phone || customer.login || "—" },
    { label: "Email", value: customer.email || "—" },
    { label: "Имя", value: getFullName(customer) || "—" },
    { label: "Пол", value: genderLabel },
    { label: "Возраст", value: customer.age != null ? customer.age : "—" },
    { label: "Дата рождения", value: formatDate(customer.birthday) },
    { label: "Уровень", value: customer.levelName || "—" },
    { label: "Бонусных баллов", value: formatPoints(customer.bonusBalance) },
    { label: "Отложенных баллов", value: formatPoints(customer.pendingBalance) },
    {
      label: "Дней с последней покупки",
      value: customer.daysSinceLastVisit != null ? customer.daysSinceLastVisit : "—",
    },
    { label: "Частота визитов", value: formatVisitFrequency(customer) },
    { label: "Количество покупок", value: customer.visits != null ? customer.visits : "—" },
    { label: "Средний чек", value: formatCurrency(customer.averageCheck) },
    {
      label: "Сумма покупок",
      value: (
        <div style={{ display: "grid", gap: 4 }}>
          <span>Прошлый месяц — {formatCurrency(customer.spendPreviousMonth)}</span>
          <span>Текущий месяц — {formatCurrency(customer.spendCurrentMonth)}</span>
          <span>За всё время — {formatCurrency(customer.spendTotal)}</span>
        </div>
      ),
    },
    { label: "Теги", value: customer.tags.length ? customer.tags.join(", ") : "—" },
    { label: "Дата регистрации", value: formatDateTime(customer.registeredAt) },
    { label: "Комментарий к пользователю", value: customer.comment || "—" },
    {
      label: "Статус блокировки",
      value: customer.redeemBlocked ? "Начисления и списания" : customer.blocked ? "Только начисления" : "Нет",
    },
    { label: "Пригласивший", value: referrerValue },
  ];
}

type InfoRowProps = {
  label: string;
  value: React.ReactNode;
};

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
    <span style={{ opacity: 0.65 }}>{label}</span>
    <span>{value}</span>
  </div>
);

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
};

const PaginationControls: React.FC<PaginationControlsProps> = ({
  page,
  totalPages,
  onPrev,
  onNext,
}) => (
  <div style={paginationWrapperStyle}>
    <span style={{ fontSize: 12, opacity: 0.7 }}>
      Страница {page + 1} из {totalPages}
    </span>
    <div style={{ display: "flex", gap: 8 }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={onPrev}
        disabled={page === 0}
        leftIcon={<ChevronLeft size={14} />}
      >
        Назад
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onNext}
        disabled={page + 1 >= totalPages}
        rightIcon={<ChevronRight size={14} />}
      >
        Вперёд
      </Button>
    </div>
  </div>
);

const paginationWrapperStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 12,
  flexWrap: "wrap",
  gap: 8,
};

const menuWrapperStyle: React.CSSProperties = {
  position: "absolute",
  marginTop: 8,
  right: 0,
  zIndex: 60,
};

const menuCardStyle: React.CSSProperties = {
  width: 280,
  borderRadius: 16,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(12,16,26,0.98)",
  boxShadow: "0 20px 60px rgba(2,6,23,0.45)",
  padding: 16,
  display: "grid",
  gap: 8,
};

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  fontSize: 14,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  opacity: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

const cellStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  fontSize: 14,
};

const amountPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid transparent",
  minWidth: 0,
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.1)",
};

const codeStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "rgba(15,23,42,0.5)",
  border: "1px solid rgba(148,163,184,0.2)",
};

const toastStyle: React.CSSProperties = {
  position: "fixed",
  top: 96,
  right: 24,
  background: "rgba(59,130,246,0.16)",
  border: "1px solid rgba(59,130,246,0.35)",
  color: "#bfdbfe",
  padding: "12px 16px",
  borderRadius: 12,
  zIndex: 110,
  fontSize: 14,
  boxShadow: "0 16px 60px rgba(30,64,175,0.35)",
};

const cancelButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(248,113,113,0.35)",
  background: "rgba(248,113,113,0.08)",
  color: "#fca5a5",
  fontSize: 12,
  cursor: "pointer",
  transition: "background 0.2s ease",
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
      current.refundEvents.push({ datetime: tx.datetime, admin: tx.kind === "CANCELED" });
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

function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(value));
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
    return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function mapCustomerToForm(customer: CustomerRecord): Partial<CustomerFormPayload> {
  const birthdayValue = customer.birthday ? customer.birthday.slice(0, 10) : "";
  return {
    login: customer.login,
    email: customer.email ?? "",
    firstName: getFullName(customer) || "",
    tags: customer.tags.join(", "),
    birthday: birthdayValue,
    levelId: customer.levelId ?? null,
    gender: customer.gender,
    comment: customer.comment ?? "",
  };
}

type AccrueModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
  outlets: OutletOption[];
  outletsLoading: boolean;
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
        throw new Error(text || res.statusText);
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
      setApiError(error?.message || "Не удалось начислить баллы");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle} role="dialog" aria-modal="true">
        <ModalHeader title="Начисление баллов" onClose={onClose} />
        <div style={modalBodyStyle}>
          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Информация о клиенте</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Телефон клиента</span>
              <input style={inputStyle} value={customer.phone || customer.login} disabled />
            </label>
          </section>

          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Информация об операции</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Сумма покупки</span>
              <input
                style={inputStyle}
                value={form.amount}
                onChange={(event) => update("amount", event.target.value)}
                placeholder="Например, 1250.50"
              />
              {errors.amount && <ErrorText>{errors.amount}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Номер чека</span>
              <input
                style={inputStyle}
                value={form.receipt}
                onChange={(event) => update("receipt", event.target.value)}
                placeholder="Необязательно"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Какое количество баллов начислить</span>
              <input
                style={{ ...inputStyle, opacity: autoCalc ? 0.75 : 1 }}
                value={autoCalc ? (autoPoints > 0 ? String(autoPoints) : "") : form.manualPoints}
                onChange={(event) => update("manualPoints", event.target.value)}
                placeholder={autoCalc ? "Автоматический расчёт" : "Например, 120"}
                readOnly={autoCalc}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={autoCalc}
                    disabled={earnRateBps == null}
                    onChange={(event) => {
                      const next = event.target.checked && earnRateBps != null;
                      setAutoCalc(next);
                      if (!next) {
                        update("manualPoints", autoPoints > 0 ? String(autoPoints) : "");
                      } else {
                        update("manualPoints", "");
                      }
                    }}
                  />
                  <span>
                    Автокалькуляция
                    {earnRateBps != null ? ` (${(earnRateBps / 100).toFixed(2)}%)` : ""}
                  </span>
                </label>
              </div>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {autoCalc
                  ? earnRateBps != null
                    ? autoPoints > 0
                      ? `Будет начислено ${formatPoints(autoPoints)} баллов по уровню клиента.`
                      : "Введите сумму покупки, чтобы рассчитать начисление."
                    : "Ставка уровня недоступна, укажите количество баллов вручную."
                  : "Укажите, сколько баллов нужно начислить вручную."}
              </span>
              {errors.manualPoints && <ErrorText>{errors.manualPoints}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Торговая точка</span>
              <select
                style={inputStyle}
                value={form.outletId}
                onChange={(event) => update("outletId", event.target.value)}
                disabled={outletsLoading || outletsUnavailable}
              >
                {outletsLoading && <option value="">Загрузка…</option>}
                {!outletsLoading && outlets.length === 0 && (
                  <option value="">Нет доступных торговых точек</option>
                )}
                {!outletsLoading &&
                  outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
              </select>
              {errors.outletId && <ErrorText>{errors.outletId}</ErrorText>}
            </label>
          </section>
          {apiError && <ErrorText>{apiError}</ErrorText>}
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting || outletsLoading || outletsUnavailable}>
            {submitting ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
};

type RedeemModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
  outlets: OutletOption[];
  outletsLoading: boolean;
};

type ComplimentaryModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
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
        throw new Error(text || res.statusText);
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
      setApiError(error?.message || "Не удалось списать баллы");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle} role="dialog" aria-modal="true">
        <ModalHeader title="Списание баллов" onClose={onClose} />
        <div style={modalBodyStyle}>
          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Информация о клиенте</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Телефон клиента</span>
              <input style={inputStyle} value={customer.phone || customer.login} disabled />
            </label>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Доступно для списания: {formatPoints(customer.bonusBalance)} баллов
            </div>
          </section>

          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Информация об операции</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Какое количество баллов списать</span>
              <input
                style={inputStyle}
                value={form.amount}
                onChange={(event) => update("amount", event.target.value)}
                placeholder={`Доступно: ${formatPoints(customer.bonusBalance)}`}
              />
              {errors.amount && <ErrorText>{errors.amount}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Торговая точка</span>
              <select
                style={inputStyle}
                value={form.outletId}
                onChange={(event) => update("outletId", event.target.value)}
                disabled={outletsLoading || outletsUnavailable}
              >
                {outletsLoading && <option value="">Загрузка…</option>}
                {!outletsLoading && outlets.length === 0 && (
                  <option value="">Нет доступных торговых точек</option>
                )}
                {!outletsLoading &&
                  outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
              </select>
              {errors.outletId && <ErrorText>{errors.outletId}</ErrorText>}
            </label>
          </section>
          {apiError && <ErrorText>{apiError}</ErrorText>}
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting || outletsLoading || outletsUnavailable}>
            {submitting ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
};

const ComplimentaryModal: React.FC<ComplimentaryModalProps> = ({ customer, onClose, onSuccess }) => {
  const [form, setForm] = React.useState<ComplimentaryForm>({
    points: "",
    expiresIn: "0",
    comment: "",
  });
  const [errors, setErrors] = React.useState<ComplimentaryErrors>({});
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function update<K extends keyof ComplimentaryForm>(key: K, value: ComplimentaryForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: ComplimentaryErrors = {};
    const pointsValue = Number(form.points);
    if (!form.points.trim()) {
      nextErrors.points = "Укажите количество баллов";
    } else if (Number.isNaN(pointsValue) || pointsValue <= 0) {
      nextErrors.points = "Баллы должны быть больше 0";
    }

    const expiresValue = Number(form.expiresIn);
    if (form.expiresIn === "") {
      nextErrors.expiresIn = "Укажите срок";
    } else if (Number.isNaN(expiresValue) || expiresValue < 0) {
      nextErrors.expiresIn = "Срок не может быть отрицательным";
    }

    if (form.comment.trim().length > 60) {
      nextErrors.comment = "Комментарий не должен превышать 60 символов";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        points: Number(form.points),
        expiresInDays: Number(form.expiresIn),
        comment: form.comment.trim() || undefined,
      };

      const res = await fetch(
        `/api/customers/${encodeURIComponent(customer.id)}/transactions/complimentary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      const pointsIssued = data?.pointsIssued ?? Number(form.points);
      const message =
        pointsIssued && Number.isFinite(pointsIssued)
          ? `Начислено ${formatPoints(pointsIssued)} комплиментарных баллов`
          : "Комплиментарные баллы начислены";
      onSuccess(message);
    } catch (error: any) {
      setApiError(error?.message || "Не удалось начислить комплиментарные баллы");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle} role="dialog" aria-modal="true">
        <ModalHeader title="Комплиментарные баллы" onClose={onClose} />
        <div style={modalBodyStyle}>
          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Информация о клиенте</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Телефон клиента</span>
              <input style={inputStyle} value={customer.phone || customer.login} disabled />
            </label>
          </section>

          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Параметры начисления</h4>
            <label style={fieldStyle}>
              <span style={labelStyle}>Начислить баллов</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                step={1}
                value={form.points}
                onChange={(event) => update("points", event.target.value)}
                placeholder="Например, 500"
              />
              {errors.points && <ErrorText>{errors.points}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Срок до сгорания (дней)</span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={form.expiresIn}
                onChange={(event) => update("expiresIn", event.target.value)}
              />
              <span style={{ fontSize: 12, opacity: 0.7 }}>Укажите 0, если срок действия баллов не ограничен.</span>
              {errors.expiresIn && <ErrorText>{errors.expiresIn}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Комментарий</span>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                value={form.comment}
                onChange={(event) => update("comment", event.target.value)}
                placeholder="Комментарий увидит клиент в истории"
                maxLength={60}
              />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {form.comment.length}/60
              </span>
              {errors.comment && <ErrorText>{errors.comment}</ErrorText>}
            </label>
          </section>
          {apiError && <ErrorText>{apiError}</ErrorText>}
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Начисляем…" : "Начислить"}
          </Button>
        </div>
      </form>
    </div>
  );
};

type ModalHeaderProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
};

const ModalHeader: React.FC<ModalHeaderProps> = ({ title, subtitle, onClose }) => (
  <div style={modalHeaderStyle}>
    <div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, opacity: 0.65 }}>{subtitle}</div>}
    </div>
    <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Закрыть">
      <X size={16} />
    </button>
  </div>
);

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.76)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 120,
};

const modalStyle: React.CSSProperties = {
  width: "min(640px, 96vw)",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(12,16,26,0.97)",
  boxShadow: "0 26px 90px rgba(2,6,23,0.55)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  color: "inherit",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "18px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const modalBodyStyle: React.CSSProperties = {
  padding: "18px 24px",
  display: "grid",
  gap: 20,
  maxHeight: "70vh",
  overflowY: "auto",
};

const modalFooterStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderTop: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
};

const closeButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.18)",
  border: "1px solid rgba(248,113,113,0.5)",
  color: "#fca5a5",
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const modalSectionStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.55)",
  color: "inherit",
};

const ErrorText: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontSize: 12, color: "#f87171" }}>{children}</span>
);
