"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardBody, Chart, Skeleton } from "@loyalty/ui";
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

type BirthdayStats = {
  period: {
    from: string;
    to: string;
    type: string;
    daysBefore: number;
    onlyBuyers: boolean;
    giftPoints: number;
    giftTtlDays: number;
    purchaseWindowDays: number;
  };
  summary: {
    invitations: number;
    purchasers: number;
    conversion: number;
    pointsIssued: number;
    revenue: number;
    firstPurchaseRevenue: number;
    averageCheck: number;
    customersWithPurchases: number;
  };
  demographics: {
    gender: Array<{ group: string; invitations: number; purchases: number }>;
    age: Array<{ bucket: string; invitations: number; purchases: number }>;
  };
  trends: {
    timeline: Array<{ date: string; invitations: number; purchases: number }>;
    revenue: Array<{ date: string; total: number; firstPurchases: number }>;
  };
};

type Banner = { type: "success" | "error"; text: string };

export default function BirthdayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "stats" ? "stats" : "main";
  const [tab, setTab] = React.useState<"main" | "stats">(initialTab);

  React.useEffect(() => {
    const next = searchParams.get("tab") === "stats" ? "stats" : "main";
    setTab(next);
  }, [searchParams]);

  const handleTabChange = React.useCallback(
    (next: "main" | "stats") => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "stats") {
        params.set("tab", "stats");
      } else {
        params.delete("tab");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
      setTab(next);
    },
    [router, searchParams],
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>
          Механики
        </a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Поздравить клиентов с днём рождения</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Поздравить клиентов с днём рождения</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Автоматические поздравления с подарочными баллами через Telegram-бота
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(148,163,184,0.2)", flexWrap: "wrap" }}>
        <TabButton active={tab === "main"} onClick={() => handleTabChange("main")}>
          Основное
        </TabButton>
        <TabButton active={tab === "stats"} onClick={() => handleTabChange("stats")}>
          Статистика
        </TabButton>
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
  daysBefore: string;
  onlyBuyers: boolean;
  text: string;
  giftEnabled: boolean;
  giftPoints: string;
  giftBurnEnabled: boolean;
  giftTtlDays: string;
};

