"use client";

import React from "react";
import { Card, CardHeader, CardBody, Skeleton, Button } from "@loyalty/ui";

type TopRef = { rank: number; name: string; customerId: string; invited: number };
type Resp = { registeredViaReferral: number; purchasedViaReferral: number; referralRevenue: number; topReferrers: TopRef[] };

type PeriodPreset = "yesterday" | "week" | "month" | "quarter" | "year" | "custom";

const presetOptions: Array<{ value: Exclude<PeriodPreset, "custom">; label: string }> = [
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

export default function AnalyticsReferralsPage() {
  const [preset, setPreset] = React.useState<PeriodPreset>("month");
  const [customDraft, setCustomDraft] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const [customApplied, setCustomApplied] = React.useState<{ from: string; to: string } | null>(null);
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const integerFormatter = React.useMemo(() => new Intl.NumberFormat("ru-RU"), []);
  const currencyFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
    [],
  );

  const handlePresetChange = React.useCallback((value: Exclude<PeriodPreset, "custom">) => {
    setPreset(value);
    setCustomApplied(null);
    setMsg("");
  }, []);

  const applyCustomRange = React.useCallback(() => {
    if (!customDraft.from || !customDraft.to) {
      setMsg("Укажите даты начала и окончания периода");
      return;
    }
    const fromDate = new Date(customDraft.from);
    const toDate = new Date(customDraft.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setMsg("Некорректные даты периода");
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setMsg("Дата начала не может быть позже даты окончания");
      return;
    }
    setCustomApplied({ from: customDraft.from, to: customDraft.to });
    setPreset("custom");
    setMsg("");
  }, [customDraft]);

  React.useEffect(() => {
    if (preset === "custom" && !customApplied) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const params = new URLSearchParams();
        if (preset === "custom" && customApplied) {
          params.set("from", customApplied.from);
          params.set("to", customApplied.to);
        } else {
          params.set("period", preset);
        }
        const query = params.toString();
        const res = await fetch(`/api/portal/analytics/referral${query ? `?${query}` : ""}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Ошибка загрузки");
        if (!cancelled) setData(json);
      } catch (error: any) {
        if (!cancelled && error?.name !== "AbortError") {
          setMsg(String(error?.message || error));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [preset, customApplied]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Реферальная программа</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Результаты привлечения клиентов через рекомендации</div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presetOptions.map((item) => (
              <Button
                key={item.value}
                variant={preset === item.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => handlePresetChange(item.value)}
                disabled={loading && preset === item.value}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>Произвольный период</span>
            <input
              type="date"
              value={customDraft.from}
              onChange={(event) => setCustomDraft((prev) => ({ ...prev, from: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
            <input
              type="date"
              value={customDraft.to}
              onChange={(event) => setCustomDraft((prev) => ({ ...prev, to: event.target.value }))}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.35)",
                color: "#e2e8f0",
              }}
            />
            <Button
              variant={preset === "custom" ? "primary" : "secondary"}
              size="sm"
              onClick={applyCustomRange}
              disabled={loading || !customDraft.from || !customDraft.to}
            >
              Применить
            </Button>
          </div>
          <Button variant="secondary" onClick={() => (window.location.href = "/referrals/program")}>Настроить</Button>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <MetricCard
          title="Зарегистрировано"
          subtitle="новых клиентов по реферальной программе"
          value={data ? integerFormatter.format(data.registeredViaReferral) : "—"}
        />
        <MetricCard
          title="Совершили первую покупку"
          subtitle="по реферальной программе"
          value={data ? integerFormatter.format(data.purchasedViaReferral) : "—"}
        />
        <MetricCard
          title="Выручки сгенерировано"
          subtitle="от приглашённых за выбранный период клиентов"
          value={data ? currencyFormatter.format(data.referralRevenue) : "—"}
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

const MetricCard: React.FC<{ title: string; subtitle: string; value: string }> = ({ title, subtitle, value }) => (
  <Card>
    <CardBody>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{subtitle}</div>
    </CardBody>
  </Card>
);
