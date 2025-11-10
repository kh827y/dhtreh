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
          .filter((item): item is OutletOption => Boolean(item));
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
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Всегда вызываем хук, чтобы не нарушать порядок хуков между рендерами
  const groups = React.useMemo(() => {
    const base = ["Постоянные", "Стандарт", "VIP", "Новые", "Сонные"];
    return Array.from(new Set([customer?.group, ...base].filter(Boolean) as string[]));
  }, [customer?.group]);

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
    const baseBody = {
      phone: payload.login.trim(),
      email: payload.email.trim() || undefined,
      firstName: payload.firstName.trim() || undefined,
      lastName: payload.lastName.trim() || undefined,
      name: [payload.firstName.trim(), payload.lastName.trim()].filter(Boolean).join(" ").trim() || undefined,
      birthday: payload.birthday || undefined,
      gender: payload.gender,
      tags: parseTags(payload.tags),
      comment: payload.comment.trim() || undefined,
      accrualsBlocked: payload.blockAccruals,
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
          <Button variant="secondary" leftIcon={<PlusCircle size={16} />} onClick={() => setAccrueOpen(true)}>
            Начислить баллы
          </Button>
          <Button variant="secondary" leftIcon={<MinusCircle size={16} />} onClick={() => setRedeemOpen(true)}>
            Списать баллы
          </Button>
          <Button
            variant="primary"
            leftIcon={<Gift size={16} />}
            onClick={() => setComplimentaryOpen(true)}
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
                      const isCanceled = Boolean(operation.canceledAt);
                      const canCancel = !isCanceled && operation.kind !== "REFUND";
                      const isComplimentary = operation.kind === "COMPLIMENTARY";
                      const changePrefix =
                        operation.change > 0 ? "+" : operation.change < 0 ? "−" : "";
                      const changeColor = isCanceled
                        ? "rgba(148,163,184,0.75)"
                        : operation.change > 0 && !isBlockedAccrual
                          ? "#4ade80"
                          : "#f87171";
                      const detailsColor = isCanceled
                        ? "#94a3b8"
                        : isComplimentary
                          ? "#f472b6"
                          : "inherit";
                    return (
                      <tr
                        key={operation.id}
                        style={{
                          ...rowStyle,
                          opacity: isCanceled ? 0.6 : isBlockedAccrual ? 0.85 : 1,
                          background: isComplimentary
                            ? "rgba(244,114,182,0.08)"
                            : rowStyle.background,
                        }}
                      >
                        <td style={cellStyle}>{transactionsStartIndex + index + 1}</td>
                        <td style={cellStyle}>{formatCurrency(operation.purchaseAmount)}</td>
                        <td style={{ ...cellStyle, color: changeColor, fontWeight: 600 }}>
                          {changePrefix}
                          {formatPoints(Math.abs(operation.change))}
                        </td>
                        <td style={{ ...cellStyle, verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isComplimentary && (
                              <span style={{ color: "#f472b6", display: "flex" }}>
                                <Gift size={14} />
                              </span>
                            )}
                            <span style={{ color: detailsColor, fontWeight: isCanceled ? 600 : 500 }}>
                              {operation.details}
                            </span>
                          </div>
                          {operation.note && (
                            <div style={{ fontSize: 12, opacity: isCanceled ? 0.6 : 0.75, marginTop: 4 }}>
                              {operation.note}
                            </div>
                          )}
                          {operation.canceledAt && operation.canceledBy?.name && (
                            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                              Отменил: {operation.canceledBy.name}
                            </div>
                          )}
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
                        <StarRating rating={review.rating} size={18} />
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
        groups={groups}
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
    { label: "Блокировка начислений", value: customer.blocked ? "Да" : "Нет" },
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

function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(value));
}

function formatPoints(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value?: string): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU");
  } catch {
    return "—";
  }
}

function formatDateTime(value?: string): string {
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
  return {
    login: customer.login,
    email: customer.email ?? "",
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    tags: customer.tags.join(", "),
    birthday: customer.birthday ?? "",
    group: customer.group ?? "Стандарт",
    blockAccruals: customer.blocked,
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
    setForm((prev) => {
      if (prev.outletId && outlets.some((item) => item.id === prev.outletId)) {
        return prev;
      }
      return { ...prev, outletId: outlets[0].id };
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
    setForm((prev) => {
      if (prev.outletId && outlets.some((item) => item.id === prev.outletId)) {
        return prev;
      }
      return { ...prev, outletId: outlets[0].id };
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
