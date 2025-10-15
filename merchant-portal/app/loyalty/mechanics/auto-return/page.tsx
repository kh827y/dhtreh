"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardBody, Skeleton, Chart } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

const quickRanges = [
  { label: "Вчера", value: "day" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Квартал", value: "quarter" },
  { label: "Год", value: "year" },
] as const;

type QuickRange = (typeof quickRanges)[number];

type OutletOption = { value: string; label: string };

type AutoReturnStats = {
  period: { from: string; to: string; type: string; thresholdDays: number; giftPoints: number };
  summary: {
    invitations: number;
    returned: number;
    conversion: number;
    pointsCost: number;
    firstPurchaseRevenue: number;
  };
  distance: {
    customers: number;
    purchasesPerCustomer: number;
    purchasesCount: number;
    totalAmount: number;
    averageCheck: number;
  };
  rfm: Array<{ segment: string; invitations: number; returned: number }>;
  trends: {
    attempts: Array<{ date: string; invitations: number; returns: number }>;
    revenue: Array<{ date: string; total: number; firstPurchases: number }>;
  };
};

type Banner = { type: "success" | "error"; text: string };

export default function AutoReturnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "stats" ? "stats" : "main";
  const [tab, setTab] = React.useState<"main" | "stats">(initialTab);

  React.useEffect(() => {
    const next = searchParams.get("tab") === "stats" ? "stats" : "main";
    setTab(next);
  }, [searchParams]);

  const handleTabChange = React.useCallback((next: "main" | "stats") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "stats") {
      params.set("tab", "stats");
    } else {
      params.delete("tab");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
    setTab(next);
  }, [router, searchParams]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>
          Механики
        </a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Автовозврат клиентов</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Автовозврат клиентов</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Возвращайте неактивных клиентов через уведомления и подарочные баллы
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(148,163,184,0.2)", flexWrap: "wrap" }}>
        <TabButton active={tab === "main"} onClick={() => handleTabChange("main")}>Основное</TabButton>
        <TabButton active={tab === "stats"} onClick={() => handleTabChange("stats")}>Статистика</TabButton>
      </div>

      {tab === "main" ? <SettingsTab /> : <StatisticsTab />}
    </div>
  );
}

type SettingsState = {
  loading: boolean;
  saving: boolean;
  error: string;
  banner: Banner | null;
  enabled: boolean;
  days: string;
  text: string;
  giftEnabled: boolean;
  giftPoints: string;
  giftBurnEnabled: boolean;
  giftTtlDays: string;
  repeatEnabled: boolean;
  repeatDays: string;
};

