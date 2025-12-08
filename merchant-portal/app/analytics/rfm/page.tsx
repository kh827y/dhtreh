"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";

type RfmRange = { min: number | null; max: number | null };
type RfmGroup = {
  score: number;
  recency: RfmRange;
  frequency: RfmRange;
  monetary: RfmRange;
};
type RfmDistributionRow = { class: string; customers: number };
type RfmSettingsState = {
  recencyMode: "auto" | "manual";
  recencyDays: number | null;
  frequencyMode: "auto" | "manual";
  frequencyThreshold: number | null;
  frequencySuggested: number | null;
  moneyMode: "auto" | "manual";
  moneyThreshold: number | null;
  moneySuggested: number | null;
};
type RfmAnalyticsResponse = {
  settings: RfmSettingsState;
  groups: RfmGroup[];
  distribution: RfmDistributionRow[];
  totals: { customers: number };
};

const defaultSettings: RfmSettingsState = {
  recencyMode: "auto",
  recencyDays: null,
  frequencyMode: "auto",
  frequencyThreshold: null,
  frequencySuggested: null,
  moneyMode: "auto",
  moneyThreshold: null,
  moneySuggested: null,
};

const currencyFormatter = new Intl.NumberFormat("ru-RU");

function formatRange(range: RfmRange, formatter: (value: number) => string) {
  const hasMin = typeof range.min === "number" && Number.isFinite(range.min);
  const hasMax = typeof range.max === "number" && Number.isFinite(range.max);
  if (hasMin && hasMax) {
    const minValue = formatter(Math.max(0, Math.round(range.min!)));
    const maxValue = formatter(Math.max(0, Math.round(range.max!)));
    if (range.min === range.max) return minValue;
    return `${minValue} – ${maxValue}`;
  }
  if (hasMin) {
    const minValue = formatter(Math.max(0, Math.round(range.min!)));
    return `≥ ${minValue}`;
  }
  if (hasMax) {
    const maxValue = formatter(Math.max(0, Math.round(range.max!)));
    return `≤ ${maxValue}`;
  }
  return "—";
}

function formatRecencyRange(range: RfmRange) {
  return formatRange(range, (value) => `${value.toLocaleString("ru-RU")} дн.`);
}

function formatFrequencyRange(range: RfmRange) {
  return formatRange(range, (value) => `${value.toLocaleString("ru-RU")} покупок`);
}

function formatMoneyRange(range: RfmRange) {
  return formatRange(range, (value) => `${currencyFormatter.format(value)} ₽`);
}

async function fetchAnalytics(): Promise<RfmAnalyticsResponse> {
  const res = await fetch("/api/portal/analytics/rfm", { cache: "no-store" });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || res.statusText);
  }
  return res.json() as Promise<RfmAnalyticsResponse>;
}

async function updateSettings(payload: {
  recencyMode: "auto" | "manual";
  recencyDays?: number;
  frequencyMode: "auto" | "manual";
  frequencyThreshold?: number;
  moneyMode: "auto" | "manual";
  moneyThreshold?: number;
}): Promise<RfmAnalyticsResponse> {
  const res = await fetch("/api/portal/analytics/rfm/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || res.statusText);
  }
  return res.json() as Promise<RfmAnalyticsResponse>;
}

