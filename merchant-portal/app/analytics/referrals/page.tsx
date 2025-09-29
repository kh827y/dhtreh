"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton, Button } from "@loyalty/ui";

type TopRef = { rank: number; name: string; customerId: string; invited: number };
type Resp = { registeredViaReferral: number; purchasedViaReferral: number; referralRevenue: number; topReferrers: TopRef[] };

type FilterOption = { value: string; label: string };

const periodOptions: FilterOption[] = [
  { value: "7d", label: "Последние 7 дней" },
  { value: "30d", label: "Последние 30 дней" },
  { value: "90d", label: "Последние 90 дней" },
  { value: "custom", label: "Календарные периоды" },
];

type QuickRangeValue = "yesterday" | "week" | "month" | "quarter" | "year";

const quickRanges: Array<{ value: QuickRangeValue; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Текущая неделя" },
  { value: "month", label: "Текущий месяц" },
  { value: "quarter", label: "Текущий квартал" },
  { value: "year", label: "Текущий год" },
];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function buildQuery(period: FilterOption, range: QuickRangeValue) {
  const params = new URLSearchParams();
  const today = new Date();
  if (period.value === "custom") {
    if (range === "yesterday") {
      const from = startOfDay(new Date(today));
      from.setDate(from.getDate() - 1);
      const to = endOfDay(new Date(from));
      params.set("from", from.toISOString());
      params.set("to", to.toISOString());
    } else {
      const mapping: Record<Exclude<QuickRangeValue, "yesterday">, string> = {
        week: "week",
        month: "month",
        quarter: "quarter",
        year: "year",
      };
      const value = mapping[range as Exclude<QuickRangeValue, "yesterday">];
      if (value) {
        params.set("period", value);
      }
    }
  } else {
    const days = period.value === "7d" ? 7 : period.value === "90d" ? 90 : 30;
    const to = endOfDay(today);
    const from = startOfDay(new Date(today));
    from.setDate(from.getDate() - (days - 1));
    params.set("from", from.toISOString());
    params.set("to", to.toISOString());
  }
  return params;
}

export default function AnalyticsReferralsPage() {
  const [period, setPeriod] = React.useState<FilterOption>(periodOptions[1]);
  const [range, setRange] = React.useState<QuickRangeValue>("week");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const params = buildQuery(period, range);
        const query = params.toString();
        const res = await fetch(`/api/portal/analytics/referral${query ? `?${query}` : ""}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled) {
          setMsg(String(error?.message || error));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, range]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Реферальная программа</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Результаты привлечения клиентов через рекомендации</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Период</span>
            <select
              value={period.value}
              onChange={(event) => {
                const next = periodOptions.find((item) => item.value === event.target.value) || periodOptions[0];
                setPeriod(next);
              }}
              style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.35)", color: "#e2e8f0" }}
            >
              {periodOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quickRanges.map((item) => (
              <Button
                key={item.value}
                variant={range === item.value && period.value === "custom" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setPeriod(periodOptions.find((option) => option.value === "custom") || periodOptions[0]);
                  setRange(item.value);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => (window.location.href = "/referrals/program")}>Настроить</Button>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <MetricCard title="Зарегистрировано" value={data ? data.registeredViaReferral.toLocaleString("ru-RU") : "—"} />
        <MetricCard title="Совершили покупку" value={data ? data.purchasedViaReferral.toLocaleString("ru-RU") : "—"} />
        <MetricCard
          title="Выручки сгенерировано"
          value={data ? `${Math.round(data.referralRevenue).toLocaleString("ru-RU")} ₽` : "—"}
        />
      </section>

      <Card>
        <CardHeader title="Пользователи, пригласившие больше всех за период" subtitle="Рейтинг по количеству приглашённых" />
        <CardBody>
          {loading ? (
            <Skeleton height={280} />
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 140px", fontSize: 12, opacity: 0.7 }}>
                <div>№</div>
                <div>Имя/Ник</div>
                <div>Приглашено</div>
              </div>
              {(data?.topReferrers || []).map((row) => (
                <div
                  key={row.customerId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 140px",
                    padding: "8px 0",
                    borderBottom: "1px solid rgba(148,163,184,0.15)",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>#{row.rank}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.name || row.customerId}</div>
                    <div style={{ opacity: 0.6, fontSize: 12 }}>{row.customerId}</div>
                  </div>
                  <div>{row.invited.toLocaleString("ru-RU")}</div>
                </div>
              ))}
              {!data?.topReferrers?.length && <div style={{ opacity: 0.7 }}>Нет данных</div>}
              {msg && <div style={{ color: "#f87171" }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const MetricCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <Card>
    <CardBody>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </CardBody>
  </Card>
);
