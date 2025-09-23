"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import StarRating from "../../../components/StarRating";
import {
  customersMock,
  getCustomerById,
  getFullName,
  type CustomerRecord,
  type CustomerTransaction,
} from "../data";
import { CustomerFormModal, type CustomerFormPayload } from "../customer-form-modal";

const { Edit3, PlusCircle, MinusCircle, Gift, X } = Icons;

const outlets = [
  { id: "out-1", name: "Кофейня на Лиговском" },
  { id: "out-2", name: "Точка у метро Чкаловская" },
  { id: "out-3", name: "Pop-up в бизнес-центре" },
];

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

export default function CustomerCardPage({ params }: PageProps) {
  const router = useRouter();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = React.useState<CustomerRecord | null>(() => getCustomerById(customerId) ?? null);
  const [accrueOpen, setAccrueOpen] = React.useState(false);
  const [redeemOpen, setRedeemOpen] = React.useState(false);
  const [selectedTransaction, setSelectedTransaction] = React.useState<CustomerTransaction | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  React.useEffect(() => {
    setCustomer(getCustomerById(customerId) ?? null);
  }, [customerId]);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

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

  const fullName = getFullName(customer) || customer.login;
  const profileRows = buildProfileRows(customer);
  const existingLogins = React.useMemo(() => customersMock.map((item) => item.login), []);
  const groups = React.useMemo(
    () => Array.from(new Set([customer.group, "Постоянные", "Стандарт", "VIP", "Новые", "Сонные"])),
    [customer.group],
  );

  function handleAccrueSuccess(message: string) {
    setToast(message);
    setAccrueOpen(false);
  }

  function handleRedeemSuccess(message: string) {
    setToast(message);
    setRedeemOpen(false);
  }

  async function handleEditSubmit(payload: CustomerFormPayload) {
    setCustomer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        login: payload.login.trim(),
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim(),
        birthday: payload.birthday,
        age: payload.birthday ? calculateAge(payload.birthday) : prev.age,
        tags: normalizeTags(payload.tags),
        comment: payload.comment.trim(),
        group: payload.group || prev.group,
        blocked: payload.blockAccruals,
        gender: payload.gender,
      };
    });
    setToast("Данные клиента обновлены");
    setEditOpen(false);
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
            <span>{customer.login}</span>
            <span>•</span>
            <span>{customer.level} уровень</span>
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
            onClick={() => router.push(`/customers/complimentary?phone=${encodeURIComponent(customer.login)}&customerId=${customer.id}`)}
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
                    <td style={cellStyle}>{formatDate(item.expiresAt)}</td>
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
            <div style={{ opacity: 0.6 }}>Пока нет операций с баллами.</div>
          ) : (
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
                  </tr>
                </thead>
                <tbody>
                  {customer.transactions.map((operation, index) => (
                    <tr
                      key={operation.id}
                      style={{ ...rowStyle, cursor: "pointer" }}
                      onClick={() => setSelectedTransaction(operation)}
                    >
                      <td style={cellStyle}>{index + 1}</td>
                      <td style={cellStyle}>{formatCurrency(operation.purchaseAmount)}</td>
                      <td style={{ ...cellStyle, color: operation.change >= 0 ? "#4ade80" : "#f87171" }}>
                        {operation.change >= 0 ? "+" : ""}
                        {formatPoints(Math.abs(operation.change))}
                      </td>
                      <td style={cellStyle}>{operation.details}</td>
                      <td style={cellStyle}>{formatDateTime(operation.datetime)}</td>
                      <td style={cellStyle}>{operation.outlet}</td>
                      <td style={cellStyle}>
                        {operation.rating ? <StarRating rating={operation.rating} size={18} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Отзывы клиента" />
        <CardBody>
          {customer.reviews.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Клиент ещё не оставил отзывов.</div>
          ) : (
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
                {customer.reviews.map((review) => (
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
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Пригласил клиентов" subtitle="Промокод и список приглашённых" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Промокод клиента:</span>
            <code style={codeStyle}>{customer.inviteCode}</code>
            <span style={{ fontSize: 13, opacity: 0.65 }}>
              Ссылка: https://t.me/loyalty_bot?start=ref_{customer.inviteCode}
            </span>
          </div>
          {customer.invited.length === 0 ? (
            <div style={{ opacity: 0.6 }}>По этому промокоду ещё никто не зарегистрировался.</div>
          ) : (
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
                {customer.invited.map((invitee) => (
                  <tr key={invitee.id} style={rowStyle}>
                    <td style={cellStyle}>{invitee.name}</td>
                    <td style={cellStyle}>{invitee.login}</td>
                    <td style={cellStyle}>{formatDate(invitee.joinedAt)}</td>
                    <td style={cellStyle}>{invitee.purchases ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {accrueOpen && (
        <AccrueModal customer={customer} onClose={() => setAccrueOpen(false)} onSuccess={handleAccrueSuccess} />
      )}

      {redeemOpen && (
        <RedeemModal customer={customer} onClose={() => setRedeemOpen(false)} onSuccess={handleRedeemSuccess} />
      )}

      {selectedTransaction && (
        <TransactionModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} customer={customer} />
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

function calculateAge(birthday: string): number {
  try {
    const date = new Date(birthday);
    if (Number.isNaN(date.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }
    return age;
  } catch {
    return 0;
  }
}

function normalizeTags(tags: string): string[] {
  return tags
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildProfileRows(customer: CustomerRecord) {
  const genderLabel = customer.gender === "male" ? "Мужской" : customer.gender === "female" ? "Женский" : "Не указан";
  return [
    { label: "Логин", value: customer.login },
    { label: "Имя", value: getFullName(customer) || "—" },
    { label: "Бонусных баллов", value: formatPoints(customer.bonusBalance) },
    { label: "Отложенных баллов", value: formatPoints(customer.pendingBalance) },
    { label: "Пол", value: genderLabel },
    { label: "Возраст", value: customer.age || "—" },
    { label: "Дата рождения", value: formatDate(customer.birthday) },
    { label: "Дней с последнего визита", value: customer.daysSinceLastVisit },
    { label: "Частота визитов", value: `${customer.visitFrequency}` },
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
    { label: "Накопленных штампов", value: customer.stamps },
    { label: "Теги", value: customer.tags.length ? customer.tags.join(", ") : "—" },
    { label: "Дата регистрации", value: formatDateTime(customer.registeredAt) },
    { label: "Комментарий к пользователю", value: customer.comment || "—" },
    { label: "Блокировка начислений", value: customer.blocked ? "Да" : "Нет" },
    { label: "Приглашавший", value: customer.referrer || "—" },
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
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
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    tags: customer.tags.join(", "),
    birthday: customer.birthday,
    group: customer.group,
    blockAccruals: customer.blocked,
    gender: customer.gender,
    comment: customer.comment,
  };
}

type AccrueModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

const AccrueModal: React.FC<AccrueModalProps> = ({ customer, onClose, onSuccess }) => {
  const [form, setForm] = React.useState<AccrueForm>({
    amount: "",
    receipt: "",
    manualPoints: "",
    outletId: outlets[0]?.id ?? "",
    deviceNumber: customer.deviceNumber ?? "",
  });
  const [errors, setErrors] = React.useState<AccrueErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  function update<K extends keyof AccrueForm>(key: K, value: AccrueForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: AccrueErrors = {};
    const amountValue = Number(form.amount.replace(",", "."));
    if (!form.amount.trim()) {
      nextErrors.amount = "Укажите сумму покупки";
    } else if (Number.isNaN(amountValue) || amountValue <= 0) {
      nextErrors.amount = "Сумма должна быть больше 0";
    }

    if (form.manualPoints.trim()) {
      const manualValue = Number(form.manualPoints);
      if (Number.isNaN(manualValue) || manualValue < 0) {
        nextErrors.manualPoints = "Укажите неотрицательное число";
      }
    }

    if (!form.outletId) {
      nextErrors.outletId = "Выберите торговую точку";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    onSuccess("Баллы начислены");
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
              <input style={inputStyle} value={customer.login} disabled />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}># Клиента</span>
              <input style={inputStyle} value={customer.customerNumber} disabled />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}># Устройства</span>
              <input
                style={inputStyle}
                value={form.deviceNumber}
                onChange={(event) => update("deviceNumber", event.target.value)}
                placeholder="Необязательно"
              />
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
              <span style={labelStyle}># чека</span>
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
                style={inputStyle}
                value={form.manualPoints}
                onChange={(event) => update("manualPoints", event.target.value)}
                placeholder="Оставьте пустым для автокалькуляции"
              />
              <span style={{ fontSize: 12, opacity: 0.65 }}>Если поле пустое — система рассчитает баллы автоматически.</span>
              {errors.manualPoints && <ErrorText>{errors.manualPoints}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Торговая точка</span>
              <select
                style={inputStyle}
                value={form.outletId}
                onChange={(event) => update("outletId", event.target.value)}
              >
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
              {errors.outletId && <ErrorText>{errors.outletId}</ErrorText>}
            </label>
          </section>
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
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
};

const RedeemModal: React.FC<RedeemModalProps> = ({ customer, onClose, onSuccess }) => {
  const [form, setForm] = React.useState<RedeemForm>({
    amount: "",
    outletId: outlets[0]?.id ?? "",
    deviceNumber: customer.deviceNumber ?? "",
  });
  const [errors, setErrors] = React.useState<RedeemErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

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

    if (!form.outletId) {
      nextErrors.outletId = "Выберите торговую точку";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    onSuccess("Баллы списаны");
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
              <input style={inputStyle} value={customer.login} disabled />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}># Клиента</span>
              <input style={inputStyle} value={customer.customerNumber} disabled />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}># Устройства</span>
              <input
                style={inputStyle}
                value={form.deviceNumber}
                onChange={(event) => update("deviceNumber", event.target.value)}
                placeholder="Необязательно"
              />
            </label>
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
              >
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
              {errors.outletId && <ErrorText>{errors.outletId}</ErrorText>}
            </label>
          </section>
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
};

type TransactionModalProps = {
  transaction: CustomerTransaction;
  onClose: () => void;
  customer: CustomerRecord;
};

const TransactionModal: React.FC<TransactionModalProps> = ({ transaction, onClose, customer }) => {
  const earned = Math.max(transaction.change, 0);
  const spent = Math.max(-transaction.change, 0);
  return (
    <div style={modalOverlayStyle}>
      <div style={modalStyle} role="dialog" aria-modal="true">
        <ModalHeader
          title={`Транзакция от ${formatDateTime(transaction.datetime)}`}
          subtitle={`Чек №${transaction.receipt}`}
          onClose={onClose}
        />
        <div style={modalBodyStyle}>
          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Основные данные</h4>
            <InfoRow label="Торговая точка" value={transaction.outlet} />
            <InfoRow label="Клиент" value={getFullName(customer) || customer.login} />
            <InfoRow label="Менеджер" value={transaction.manager} />
            <InfoRow label="Носитель" value={`${transaction.carrier}${transaction.carrierCode ? ` • ${transaction.carrierCode}` : ""}`} />
          </section>
          <section style={modalSectionStyle}>
            <h4 style={sectionHeadingStyle}>Баллы и оплата</h4>
            <InfoRow label="Начислено" value={`+${formatPoints(earned)}`} />
            <InfoRow label="Списано" value={`-${formatPoints(spent)}`} />
            <InfoRow label="К оплате" value={formatCurrency(transaction.toPay)} />
            <InfoRow label="Оплачено баллами" value={formatPoints(transaction.paidByPoints)} />
            <InfoRow label="Итог" value={formatCurrency(transaction.total)} />
          </section>
        </div>
        <div style={modalFooterStyle}>
          <Button variant="secondary">Отменить транзакцию</Button>
        </div>
      </div>
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