export default function AnalyticsRfmPage() {
  const [analytics, setAnalytics] = React.useState<RfmAnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<RfmSettingsState>(defaultSettings);
  const [draft, setDraft] = React.useState<RfmSettingsState>(defaultSettings);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAnalytics();
      setAnalytics(data);
      setSettings(data.settings);
      setDraft(data.settings);
    } catch (error) {
      console.error("Не удалось загрузить RFM-аналитику", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const groups = analytics?.groups ?? [];
  const distribution = analytics?.distribution ?? [];

  const dirty = React.useMemo(() => {
    return (
      draft.recencyMode !== settings.recencyMode ||
      draft.recencyDays !== settings.recencyDays ||
      draft.frequencyMode !== settings.frequencyMode ||
      (draft.frequencyMode === "manual" && draft.frequencyThreshold !== settings.frequencyThreshold) ||
      draft.moneyMode !== settings.moneyMode ||
      (draft.moneyMode === "manual" && draft.moneyThreshold !== settings.moneyThreshold)
    );
  }, [draft, settings]);

  const applySettings = async () => {
    if (draft.recencyMode === "manual") {
      if (draft.recencyDays == null || draft.recencyDays < 1) {
        alert("Давность должна быть положительным числом дней");
        return;
      }
    }
    if (draft.frequencyMode === "manual") {
      if (!draft.frequencyThreshold || draft.frequencyThreshold < 1) {
        alert("Количество покупок должно быть не меньше 1");
        return;
      }
    }
    if (draft.moneyMode === "manual") {
      if (draft.moneyThreshold == null || draft.moneyThreshold < 0) {
        alert("Сумма чека должна быть неотрицательной");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        recencyMode: draft.recencyMode,
        ...(draft.recencyMode === "manual"
          ? { recencyDays: Math.max(1, Math.round(draft.recencyDays ?? 1)) }
          : {}),
        frequencyMode: draft.frequencyMode,
        ...(draft.frequencyMode === "manual"
          ? { frequencyThreshold: Math.max(1, Math.round(draft.frequencyThreshold ?? 1)) }
          : {}),
        moneyMode: draft.moneyMode,
        ...(draft.moneyMode === "manual"
          ? { moneyThreshold: Math.max(0, Math.round(draft.moneyThreshold ?? 0)) }
          : {}),
      } as const;
      const data = await updateSettings(payload);
      setAnalytics(data);
      setSettings(data.settings);
      setDraft(data.settings);
      setOpen(false);
    } catch (error) {
      console.error("Не удалось сохранить настройки RFM", error);
      alert("Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setDraft(settings);
    setOpen(false);
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>RFM-Анализ</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Сегментация клиентов по давности, частоте и сумме покупок</div>
        </div>
        <Button variant="secondary" onClick={() => { setDraft(settings); setOpen(true); }} disabled={loading}>Настройки</Button>
      </header>

      <Card>
        <CardBody>
          <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>
            RFM-анализ помогает быстро понять, как давно клиенты совершали покупки, насколько часто они возвращаются и на какие суммы. Чем выше значение R — тем более «тёплый» клиент, а высокие F и M показывают лояльную аудиторию.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Группы RFM" subtitle="Текущие диапазоны сегментации" />
        <CardBody>
          {loading ? (
            <Skeleton height={180} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.7 }}>
                  <th style={{ padding: "12px 8px" }}># Группы</th>
                  <th style={{ padding: "12px 8px" }}>Давность?</th>
                  <th style={{ padding: "12px 8px" }}>Частота?</th>
                  <th style={{ padding: "12px 8px" }}>Деньги?</th>
                </tr>
              </thead>
              <tbody>
                {groups.length ? (
                  groups.map((group) => (
                    <tr key={group.score} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>{group.score}</td>
                      <td style={{ padding: "10px 8px" }}>{formatRecencyRange(group.recency)}</td>
                      <td style={{ padding: "10px 8px" }}>{formatFrequencyRange(group.frequency)}</td>
                      <td style={{ padding: "10px 8px" }}>{formatMoneyRange(group.monetary)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "12px 8px", opacity: 0.7 }}>Недостаточно данных для расчёта групп.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Размер RFM-групп" subtitle="Количество клиентов в каждом сегменте" />
        <CardBody>
          {loading ? (
            <Skeleton height={180} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.7 }}>
                  <th style={{ padding: "12px 8px" }}>Группа (R-F-M)</th>
                  <th style={{ padding: "12px 8px" }}>Клиентов</th>
                </tr>
              </thead>
              <tbody>
                {distribution.length ? (
                  distribution.map((row) => (
                    <tr key={row.class} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                      <td style={{ padding: "10px 8px" }}>{row.class}</td>
                      <td style={{ padding: "10px 8px" }}>{row.customers.toLocaleString("ru-RU")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} style={{ padding: "12px 8px", opacity: 0.7 }}>Нет клиентов, подходящих под расчёт RFM.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 90,
          }}
        >
          <div style={{ background: "#0f172a", borderRadius: 16, padding: 24, width: "min(420px, 92vw)", boxShadow: "0 24px 60px rgba(15,23,42,0.45)", position: "relative" }}>
            <button
              onClick={closeModal}
              aria-label="Закрыть"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(248,113,113,0.12)",
                color: "#f87171",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Границы RFM-сегментов</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Recency (давность в днях)</span>
                <select
                  value={draft.recencyMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as RfmSettingsState["recencyMode"];
                    setDraft((prev) => ({ ...prev, recencyMode: nextMode }));
                  }}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="auto">Автоматически (квантильный расчёт)</option>
                  <option value="manual">Задать вручную</option>
                </select>
                {draft.recencyMode === "manual" ? (
                  <input
                    type="number"
                    min={1}
                    value={draft.recencyDays ?? ""}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setDraft((prev) => ({ ...prev, recencyDays: Number.isFinite(next) ? Math.max(1, Math.round(next)) : prev.recencyDays }));
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    Границы R определяются автоматически по квантилям давности
                  </div>
                )}
                <span style={{ fontSize: 12, opacity: 0.65 }}>После какого количества дней покупатель будет безвозвратно потерян (для ручного режима)</span>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Frequency (частота)</span>
                <select
                  value={draft.frequencyMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as RfmSettingsState["frequencyMode"];
                    setDraft((prev) => ({ ...prev, frequencyMode: nextMode }));
                  }}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="auto">Автоматически</option>
                  <option value="manual">Задать вручную</option>
                </select>
                {draft.frequencyMode === "manual" ? (
                  <input
                    type="number"
                    min={1}
                    value={draft.frequencyThreshold ?? ""}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setDraft((prev) => ({ ...prev, frequencyThreshold: Number.isFinite(next) ? Math.max(1, Math.round(next)) : prev.frequencyThreshold }));
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {draft.frequencySuggested != null
                      ? `Автоподбор: ≥ ${draft.frequencySuggested.toLocaleString("ru-RU")} покупок`
                      : "Автоподбор будет доступен после появления данных"}
                  </div>
                )}
                <span style={{ fontSize: 12, opacity: 0.65 }}>После какого количества покупок покупателя можно считать сверх-лояльным</span>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Money (сумма чека)</span>
                <select
                  value={draft.moneyMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as RfmSettingsState["moneyMode"];
                    setDraft((prev) => ({ ...prev, moneyMode: nextMode }));
                  }}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="auto">Автоматически</option>
                  <option value="manual">Задать вручную</option>
                </select>
                {draft.moneyMode === "manual" ? (
                  <input
                    type="number"
                    min={0}
                    value={draft.moneyThreshold ?? ""}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setDraft((prev) => ({ ...prev, moneyThreshold: Number.isFinite(next) ? Math.max(0, Math.round(next)) : prev.moneyThreshold }));
                    }}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {draft.moneySuggested != null
                      ? `Автоподбор: ≥ ${currencyFormatter.format(draft.moneySuggested)} ₽`
                      : "Автоподбор станет доступен, когда появятся продажи"}
                  </div>
                )}
                <span style={{ fontSize: 12, opacity: 0.65 }}>Какую сумму чека можно считать максимально возможной. Все покупатели с чеком выше указанного будут попадать в группу</span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <Button variant="secondary" onClick={closeModal} disabled={saving}>Отмена</Button>
              <Button variant="primary" onClick={applySettings} disabled={!dirty || saving}>Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