function SettingsTab() {
  const [state, setState] = React.useState<SettingsState>({
    loading: true,
    saving: false,
    error: "",
    banner: null,
    enabled: false,
    daysBefore: "5",
    onlyBuyers: false,
    text: "С днём рождения! Мы подготовили для вас подарок в любимой кофейне.",
    giftEnabled: false,
    giftPoints: "300",
    giftBurnEnabled: false,
    giftTtlDays: "30",
  });

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/birthday");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить настройки");
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        enabled: Boolean(json?.enabled),
        daysBefore: String(Number(json?.daysBefore ?? json?.days ?? 5) || 5),
        onlyBuyers: Boolean(json?.onlyBuyers),
        text: typeof json?.text === "string" ? json.text : prev.text,
        giftEnabled: Boolean(json?.giftEnabled),
        giftPoints: String(Number(json?.giftPoints ?? 0) || 0),
        giftBurnEnabled: Boolean(json?.giftBurnEnabled),
        giftTtlDays: String(Number(json?.giftTtlDays ?? 0) || 0),
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(error?.message || error || "Ошибка загрузки"),
      }));
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
      daysBefore: Number(state.daysBefore) || 0,
      onlyBuyers: state.onlyBuyers,
      text: state.text,
      giftEnabled: state.giftEnabled,
      giftPoints: Number(state.giftPoints) || 0,
      giftBurnEnabled: state.giftEnabled ? state.giftBurnEnabled : false,
      giftTtlDays: Number(state.giftTtlDays) || 0,
    };

    setState((prev) => ({ ...prev, saving: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/birthday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось сохранить настройки");
      }
      setState((prev) => ({ ...prev, saving: false, banner: { type: "success", text: "Настройки сохранены" } }));
      load();
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: String(error?.message || error || "Не удалось сохранить настройки"),
      }));
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {state.banner && (
        <div
          style={{
            borderRadius: 12,
            padding: "12px 16px",
            background: state.banner.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)",
            border: `1px solid ${state.banner.type === "success" ? "rgba(34,197,94,0.4)" : "rgba(248,113,113,0.4)"}`,
            color: state.banner.type === "success" ? "#bbf7d0" : "#fecaca",
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
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
            <Toggle
              checked={state.enabled}
              onChange={(value) => setState((prev) => ({ ...prev, enabled: value }))}
              label={state.enabled ? "Сценарий включён" : "Сценарий выключен"}
              disabled={state.loading || state.saving}
            />

            <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
              <span>За сколько дней поздравлять клиента</span>
              <input
                type="number"
                min="0"
                value={state.daysBefore}
                onChange={(event) => setState((prev) => ({ ...prev, daysBefore: event.target.value }))}
                disabled={state.loading || state.saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                }}
              />
            </label>

            <Toggle
              checked={state.onlyBuyers}
              onChange={(value) => setState((prev) => ({ ...prev, onlyBuyers: value }))}
              label="Поздравлять только клиентов с покупками"
              disabled={state.loading || state.saving}
              title="Для рассылки будут выбраны клиенты, совершавшие покупки ранее"
            />

            <label style={{ display: "grid", gap: 6 }}>
              <span>Текст push-уведомления</span>
              <textarea
                value={state.text}
                onChange={(event) => setState((prev) => ({ ...prev, text: event.target.value }))}
                maxLength={300}
                rows={4}
                disabled={state.loading || state.saving}
                style={{
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>Осталось символов: {charsLeft}</span>
                <span>Плейсхолдеры: %username%, %username|обращение_по_умолчанию%</span>
              </div>
            </label>

            <div style={{ display: "grid", gap: 16 }}>
              <Toggle
                checked={state.giftEnabled}
                onChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    giftEnabled: value,
                    giftPoints: value ? prev.giftPoints || "100" : "0",
                  }))
                }
                label="Подарить баллы клиенту"
                disabled={state.loading || state.saving}
              />
              {state.giftEnabled && (
                <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                  <span>Сколько баллов подарить клиенту</span>
                  <input
                    type="number"
                    min="1"
                    value={state.giftPoints}
                    onChange={(event) => setState((prev) => ({ ...prev, giftPoints: event.target.value }))}
                    disabled={state.loading || state.saving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(148,163,184,0.35)",
                      background: "rgba(15,23,42,0.6)",
                      color: "#e2e8f0",
                    }}
                  />
                </label>
              )}
            </div>

            {state.giftEnabled && (
              <div style={{ display: "grid", gap: 16 }}>
                <Toggle
                  checked={state.giftBurnEnabled}
                  onChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      giftBurnEnabled: value,
                      giftTtlDays: value ? prev.giftTtlDays || "30" : "0",
                    }))
                  }
                  label="Сделать подарочные баллы сгораемыми"
                  disabled={state.loading || state.saving}
                />
                {state.giftBurnEnabled && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Через сколько дней баллы сгорят</span>
                    <input
                      type="number"
                      min="1"
                      value={state.giftTtlDays}
                      onChange={(event) => setState((prev) => ({ ...prev, giftTtlDays: event.target.value }))}
                      disabled={state.loading || state.saving}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,184,0.35)",
                        background: "rgba(15,23,42,0.6)",
                        color: "#e2e8f0",
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" disabled={state.loading || state.saving}>
                {state.saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </form>
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
  const [stats, setStats] = React.useState<BirthdayStats | null>(null);
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
          setOutlets([
            { value: "all", label: "Все торговые точки" },
            ...items.map((item) => ({ value: item.id, label: item.name })),
          ]);
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
    setSelectedOutlet((prev) => {
      const match = outlets.find((item) => item.value === prev.value);
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
      const url = `/api/portal/analytics/birthday-mechanic${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить статистику");
      }
      setStats(json as BirthdayStats);
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

  const timelineOption = React.useMemo(() => {
    if (!stats) return null;
    const categories = stats.trends.timeline.map((item) => item.date);
    const invites = stats.trends.timeline.map((item) => item.invitations);
    const purchases = stats.trends.timeline.map((item) => item.purchases);
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Поздравления", "Покупки"] },
      grid: { left: 28, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value" },
      series: [
        { name: "Поздравления", type: "line", data: invites, smooth: true },
        { name: "Покупки", type: "line", data: purchases, smooth: true },
      ],
    } as const;
  }, [stats]);

  const revenueOption = React.useMemo(() => {
    if (!stats) return null;
    const categories = stats.trends.revenue.map((item) => item.date);
    const totals = stats.trends.revenue.map((item) => Math.round(item.total / 100));
    const firsts = stats.trends.revenue.map((item) => Math.round(item.firstPurchases / 100));
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Выручка", "Первые покупки"] },
      grid: { left: 32, right: 16, top: 30, bottom: 40 },
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value", axisLabel: { formatter: (val: number) => `${val} ₽` } },
      series: [
        { name: "Выручка", type: "line", data: totals, smooth: true, areaStyle: {} },
        { name: "Первые покупки", type: "line", data: firsts, smooth: true },
      ],
    } as const;
  }, [stats]);

  const summaryItems = React.useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Поздравлений отправлено", value: formatNumber(stats.summary.invitations) },
      { label: "Клиентов с покупками", value: formatNumber(stats.summary.purchasers) },
      { label: "Конверсия", value: `${formatPercent(stats.summary.conversion)}%` },
      { label: "Подарочные баллы", value: `${formatNumber(stats.summary.pointsIssued)} баллов` },
      { label: "Выручка после поздравления", value: formatCurrency(stats.summary.revenue) },
      { label: "Средний чек", value: formatCurrency(stats.summary.averageCheck) },
    ];
  }, [stats]);

  const genderRows = stats?.demographics.gender ?? [];
  const ageRows = stats?.demographics.age ?? [];

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
                onChange={(event) => {
                  const value = event.target.value;
                  const option = outlets.find((item) => item.value === value) ?? outlets[0];
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
                {outlets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Быстрый период</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickRanges.map((item) => (
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
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Произвольный интервал</span>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
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
              Выбран интервал с {appliedCustom.from} по {appliedCustom.to}. Чтобы вернуться к быстрым периодам, выберите диапазон
              выше.
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Сводные показатели</div>
          <KpiGrid items={summaryItems} loading={loading} />
          {stats && (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Поздравляем за {stats.period.daysBefore} дней до даты рождения • окно покупок {stats.period.purchaseWindowDays} дней •
              {" "}
              {stats.period.onlyBuyers ? "только клиенты с прошлой покупкой" : "все клиенты"}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Поздравления и покупки</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Сравнение количества поздравлений и последующих покупок</div>
            {loading ? (
              <Skeleton height={240} />
            ) : timelineOption && stats ? (
              <Chart option={timelineOption as any} height={240} />
            ) : (
              <Placeholder>Нет данных</Placeholder>
            )}
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Выручка после поздравления</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Общая выручка и первые покупки после поздравления</div>
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

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Card>
          <CardBody style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>По полу</div>
            {loading ? (
              <Skeleton height={160} />
            ) : genderRows.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                    <th style={{ padding: "10px 8px" }}>Группа</th>
                    <th style={{ padding: "10px 8px" }}>Поздравлений</th>
                    <th style={{ padding: "10px 8px" }}>Покупок</th>
                  </tr>
                </thead>
                <tbody>
                  {genderRows.map((row) => (
                    <tr key={row.group} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                      <td style={{ padding: "10px 8px" }}>{row.group}</td>
                      <td style={{ padding: "10px 8px" }}>{formatNumber(row.invitations)}</td>
                      <td style={{ padding: "10px 8px" }}>{formatNumber(row.purchases)}</td>
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
          <CardBody style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>По возрасту</div>
            {loading ? (
              <Skeleton height={160} />
            ) : ageRows.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                    <th style={{ padding: "10px 8px" }}>Возраст</th>
                    <th style={{ padding: "10px 8px" }}>Поздравлений</th>
                    <th style={{ padding: "10px 8px" }}>Покупок</th>
                  </tr>
                </thead>
                <tbody>
                  {ageRows.map((row) => (
                    <tr key={row.bucket} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                      <td style={{ padding: "10px 8px" }}>{row.bucket}</td>
                      <td style={{ padding: "10px 8px" }}>{formatNumber(row.invitations)}</td>
                      <td style={{ padding: "10px 8px" }}>{formatNumber(row.purchases)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Placeholder>Нет данных</Placeholder>
            )}
          </CardBody>
        </Card>
      </div>

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
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
      {items.map((item) => (
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
  if (!Number.isFinite(value)) return "0";
  return (Math.round(value * 10) / 10).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "0 ₽";
  return `${formatNumber(Math.round(value / 100))} ₽`;
}