function SettingsTab() {
  const [state, setState] = React.useState<SettingsState>({
    loading: true,
    saving: false,
    error: "",
    banner: null,
    enabled: false,
    days: "45",
    text: "Мы скучаем! Возвращайтесь и получите 200 бонусов на покупки.",
    giftEnabled: true,
    giftPoints: "200",
    giftBurnEnabled: true,
    giftTtlDays: "30",
    repeatEnabled: false,
    repeatDays: "14",
  });

  const load = React.useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch("/api/portal/loyalty/auto-return");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить настройки");
      }
      setState(prev => ({
        ...prev,
        loading: false,
        enabled: Boolean(json?.enabled),
        days: String(Number(json?.days ?? 45) || 45),
        text: typeof json?.text === "string" ? json.text : prev.text,
        giftEnabled: Boolean(json?.giftEnabled),
        giftPoints: String(Number(json?.giftPoints ?? 0) || 0),
        giftBurnEnabled: Boolean(json?.giftBurnEnabled),
        giftTtlDays: String(Number(json?.giftTtlDays ?? 0) || 0),
        repeatEnabled: Boolean(json?.repeatEnabled),
        repeatDays: String(Number(json?.repeatDays ?? 0) || 0),
      }));
    } catch (error: any) {
      setState(prev => ({ ...prev, loading: false, error: String(error?.message || error || "Ошибка загрузки") }));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const charsLeft = Math.max(0, 300 - state.text.length);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.saving) return;

    const payload = {
      enabled: state.enabled,
      days: Number(state.days) || 0,
      text: state.text,
      giftEnabled: state.giftEnabled,
      giftPoints: Number(state.giftPoints) || 0,
      giftBurnEnabled: state.giftEnabled ? state.giftBurnEnabled : false,
      giftTtlDays: Number(state.giftTtlDays) || 0,
      repeatEnabled: state.repeatEnabled,
      repeatDays: Number(state.repeatDays) || 0,
    };

    setState(prev => ({ ...prev, saving: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/auto-return", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось сохранить настройки");
      }
      setState(prev => ({ ...prev, saving: false, banner: { type: "success", text: "Настройки сохранены" } }));
      load();
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        saving: false,
        error: String(error?.message || error || "Не удалось сохранить настройки"),
      }));
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardBody>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Настройте условия для автоматического возврата клиентов: через сколько дней отправлять уведомление,
            какой текст использовать и выдавать ли подарочные баллы. Уведомления отправляются через Telegram-бота,
            подключённого в настройках мерчанта.
          </div>
        </CardBody>
      </Card>

      {state.banner && (
        <div
          style={{
            borderRadius: 12,
            padding: "12px 16px",
            border: `1px solid ${state.banner.type === "success" ? "rgba(34,197,94,.35)" : "rgba(248,113,113,.35)"}`,
            background: state.banner.type === "success" ? "rgba(34,197,94,.15)" : "rgba(248,113,113,.16)",
            color: state.banner.type === "success" ? "#4ade80" : "#f87171",
          }}
        >
          {state.banner.text}
        </div>
      )}

      {state.error && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", padding: "12px 16px", color: "#f87171" }}>
          {state.error}
        </div>
      )}

      <Card>
        <CardBody>
          {state.loading ? (
            <Skeleton height={260} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <Toggle
                  checked={state.enabled}
                  onChange={enabled => setState(prev => ({ ...prev, enabled }))}
                  label={state.enabled ? "Сценарий включен" : "Сценарий выключен"}
                  disabled={state.saving}
                />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Клиенты с последней покупкой старше указанного порога получают уведомление в мини-приложении Telegram.
                </span>
              </div>

              <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                <span>Через сколько дней попытаться вернуть клиента</span>
                <input
                  type="number"
                  min="1"
                  value={state.days}
                  onChange={event => setState(prev => ({ ...prev, days: event.target.value }))}
                  disabled={state.saving}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Текст push-рассылки</span>
                <textarea
                  value={state.text}
                  maxLength={300}
                  onChange={event => setState(prev => ({ ...prev, text: event.target.value }))}
                  rows={4}
                  disabled={state.saving}
                  style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                  <span>Осталось символов: {charsLeft}</span>
                  <span>Плейсхолдеры: %username%, %bonus%</span>
                </div>
              </label>

              <section style={{ display: "grid", gap: 16 }}>
                <Toggle
                  checked={state.giftEnabled}
                  onChange={giftEnabled => setState(prev => ({ ...prev, giftEnabled }))}
                  label="Подарить баллы клиенту"
                  disabled={state.saving}
                />
                {state.giftEnabled && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Сколько баллов подарить клиенту</span>
                    <input
                      type="number"
                      min="0"
                      value={state.giftPoints}
                      onChange={event => setState(prev => ({ ...prev, giftPoints: event.target.value }))}
                      disabled={state.saving}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                    />
                  </label>
                )}
              </section>

              {state.giftEnabled && (
                <section style={{ display: "grid", gap: 16 }}>
                  <Toggle
                    checked={state.giftBurnEnabled}
                    onChange={giftBurnEnabled => setState(prev => ({ ...prev, giftBurnEnabled }))}
                    label="Сделать подарочные баллы сгораемыми"
                    disabled={state.saving}
                  />
                  {state.giftBurnEnabled && (
                    <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                      <span>Через сколько дней баллы сгорят</span>
                      <input
                        type="number"
                        min="1"
                        value={state.giftTtlDays}
                        onChange={event => setState(prev => ({ ...prev, giftTtlDays: event.target.value }))}
                        disabled={state.saving}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                      />
                    </label>
                  )}
                </section>
              )}

              <section style={{ display: "grid", gap: 16 }}>
                <Toggle
                  checked={state.repeatEnabled}
                  onChange={repeatEnabled => setState(prev => ({ ...prev, repeatEnabled }))}
                  label="Повторять попытку возврата"
                  disabled={state.saving}
                />
                {state.repeatEnabled && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Через сколько дней повторить попытку вернуть клиента</span>
                    <input
                      type="number"
                      min="1"
                      value={state.repeatDays}
                      onChange={event => setState(prev => ({ ...prev, repeatDays: event.target.value }))}
                      disabled={state.saving}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                    />
                  </label>
                )}
              </section>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <Button type="button" variant="secondary" onClick={load} disabled={state.saving}>
                  Сбросить
                </Button>
                <Button type="submit" variant="primary" disabled={state.saving}>
                  {state.saving ? "Сохраняем…" : "Сохранить"}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatisticsTab() {
  const [outlets, setOutlets] = React.useState<OutletOption[]>([
    { value: "all", label: "Все торговые точки" },
  ]);
  const [selectedOutlet, setSelectedOutlet] = React.useState<OutletOption>(outlets[0]);
  const [range, setRange] = React.useState<QuickRange>(quickRanges[2]);
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");
  const [appliedCustom, setAppliedCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [stats, setStats] = React.useState<AutoReturnStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/outlets?status=active");
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.items)) {
          const items = json.items as Array<{ id: string; name: string }>;
          setOutlets([{ value: "all", label: "Все торговые точки" }, ...items.map(item => ({ value: item.id, label: item.name }))]);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    setSelectedOutlet(prev => {
      const match = outlets.find(item => item.value === prev.value);
      return match ?? outlets[0] ?? prev;
    });
  }, [outlets]);

  const loadStats = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (appliedCustom) {
        params.set("from", appliedCustom.from);
        params.set("to", appliedCustom.to);
      } else {
        params.set("period", range.value);
      }
      if (selectedOutlet.value !== "all") {
        params.set("outletId", selectedOutlet.value);
      }
      const url = `/api/portal/analytics/auto-return${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить статистику");
      }
      setStats(json as AutoReturnStats);
    } catch (err: any) {
      setError(String(err?.message || err || "Ошибка загрузки"));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [appliedCustom, range, selectedOutlet]);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  const attemptsOption = React.useMemo(() => {
    if (!stats) return null;
    const categories = stats.trends.attempts.map(item => item.date);
    const invites = stats.trends.attempts.map(item => item.invitations);
    const returns = stats.trends.attempts.map(item => item.returns);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Приглашения", "Возвраты"] },
      grid: { left: 28, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value" },
      series: [
        { name: "Приглашения", type: "line", data: invites, smooth: true },
        { name: "Возвраты", type: "line", data: returns, smooth: true },
      ],
    } as const;
  }, [stats]);

  const rfmOption = React.useMemo(() => {
    if (!stats) return null;
    const categories = stats.rfm.map(item => item.segment);
    const values = stats.rfm.map(item => item.returned);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 16, top: 30, bottom: 80 },
      xAxis: { type: "category", data: categories, axisLabel: { interval: 0, rotate: 20 } },
      yAxis: { type: "value" },
      series: [
        { name: "Вернувшиеся", type: "bar", data: values, itemStyle: { borderRadius: 6, color: "#34d399" } },
      ],
    } as const;
  }, [stats]);

  const revenueOption = React.useMemo(() => {
    if (!stats) return null;
    const categories = stats.trends.revenue.map(item => item.date);
    const totals = stats.trends.revenue.map(item => item.total);
    const firsts = stats.trends.revenue.map(item => item.firstPurchases);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Все покупки", "Первые покупки"] },
      grid: { left: 32, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value" },
      series: [
        { name: "Все покупки", type: "line", data: totals, smooth: true, areaStyle: {} },
        { name: "Первые покупки", type: "line", data: firsts, smooth: true },
      ],
    } as const;
  }, [stats]);

  const summaryItems = [
    { label: "Выслано приглашений", value: stats ? formatNumber(stats.summary.invitations) : "—" },
    { label: "Вернулось", value: stats ? formatNumber(stats.summary.returned) : "—" },
    {
      label: "Конверсия в покупку",
      value: stats ? `${stats.summary.conversion.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—",
    },
    { label: "Затраты на баллы", value: stats ? formatNumber(stats.summary.pointsCost) : "—" },
    { label: "Выручка первых покупок", value: stats ? formatNumber(stats.summary.firstPurchaseRevenue) : "—" },
  ];

  const distanceItems = [
    { label: "Клиентов", value: stats ? formatNumber(stats.distance.customers) : "—" },
    {
      label: "Покупок на клиента",
      value: stats
        ? stats.distance.purchasesPerCustomer.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : "—",
    },
    { label: "Количество покупок", value: stats ? formatNumber(stats.distance.purchasesCount) : "—" },
    { label: "Сумма покупок", value: stats ? formatNumber(stats.distance.totalAmount) : "—" },
    {
      label: "Средний чек",
      value: stats
        ? stats.distance.averageCheck.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : "—",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Фильтры</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Торговая точка</span>
              <select
                value={selectedOutlet.value}
                onChange={event => {
                  const value = event.target.value;
                  const option = outlets.find(item => item.value === value) ?? outlets[0];
                  setSelectedOutlet(option);
                }}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              >
                {outlets.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Быстрый период</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickRanges.map(item => (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => {
                      setRange(item);
                      setAppliedCustom(null);
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: range.value === item.value && !appliedCustom ? "1px solid transparent" : "1px solid rgba(148,163,184,0.35)",
                      background: range.value === item.value && !appliedCustom ? "var(--brand-primary)" : "rgba(15,23,42,0.6)",
                      color: "#e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Произвольный интервал</span>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="date"
                  value={customFrom}
                  onChange={event => setCustomFrom(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={event => setCustomTo(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (customFrom && customTo && customFrom <= customTo) {
                      setAppliedCustom({ from: customFrom, to: customTo });
                    }
                  }}
                >
                  Применить
                </Button>
              </div>
            </label>
          </div>
          {appliedCustom && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Выбран интервал с {appliedCustom.from} по {appliedCustom.to}. Чтобы вернуться к быстрым периодам, выберите диапазон выше.
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>KPI «В момент возврата»</div>
          <KpiGrid items={summaryItems} loading={loading} />
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>KPI «На дистанции»</div>
          <KpiGrid items={distanceItems} loading={loading} />
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>По RFM-группам</div>
          {loading ? (
            <Skeleton height={200} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                  <th style={{ padding: "10px 8px" }}>Группа</th>
                  <th style={{ padding: "10px 8px" }}>Выслано приглашений</th>
                  <th style={{ padding: "10px 8px" }}>Вернулось</th>
                </tr>
              </thead>
              <tbody>
                {stats?.rfm.map(row => (
                  <tr key={row.segment} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                    <td style={{ padding: "10px 8px" }}>{row.segment}</td>
                    <td style={{ padding: "10px 8px" }}>{formatNumber(row.invitations)}</td>
                    <td style={{ padding: "10px 8px" }}>{formatNumber(row.returned)}</td>
                  </tr>
                ))}
                {!stats && (
                  <tr>
                    <td colSpan={3} style={{ padding: "10px 8px", opacity: 0.7 }}>
                      Нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Возвраты и покупки</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Сравнение попыток возврата и успешных покупок</div>
            {loading ? (
              <Skeleton height={240} />
            ) : attemptsOption && stats ? (
              <Chart option={attemptsOption as any} height={240} />
            ) : (
              <Placeholder>Нет данных</Placeholder>
            )}
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Вернувшиеся по RFM группам</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Распределение вернувшихся клиентов по сегментам</div>
            {loading ? (
              <Skeleton height={240} />
            ) : rfmOption && stats ? (
              <Chart option={rfmOption as any} height={240} />
            ) : (
              <Placeholder>Нет данных</Placeholder>
            )}
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Общая выручка</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Выручка всех вернувшихся vs. первые покупки</div>
            {loading ? (
              <Skeleton height={240} />
            ) : revenueOption && stats ? (
              <Chart option={revenueOption as any} height={240} />
            ) : (
              <Placeholder>Нет данных</Placeholder>
            )}
          </div>
        </CardBody>
      </Card>

      {error && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", padding: "12px 16px", color: "#f87171" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        padding: "12px 0",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--brand-primary)" : "#e2e8f0",
        borderBottom: active ? "2px solid var(--brand-primary)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function KpiGrid({ items, loading }: { items: { label: string; value: string }[]; loading: boolean }) {
  if (loading) {
    return <Skeleton height={160} />;
  }
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
      {items.map(item => (
        <div
          key={item.label}
          style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(148,163,184,0.08)", display: "grid", gap: 6 }}
        >
          <span style={{ fontSize: 12, opacity: 0.7 }}>{item.label}</span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

const Placeholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      height: 220,
      borderRadius: 16,
      background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(236,72,153,0.12))",
      display: "grid",
      placeItems: "center",
      opacity: 0.6,
      fontSize: 12,
    }}
  >
    {children}
  </div>
);

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("ru-RU") : "0";
}
