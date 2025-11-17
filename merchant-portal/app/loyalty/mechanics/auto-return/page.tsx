"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardBody, Skeleton, Chart } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";
import { ChartGroup, formatBucketLabel, groupAttemptsTimeline, groupRevenueTimeline, groupRfmReturnsTimeline } from "./stats-utils";

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
  period: { from: string; to: string; type: string; thresholdDays: number; giftPoints: number; giftTtlDays: number; giftBurnEnabled: boolean };
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
    rfmReturns: Array<{ date: string; segment: string; returned: number }>;
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
  const [customRangeDraft, setCustomRangeDraft] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const [appliedCustom, setAppliedCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [stats, setStats] = React.useState<AutoReturnStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [timelineGroup, setTimelineGroup] = React.useState<ChartGroup>("day");
  const [rfmGroup, setRfmGroup] = React.useState<ChartGroup>("day");
  const [revenueGroup, setRevenueGroup] = React.useState<ChartGroup>("day");

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
  }, [appliedCustom, range.value, selectedOutlet.value]);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  const summaryItems = React.useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: "Выслано приглашений",
        description: "Отправлено Push-уведомлений",
        value: formatNumber(stats.summary.invitations),
      },
      {
        title: "Вернулось",
        description: "Совершивших покупку после приглашения",
        value: formatNumber(stats.summary.returned),
      },
      {
        title: "Конверсия в покупку",
        description: "Процент клиентов, которые совершили покупку после приглашения",
        value: formatPercent(stats.summary.conversion),
      },
      {
        title: "Затраты на баллы",
        description: "Подарочных баллов было потрачено",
        value: formatNumber(stats.summary.pointsCost),
      },
      {
        title: "Выручка первых покупок",
        description: "За вычетом потраченных баллов",
        value: formatCurrency(stats.summary.firstPurchaseRevenue),
      },
    ];
  }, [stats]);

  const distanceItems = React.useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: "Клиентов",
        description: "Совершивших покупку после возврата",
        value: formatNumber(stats.distance.customers),
      },
      {
        title: "Покупок после возврата",
        description: "Среднее количество покупок после возврата на клиента",
        value: formatDecimal(stats.distance.purchasesPerCustomer),
      },
      {
        title: "Средний чек",
        description: "Средняя сумма всех покупок вернувшихся клиентов",
        value: formatCurrency(stats.distance.averageCheck),
      },
      {
        title: "Количество покупок",
        description: "Совершено вернувшимися клиентами за период",
        value: formatNumber(stats.distance.purchasesCount),
      },
      {
        title: "Сумма покупок",
        description: "Возвращенных клиентов за период",
        value: formatCurrency(stats.distance.totalAmount),
      },
    ];
  }, [stats]);

  const attemptsData = React.useMemo(
    () => groupAttemptsTimeline(stats?.trends.attempts ?? [], timelineGroup),
    [stats?.trends.attempts, timelineGroup],
  );
  const rfmData = React.useMemo(
    () => groupRfmReturnsTimeline(stats?.trends.rfmReturns ?? [], rfmGroup),
    [stats?.trends.rfmReturns, rfmGroup],
  );
  const revenueData = React.useMemo(
    () => groupRevenueTimeline(stats?.trends.revenue ?? [], revenueGroup),
    [stats?.trends.revenue, revenueGroup],
  );

  const rfmSegments = React.useMemo(() => {
    const set = new Set<string>();
    (stats?.rfm ?? []).forEach(row => set.add(row.segment));
    rfmData.forEach(row => set.add(row.segment));
    return Array.from(set);
  }, [rfmData, stats?.rfm]);

  const attemptsOption = React.useMemo(() => {
    if (!attemptsData.length) return null;
    const categories = attemptsData.map(item => item.bucket);
    const invites = attemptsData.map(item => item.invitations);
    const returns = attemptsData.map(item => item.returns);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Попыток возврата", "Вернулись"] },
      grid: { left: 28, right: 16, top: 30, bottom: 40 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { formatter: (value: string) => formatBucketLabel(value, timelineGroup) },
      },
      yAxis: { type: "value" },
      series: [
        { name: "Попыток возврата", type: "line", data: invites, smooth: true },
        { name: "Вернулись", type: "line", data: returns, smooth: true },
      ],
    } as const;
  }, [attemptsData, timelineGroup]);

  const rfmOption = React.useMemo(() => {
    if (!rfmData.length || !rfmSegments.length) return null;
    const categories = Array.from(new Set(rfmData.map(item => item.bucket))).sort((a, b) => a.localeCompare(b));
    const values = new Map<string, number>();
    for (const row of rfmData) {
      values.set(`${row.bucket}|${row.segment}`, (values.get(`${row.bucket}|${row.segment}`) ?? 0) + row.returned);
    }
    const series = rfmSegments.map(segment => ({
      name: segment,
      type: "bar",
      stack: "returns",
      data: categories.map(bucket => values.get(`${bucket}|${segment}`) ?? 0),
    }));
    return {
      tooltip: { trigger: "axis" },
      legend: { data: rfmSegments },
      grid: { left: 40, right: 16, top: 30, bottom: 60 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { interval: 0, rotate: 20, formatter: (value: string) => formatBucketLabel(value, rfmGroup) },
      },
      yAxis: { type: "value" },
      series,
    } as const;
  }, [rfmData, rfmGroup, rfmSegments]);

  const revenueOption = React.useMemo(() => {
    if (!revenueData.length) return null;
    const categories = revenueData.map(item => item.bucket);
    const totals = revenueData.map(item => Math.max(0, Math.round(item.total / 100)));
    const firsts = revenueData.map(item => Math.max(0, Math.round(item.firstPurchases / 100)));
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Выручка всех вернувшихся клиентов", "Выручка первых покупок"] },
      grid: { left: 32, right: 16, top: 30, bottom: 40 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: { formatter: (value: string) => formatBucketLabel(value, revenueGroup) },
      },
      yAxis: { type: "value", axisLabel: { formatter: (val: number) => `${val} ₽` } },
      series: [
        { name: "Выручка всех вернувшихся клиентов", type: "line", data: totals, smooth: true, areaStyle: {} },
        { name: "Выручка первых покупок", type: "line", data: firsts, smooth: true },
      ],
    } as const;
  }, [revenueData, revenueGroup]);

  const canApplyCustom =
    Boolean(customRangeDraft.from) &&
    Boolean(customRangeDraft.to) &&
    !Number.isNaN(new Date(customRangeDraft.from).getTime()) &&
    !Number.isNaN(new Date(customRangeDraft.to).getTime()) &&
    customRangeDraft.from <= customRangeDraft.to;

  const applyCustomRange = React.useCallback(() => {
    if (!canApplyCustom) return;
    setAppliedCustom({ ...customRangeDraft });
  }, [canApplyCustom, customRangeDraft]);

  const resetCustomRange = React.useCallback(() => {
    setCustomRangeDraft({ from: "", to: "" });
    setAppliedCustom(null);
  }, []);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "center" }}>
            <select
              value={selectedOutlet.value}
              onChange={event => {
                const value = event.target.value;
                const option = outlets.find(item => item.value === value) ?? outlets[0];
                setSelectedOutlet(option);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.6)",
                color: "#e2e8f0",
              }}
            >
              {outlets.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

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
                    border:
                      range.value === item.value && !appliedCustom
                        ? "1px solid transparent"
                        : "1px solid rgba(148,163,184,0.35)",
                    background:
                      range.value === item.value && !appliedCustom
                        ? "var(--brand-primary)"
                        : "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  flex: 1,
                  minWidth: 220,
                }}
              >
                <input
                  type="date"
                  value={customRangeDraft.from}
                  onChange={event =>
                    setCustomRangeDraft(prev => ({
                      ...prev,
                      from: event.target.value,
                      to: prev.to && event.target.value && prev.to < event.target.value ? event.target.value : prev.to,
                    }))
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#e2e8f0",
                    padding: "6px 4px",
                    flex: 1,
                  }}
                />
                <span style={{ opacity: 0.6 }}>—</span>
                <input
                  type="date"
                  value={customRangeDraft.to}
                  onChange={event =>
                    setCustomRangeDraft(prev => ({
                      ...prev,
                      to: event.target.value,
                      from: prev.from && event.target.value && event.target.value < prev.from ? event.target.value : prev.from,
                    }))
                  }
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#e2e8f0",
                    padding: "6px 4px",
                    flex: 1,
                  }}
                />
              </div>
              <Button type="button" variant="secondary" onClick={applyCustomRange} disabled={!canApplyCustom || loading}>
                Применить
              </Button>
              {appliedCustom && (
                <Button type="button" variant="secondary" onClick={resetCustomRange} disabled={loading}>
                  Сбросить
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>В момент возврата</div>
          <KpiGrid items={summaryItems} loading={loading} />
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>На дистанции</div>
          <KpiGrid items={distanceItems} loading={loading} />
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>По RFM-группам</div>
          {loading ? (
            <Skeleton height={200} />
          ) : stats?.rfm.length ? (
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
              </tbody>
            </table>
          ) : (
            <Placeholder>Нет данных</Placeholder>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Возвраты и покупки</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Попытки возврата и первые покупки</div>
            </div>
            <GroupChips value={timelineGroup} onChange={setTimelineGroup} />
          </div>
          {loading ? (
            <Skeleton height={240} />
          ) : attemptsOption && attemptsData.length ? (
            <Chart option={attemptsOption as any} height={240} />
          ) : (
            <Placeholder>Нет данных</Placeholder>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Вернувшиеся по RFM группам</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>По дням, неделям или месяцам</div>
            </div>
            <GroupChips value={rfmGroup} onChange={setRfmGroup} />
          </div>
          {loading ? (
            <Skeleton height={240} />
          ) : rfmOption && rfmData.length ? (
            <Chart option={rfmOption as any} height={240} />
          ) : (
            <Placeholder>Нет данных</Placeholder>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Общая выручка</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Выручка всех вернувшихся клиентов и первых покупок</div>
            </div>
            <GroupChips value={revenueGroup} onChange={setRevenueGroup} />
          </div>
          {loading ? (
            <Skeleton height={240} />
          ) : revenueOption && revenueData.length ? (
            <Chart option={revenueOption as any} height={240} />
          ) : (
            <Placeholder>Нет данных</Placeholder>
          )}
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

function GroupChips({ value, onChange }: { value: ChartGroup; onChange: (value: ChartGroup) => void }) {
  const items: { value: ChartGroup; label: string }[] = [
    { value: "day", label: "По дням" },
    { value: "week", label: "По неделям" },
    { value: "month", label: "По месяцам" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
      <span style={{ opacity: 0.75 }}>Детализация:</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {items.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: value === item.value ? "1px solid transparent" : "1px solid rgba(148,163,184,0.35)",
              background: value === item.value ? "var(--brand-primary)" : "rgba(15,23,42,0.6)",
              color: "#e2e8f0",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function KpiGrid({ items, loading }: { items: { title: string; description: string; value: string }[]; loading: boolean }) {
  if (loading) {
    return <Skeleton height={160} />;
  }
  if (!items.length) {
    return <Placeholder>Нет данных</Placeholder>;
  }
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
      {items.map(item => (
        <div
          key={item.title}
          style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(148,163,184,0.08)", display: "grid", gap: 6 }}
        >
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>{item.title}</span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{item.description}</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{item.value}</span>
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
      padding: 16,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("ru-RU") : "0";
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "0 ₽";
  return `${formatNumber(Math.round(value / 100))} ₽`;
}
