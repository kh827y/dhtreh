"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Icons, Skeleton } from "@loyalty/ui";
import {
  normalizeCustomer,
  type CustomerRecord,
  formatPhone,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatVisits,
  calculateAge,
} from "../utils";

const { ChevronLeft, RefreshCw } = Icons;

type PageProps = {
  params: { customerId: string | string[] };
};

export default function CustomerCardPage({ params }: PageProps) {
  const router = useRouter();
  const customerId = Array.isArray(params.customerId) ? params.customerId[0] : params.customerId;
  const [customer, setCustomer] = React.useState<CustomerRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const load = React.useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/customers/${customerId}`);
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Не удалось загрузить клиента");
      }
      const payload = await res.json();
      setCustomer(normalizeCustomer(payload));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Не удалось загрузить клиента");
      setError(message);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, refreshToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!customerId) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Клиент не найден</h1>
        <p style={{ opacity: 0.7 }}>Не удалось определить идентификатор клиента.</p>
        <Link href="/customers" style={linkStyle}>
          ← Вернуться к списку
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Button variant="secondary" onClick={() => router.push("/customers")} leftIcon={<ChevronLeft size={16} />}>Назад</Button>
        </div>
        <Skeleton height={120} radius={16} />
        <Skeleton height={220} radius={16} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Button variant="secondary" onClick={() => router.push("/customers")} leftIcon={<ChevronLeft size={16} />}>Назад</Button>
          <Button variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={() => setRefreshToken((token) => token + 1)}>
            Повторить попытку
          </Button>
        </div>
        <Card>
          <CardBody>
            <div style={errorBlockStyle} role="alert">{error}</div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!customer || !customer.id) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Клиент не найден</h1>
        <p style={{ opacity: 0.7 }}>Запрошенная карточка не найдена или удалена.</p>
        <Link href="/customers" style={linkStyle}>
          ← Вернуться к списку
        </Link>
      </div>
    );
  }

  const age = calculateAge(customer.birthday);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => router.push("/customers")} leftIcon={<ChevronLeft size={16} />}>
            Назад
          </Button>
          <Button variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={() => setRefreshToken((token) => token + 1)}>
            Обновить данные
          </Button>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{customer.name?.trim() || formatPhone(customer.phone)}</div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>{formatPhone(customer.phone)} • {customer.email || "Email не указан"}</div>
        </div>
      </div>

      <Card>
        <CardHeader title="Основная информация" />
        <CardBody>
          <InfoGrid>
            <InfoRow label="Телефон" value={formatPhone(customer.phone)} />
            <InfoRow label="Email" value={customer.email || "—"} />
            <InfoRow label="Пол" value={formatGender(customer.gender)} />
            <InfoRow label="Возраст" value={age != null ? `${age}` : "—"} />
            <InfoRow label="Дата рождения" value={formatDate(customer.birthday)} />
            <InfoRow label="Дата регистрации" value={formatDate(customer.createdAt)} />
          </InfoGrid>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Теги</div>
            <TagsList tags={customer.tags} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Статистика" subtitle="Данные собираются по всем операциям клиента" />
        <CardBody>
          <InfoGrid>
            <InfoRow label="Всего визитов" value={formatVisits(customer.stats)} />
            <InfoRow label="Суммарные траты" value={formatCurrency(customer.stats?.totalSpent)} />
            <InfoRow label="Средний чек" value={formatCurrency(customer.stats?.avgCheck)} />
            <InfoRow label="Последняя покупка" value={formatDateTime(customer.stats?.lastOrderAt)} />
            <InfoRow label="RFM-класс" value={customer.stats?.rfmClass || "—"} />
          </InfoGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Сегменты" subtitle="Клиент участвует в следующих аудиториях" />
        <CardBody>
          {customer.segments?.length ? (
            <ul style={{ display: "grid", gap: 8, padding: 0, margin: 0, listStyle: "none" }}>
              {customer.segments.map((segment) => (
                <li key={segment.id} style={segmentItemStyle}>
                  <span>{segment.name || segment.id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ opacity: 0.65 }}>Сегменты не назначены.</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

type InfoRowProps = { label: string; value: React.ReactNode };

const InfoGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>{children}</div>
);

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <span style={{ fontSize: 12, opacity: 0.6 }}>{label}</span>
    <span style={{ fontSize: 15 }}>{value}</span>
  </div>
);

type TagsListProps = { tags?: string[] | null };

const TagsList: React.FC<TagsListProps> = ({ tags }) => {
  if (!tags?.length) {
    return <span style={{ fontSize: 14 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {tags.map((tag) => (
        <span key={tag} style={tagStyle}>
          {tag}
        </span>
      ))}
    </div>
  );
};

function formatGender(gender?: string | null): string {
  if (!gender) return "—";
  const normalized = gender.toLowerCase();
  if (normalized === "male" || normalized === "m") return "Мужской";
  if (normalized === "female" || normalized === "f") return "Женский";
  return "—";
}

const linkStyle: React.CSSProperties = {
  color: "#a5b4fc",
  textDecoration: "none",
};

const tagStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(129, 140, 248, 0.16)",
  color: "#c7d2fe",
  fontSize: 13,
};

const segmentItemStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(15,23,42,0.35)",
};

const errorBlockStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.4)",
  background: "rgba(248,113,113,0.12)",
  color: "#fecaca",
};
