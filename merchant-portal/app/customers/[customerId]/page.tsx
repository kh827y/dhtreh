"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import StarRating from "../../../components/StarRating";
import type { CustomerDetails, CustomerTransaction, Gender } from "../data";
import { getFullName, normalizeGender } from "../data";
import { CustomerFormModal, type CustomerFormPayload } from "../customer-form-modal";

const { Edit3, PlusCircle, MinusCircle, Gift, X } = Icons;

type AccrueForm = {
  amount: string;
  receipt: string;
  manualPoints: string;
  outletId: string;
  deviceNumber: string;
};

type RedeemForm = {
  amount: string;
  outletId: string;
  deviceNumber: string;
};

type AccrueErrors = Partial<Record<keyof AccrueForm, string>> & { amount?: string; manualPoints?: string };
type RedeemErrors = Partial<Record<keyof RedeemForm, string>> & { amount?: string };

type PageProps = {
  params: { customerId: string | string[] };
};

type Outlet = { id: string; name: string };

type CustomerApiResponse = CustomerDetails & { metadata: Record<string, any> };

export default function CustomerCardPage({ params }: PageProps) {
  const router = useRouter();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = React.useState<CustomerDetails | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [accrueOpen, setAccrueOpen] = React.useState(false);
  const [redeemOpen, setRedeemOpen] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<CustomerTransaction | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);

  React.useEffect(() => {
    fetchCustomer();
  }, [customerId]);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function fetchCustomer() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/customers/${encodeURIComponent(customerId)}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Не удалось загрузить клиента (${res.status})`);
      }
      const json = (await res.json()) as CustomerApiResponse;
      setCustomer(mapApiToDetails(json));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    async function loadOutlets() {
      try {
        const res = await fetch("/api/portal/outlets", { cache: "force-cache" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: Array<{ id: string; name: string }> };
        if (Array.isArray(json?.items)) {
          setOutlets(json.items.map((item) => ({ id: item.id, name: item.name })));
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadOutlets();
  }, []);

  if (loading) {
    return <div style={{ padding: 32, opacity: 0.7 }}>Загрузка карточки клиента…</div>;
  }

  if (error || !customer) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Клиент не найден</h1>
        <p style={{ opacity: 0.7 }}>{error || "Запрошенная карточка клиента отсутствует."}</p>
        <Link href="/customers" style={{ color: "#818cf8" }}>
          ← Вернуться к списку
        </Link>
      </div>
    );
  }

  const fullName = getFullName({ firstName: customer.firstName, lastName: customer.lastName }) || customer.login || "—";
  const groups = Array.from(new Set([customer.group, "Постоянные", "Стандарт", "VIP", "Новые", "Сонные"].filter(Boolean))) as string[];

  function handleAccrueSuccess(message: string) {
    setToast(message);
    setAccrueOpen(false);
    fetchCustomer();
  }

  function handleRedeemSuccess(message: string) {
    setToast(message);
    setRedeemOpen(false);
    fetchCustomer();
  }

  async function handleEditSubmit(payload: CustomerFormPayload) {
    const body = {
      login: payload.login.trim(),
      password: payload.password.trim() || undefined,
      passwordConfirm: payload.confirmPassword.trim() || undefined,
      email: payload.email.trim(),
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      tags: payload.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      birthday: payload.birthday || undefined,
      group: payload.group,
      blockAccruals: payload.blockAccruals,
      gender: payload.gender,
      comment: payload.comment.trim(),
    };
    const res = await fetch(`/api/portal/customers/${encodeURIComponent(customer.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Не удалось обновить клиента");
    }
    setToast("Данные клиента обновлены");
    setEditOpen(false);
    fetchCustomer();
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
            <span>{customer.login || "—"}</span>
            <span>•</span>
            <span>{customer.level || "—"} уровень</span>
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
            onClick={() => router.push(`/customers/complimentary?phone=${encodeURIComponent(customer.login || "")}&customerId=${customer.id}`)}
          >
            Начислить комплиментарные баллы
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader title="Профиль" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          {buildProfileRows(customer).map((row) => (
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
                {customer.expiry.map((item, index) => (
                  <tr key={item.id} style={rowStyle}>
                    <td style={cellStyle}>{index + 1}</td>
                    <td style={cellStyle}>{formatDate(item.accrualDate)}</td>
                    <td style={cellStyle}>{item.expiresAt ? formatDate(item.expiresAt) : "Бессрочно"}</td>
                    <td style={cellStyle}>{formatPoints(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card id="operations">
        <CardHeader title="История операций с баллами" subtitle="Последние начисления и списания" />
        <CardBody>
          {customer.transactions.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Операций пока не было.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>#</th>
                    <th style={headerCellStyle}>Тип</th>
                    <th style={headerCellStyle}>Сумма покупки</th>
                    <th style={headerCellStyle}>Баллов</th>
                    <th style={headerCellStyle}>Основание</th>
                    <th style={headerCellStyle}>Дата/время</th>
                    <th style={headerCellStyle}>Торговая точка</th>
                    <th style={headerCellStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {customer.transactions.map((item, index) => (
                    <tr key={item.id} style={rowStyle}>
                      <td style={cellStyle}>{index + 1}</td>
                      <td style={cellStyle}>{mapTxnType(item.type)}</td>
                      <td style={cellStyle}>{formatCurrency(item.purchaseAmount)}</td>
                      <td style={cellStyle}>{formatPoints(item.change)}</td>
                      <td style={cellStyle}>{item.details}</td>
                      <td style={cellStyle}>{formatDateTime(item.datetime)}</td>
                      <td style={cellStyle}>{item.outlet || "—"}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>
                        <button type="button" style={iconButtonStyle} onClick={() => setSelectedTransaction(item)}>
                          Подробнее
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {customer.reviews.length > 0 && (
        <Card>
          <CardHeader title="Отзывы клиента" />
          <CardBody style={{ display: "grid", gap: 12 }}>
            {customer.reviews.map((review) => (
              <div key={review.id} style={{ border: "1px solid rgba(148,163,184,0.18)", borderRadius: 14, padding: 16, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StarRating value={review.rating} />
                  <span style={{ opacity: 0.7 }}>{review.outlet || "—"}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ opacity: 0.7 }}>{formatDate(review.createdAt)}</span>
                </div>
                <div>{review.comment}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {customer.invited.length > 0 && (
        <Card>
          <CardHeader title="Пригласил клиентов" subtitle="Список приглашённых участников" />
          <CardBody>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Имя</th>
                  <th style={headerCellStyle}>Логин</th>
                  <th style={headerCellStyle}>Дата присоединения</th>
                  <th style={headerCellStyle}>Покупок</th>
                </tr>
              </thead>
              <tbody>
                {customer.invited.map((item) => (
                  <tr key={item.id} style={rowStyle}>
                    <td style={cellStyle}>{item.name || "—"}</td>
                    <td style={cellStyle}>{item.login || "—"}</td>
                    <td style={cellStyle}>{item.joinedAt ? formatDate(item.joinedAt) : "—"}</td>
                    <td style={cellStyle}>{item.purchases != null ? item.purchases : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {accrueOpen && (
        <AccrueModal
          outlets={outlets}
          onClose={() => setAccrueOpen(false)}
          onSuccess={handleAccrueSuccess}
          customerId={customer.id}
        />
      )}

      {redeemOpen && (
        <RedeemModal
          outlets={outlets}
          onClose={() => setRedeemOpen(false)}
          onSuccess={handleRedeemSuccess}
          customerId={customer.id}
          maxAmount={customer.bonusBalance}
        />
      )}

      {selectedTransaction && (
        <TransactionModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onCancel={async () => {
            const res = await fetch(`/api/portal/customers/transactions/${encodeURIComponent(selectedTransaction.id)}/cancel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ actor: "portal" }),
            });
            if (!res.ok) {
              const text = await res.text();
              setToast(text || "Не удалось отменить транзакцию");
            } else {
              setToast("Транзакция отменена");
              setSelectedTransaction(null);
              fetchCustomer();
            }
          }}
        />
      )}

      {editOpen && (
        <CustomerFormModal
          open
          mode="edit"
          initialValues={mapCustomerToForm(customer)}
          loginToIgnore={customer.login || undefined}
          groups={groups}
          onClose={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  );
}

const toastStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(63, 98, 18, 0.3)",
  color: "#bbf7d0",
  border: "1px solid rgba(132, 204, 22, 0.4)",
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
  padding: "10px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  fontSize: 13,
};

const rowStyle: React.CSSProperties = {
  transition: "background 0.2s",
};

const iconButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(30,41,59,0.4)",
  color: "inherit",
  cursor: "pointer",
  padding: "6px 10px",
  borderRadius: 10,
};

function mapApiToDetails(api: CustomerApiResponse): CustomerDetails {
  return {
    id: api.id,
    login: api.login,
    firstName: api.firstName,
    lastName: api.lastName,
    email: api.email,
    visitFrequency: api.visitFrequency,
    averageCheck: api.averageCheck,
    birthday: api.birthday,
    age: api.age,
    gender: normalizeGender(api.gender || undefined),
    daysSinceLastVisit: api.daysSinceLastVisit,
    visitCount: api.visitCount,
    bonusBalance: api.bonusBalance,
    pendingBalance: api.pendingBalance,
    level: api.level,
    spendPreviousMonth: api.spendPreviousMonth,
    spendCurrentMonth: api.spendCurrentMonth,
    spendTotal: api.spendTotal,
    tags: api.tags,
    registeredAt: api.registeredAt,
    comment: api.comment,
    blocked: api.blocked,
    referrer: api.referrer,
    group: api.group,
    inviteCode: api.inviteCode,
    customerNumber: api.customerNumber,
    deviceNumber: api.deviceNumber,
    expiry: (api.bonusPendingLots || []).map((lot) => ({
      id: lot.id,
      accrualDate: lot.accrualDate,
      expiresAt: lot.expiresAt,
      amount: lot.amount,
    })),
    transactions: (api.transactions || []).map(mapTransaction),
    reviews: api.reviews || [],
    invited: api.invited || [],
    metadata: api.metadata || {},
  };
}

function mapTransaction(txn: any): CustomerTransaction {
  const purchaseAmount = Number(txn.metadata?.purchaseAmount ?? 0);
  const change = txn.amount;
  const details = txn.comment || (txn.type === "EARN" ? "Начисление" : txn.type === "REDEEM" ? "Списание" : "Операция");
  return {
    id: txn.id,
    purchaseAmount,
    change,
    details,
    datetime: txn.createdAt,
    outlet: txn.outlet?.name || null,
    rating: undefined,
    receipt: txn.orderId || null,
    manager: null,
    carrier: null,
    carrierCode: null,
    toPay: Math.max(0, purchaseAmount - (txn.type === "REDEEM" ? Math.abs(change) : 0)),
    paidByPoints: txn.type === "REDEEM" ? Math.abs(change) : 0,
    total: purchaseAmount,
    type: txn.type,
    comment: txn.comment || null,
  };
}

function buildProfileRows(customer: CustomerDetails) {
  return [
    { label: "Логин", value: customer.login || "—" },
    { label: "Имя", value: getFullName(customer) || "—" },
    { label: "Бонусных баллов", value: formatPoints(customer.bonusBalance) },
    { label: "Отложенных баллов", value: formatPoints(customer.pendingBalance) },
    { label: "Пол", value: mapGender(customer.gender) },
    { label: "Возраст", value: customer.age != null ? `${customer.age}` : "—" },
    { label: "Дата рождения", value: customer.birthday ? formatDate(customer.birthday) : "—" },
    { label: "Дней с последнего визита", value: customer.daysSinceLastVisit != null ? `${customer.daysSinceLastVisit}` : "—" },
    { label: "Частота визитов", value: customer.visitFrequency || "—" },
    { label: "Средний чек", value: formatCurrency(customer.averageCheck) },
    { label: "Уровень", value: customer.level || "—" },
    { label: "Сумма покупок (прошлый месяц)", value: formatCurrency(customer.spendPreviousMonth) },
    { label: "Сумма покупок (текущий месяц)", value: formatCurrency(customer.spendCurrentMonth) },
    { label: "Сумма покупок (всего)", value: formatCurrency(customer.spendTotal) },
    { label: "Теги", value: customer.tags.length ? customer.tags.join(", ") : "—" },
    { label: "Дата регистрации", value: formatDate(customer.registeredAt) },
    { label: "Комментарий", value: customer.comment || "—" },
    { label: "Блокировка начислений", value: customer.blocked ? "Да" : "Нет" },
    { label: "Приглашавший", value: customer.referrer || "—" },
    { label: "Промокод", value: customer.inviteCode || "—" },
    { label: "Номер клиента", value: customer.customerNumber || "—" },
  ];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString("ru-RU")} ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value || 0);
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value || 0);
}

function mapGender(gender: Gender): string {
  switch (gender) {
    case "male":
      return "Мужской";
    case "female":
      return "Женский";
    default:
      return "Не указан";
  }
}

function mapCustomerToForm(customer: CustomerDetails): Partial<CustomerFormPayload> {
  return {
    login: customer.login || "",
    email: customer.email || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    tags: (customer.tags || []).join(", "),
    birthday: customer.birthday || "",
    group: customer.group || "Стандарт",
    blockAccruals: customer.blocked,
    gender: customer.gender,
    comment: customer.comment || "",
  };
}

function mapTxnType(type: string): string {
  switch (type) {
    case "EARN":
      return "Начисление";
    case "REDEEM":
      return "Списание";
    case "ADJUST":
      return "Корректировка";
    default:
      return type;
  }
}

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.6)",
  backdropFilter: "blur(6px)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.95)",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  width: "min(520px, 100%)",
  padding: 24,
  display: "grid",
  gap: 16,
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const modalBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  marginTop: 12,
};

type ModalBaseProps = {
  onClose: () => void;
  children: React.ReactNode;
  title: string;
};

const ModalBase: React.FC<ModalBaseProps> = ({ onClose, children, title }) => (
  <div style={modalBackdropStyle}>
    <div style={modalStyle}>
      <div style={modalHeaderStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>{title}</h2>
        <button type="button" onClick={onClose} style={iconButtonStyle}>
          <X size={16} />
        </button>
      </div>
      <div style={modalBodyStyle}>{children}</div>
    </div>
  </div>
);

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.55)",
  color: "inherit",
};

function AccrueModal({ outlets, onClose, onSuccess, customerId }: { outlets: Outlet[]; onClose: () => void; onSuccess: (message: string) => void; customerId: string }) {
  const [form, setForm] = React.useState<AccrueForm>({ amount: "", receipt: "", manualPoints: "", outletId: outlets[0]?.id || "", deviceNumber: "" });
  const [errors, setErrors] = React.useState<AccrueErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  function update<K extends keyof AccrueForm>(key: K, value: AccrueForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: AccrueErrors = {};
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = "Укажите положительную сумму";
    }
    if (form.manualPoints) {
      const points = Number(form.manualPoints);
      if (!Number.isFinite(points) || points <= 0) {
        nextErrors.manualPoints = "Укажите положительное число";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/customers/${encodeURIComponent(customerId)}/accrue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          receipt: form.receipt || undefined,
          manualPoints: form.manualPoints ? Number(form.manualPoints) : undefined,
          outletId: form.outletId || undefined,
          deviceId: form.deviceNumber || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось начислить баллы");
      }
      onSuccess("Баллы начислены");
    } catch (err) {
      setErrors((prev) => ({ ...prev, amount: err instanceof Error ? err.message : "Ошибка" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBase title="Начислить баллы" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={fieldStyle}>
          <span>Сумма покупки</span>
          <input type="number" min={0} step={0.01} value={form.amount} onChange={(event) => update("amount", event.target.value)} style={inputStyle} />
          {errors.amount && <span style={errorStyle}>{errors.amount}</span>}
        </label>
        <label style={fieldStyle}>
          <span>Номер чека (опционально)</span>
          <input value={form.receipt} onChange={(event) => update("receipt", event.target.value)} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span>Баллов начислить вручную (опционально)</span>
          <input type="number" min={0} step={1} value={form.manualPoints} onChange={(event) => update("manualPoints", event.target.value)} style={inputStyle} />
          {errors.manualPoints && <span style={errorStyle}>{errors.manualPoints}</span>}
        </label>
        <label style={fieldStyle}>
          <span>Торговая точка</span>
          <select value={form.outletId} onChange={(event) => update("outletId", event.target.value)} style={inputStyle}>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>№ устройства (опционально)</span>
          <input value={form.deviceNumber} onChange={(event) => update("deviceNumber", event.target.value)} style={inputStyle} />
        </label>
        <div style={buttonRowStyle}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Обработка…" : "Создать"}
          </Button>
        </div>
      </form>
    </ModalBase>
  );
}

function RedeemModal({ outlets, onClose, onSuccess, customerId, maxAmount }: { outlets: Outlet[]; onClose: () => void; onSuccess: (message: string) => void; customerId: string; maxAmount: number }) {
  const [form, setForm] = React.useState<RedeemForm>({ amount: "", outletId: outlets[0]?.id || "", deviceNumber: "" });
  const [errors, setErrors] = React.useState<RedeemErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  function update<K extends keyof RedeemForm>(key: K, value: RedeemForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: RedeemErrors = {};
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = "Укажите положительное число";
    } else if (amount > maxAmount) {
      nextErrors.amount = "Недостаточно баллов";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/customers/${encodeURIComponent(customerId)}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          outletId: form.outletId || undefined,
          deviceId: form.deviceNumber || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось списать баллы");
      }
      onSuccess("Баллы списаны");
    } catch (err) {
      setErrors((prev) => ({ ...prev, amount: err instanceof Error ? err.message : "Ошибка" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBase title="Списать баллы" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={fieldStyle}>
          <span>Количество баллов</span>
          <input type="number" min={0} step={1} value={form.amount} onChange={(event) => update("amount", event.target.value)} style={inputStyle} />
          {errors.amount && <span style={errorStyle}>{errors.amount}</span>}
        </label>
        <label style={fieldStyle}>
          <span>Торговая точка</span>
          <select value={form.outletId} onChange={(event) => update("outletId", event.target.value)} style={inputStyle}>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>№ устройства (опционально)</span>
          <input value={form.deviceNumber} onChange={(event) => update("deviceNumber", event.target.value)} style={inputStyle} />
        </label>
        <div style={buttonRowStyle}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Обработка…" : "Создать"}
          </Button>
        </div>
      </form>
    </ModalBase>
  );
}

function TransactionModal({ transaction, onClose, onCancel }: { transaction: CustomerTransaction; onClose: () => void; onCancel: () => Promise<void> }) {
  const [submitting, setSubmitting] = React.useState(false);

  async function handleCancel() {
    setSubmitting(true);
    await onCancel();
    setSubmitting(false);
  }

  return (
    <ModalBase title="Транзакция" onClose={onClose}>
      <div style={{ display: "grid", gap: 8 }}>
        <InfoRow label="Тип" value={mapTxnType(transaction.type)} />
        <InfoRow label="Сумма покупки" value={formatCurrency(transaction.purchaseAmount)} />
        <InfoRow label="Баллов" value={formatPoints(transaction.change)} />
        <InfoRow label="Основание" value={transaction.details || "—"} />
        <InfoRow label="Дата/время" value={formatDateTime(transaction.datetime)} />
        <InfoRow label="Точка" value={transaction.outlet || "—"} />
        <InfoRow label="№ чека" value={transaction.receipt || "—"} />
        <InfoRow label="Комментарий" value={transaction.comment || "—"} />
      </div>
      <div style={buttonRowStyle}>
        <Button type="button" variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        <Button type="button" variant="primary" onClick={handleCancel} disabled={submitting}>
          {submitting ? "Отмена…" : "Отменить транзакцию"}
        </Button>
      </div>
    </ModalBase>
  );
}

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#f87171",
};
