"use client";

import React from "react";
import Toggle from "../../../components/Toggle";

const DEFAULT_NEW_POINTS = 30;
const DEFAULT_EXISTING_POINTS = 10;
const DEFAULT_CUSTOM_DAYS = 30;
const MAX_CUSTOM_DAYS = 365;

type RatingPeriod = "week" | "month" | "quarter" | "year" | "custom";

type SettingsState = {
  enabled: boolean;
  newClientPoints: number;
  existingClientPoints: number;
  ratingPeriod: RatingPeriod;
  customDays: number;
};

const defaultState: SettingsState = {
  enabled: false,
  newClientPoints: DEFAULT_NEW_POINTS,
  existingClientPoints: DEFAULT_EXISTING_POINTS,
  ratingPeriod: "week",
  customDays: DEFAULT_CUSTOM_DAYS,
};

const ratingOptions: { value: RatingPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
  { value: "custom", label: "Свой период" },
];

function normalizePeriod(value: unknown): RatingPeriod {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (ratingOptions.some((opt) => opt.value === normalized)) {
    return normalized as RatingPeriod;
  }
  return "week";
}

function clampPoints(value: unknown, fallback: number): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function normalizeCustomDays(value: unknown): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_CUSTOM_DAYS;
  return numeric;
}

function normalizeSettings(payload: any): SettingsState {
  const ratingPeriod = normalizePeriod(payload?.leaderboardPeriod);
  const baseCustomDays =
    payload?.customDays ??
    (payload?.settings ? payload.settings.customDays : undefined);
  return {
    enabled: Boolean(payload?.enabled),
    newClientPoints: clampPoints(
      payload?.pointsForNewCustomer,
      DEFAULT_NEW_POINTS,
    ),
    existingClientPoints: clampPoints(
      payload?.pointsForExistingCustomer,
      DEFAULT_EXISTING_POINTS,
    ),
    ratingPeriod,
    customDays:
      ratingPeriod === "custom"
        ? normalizeCustomDays(baseCustomDays)
        : normalizeCustomDays(baseCustomDays ?? DEFAULT_CUSTOM_DAYS),
  };
}

function getPeriodLabel(settings: SettingsState) {
  switch (settings.ratingPeriod) {
    case "week":
      return "Последние 7 дней";
    case "month":
      return "Последние 30 дней";
    case "quarter":
      return "Последние 90 дней";
    case "year":
      return "Последние 365 дней";
    case "custom": {
      const days = Math.max(1, Math.round(settings.customDays));
      const suffix =
        days % 10 === 1 && days % 100 !== 11
          ? "день"
          : days % 10 >= 2 &&
              days % 10 <= 4 &&
              (days % 100 < 10 || days % 100 >= 20)
            ? "дня"
            : "дней";
      return `Последние ${days} ${suffix}`;
    }
    default:
      return "";
  }
}

function calculateScorePreview(index: number, settings: SettingsState) {
  const base = settings.enabled
    ? settings.newClientPoints + settings.existingClientPoints
    : 0;
  const modifier = [1, 0.82, 0.64][index] ?? 0.5;
  return Math.round(base * modifier);
}

export default function StaffMotivationPage() {
  const [settings, setSettings] = React.useState<SettingsState>(defaultState);
  const [savedSettings, setSavedSettings] =
    React.useState<SettingsState>(defaultState);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/portal/staff-motivation", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json().catch(() => ({}));
      const normalized = normalizeSettings(data);
      setSettings(normalized);
      setSavedSettings(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message || "Не удалось загрузить настройки");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const customDaysError = React.useMemo(() => {
    if (settings.ratingPeriod !== "custom") return "";
    if (!Number.isFinite(settings.customDays) || settings.customDays <= 0) {
      return "Введите количество дней";
    }
    if (settings.customDays > MAX_CUSTOM_DAYS) {
      return `Не более ${MAX_CUSTOM_DAYS} дней`;
    }
    return "";
  }, [settings.ratingPeriod, settings.customDays]);

  const isDirty =
    settings.enabled !== savedSettings.enabled ||
    settings.newClientPoints !== savedSettings.newClientPoints ||
    settings.existingClientPoints !== savedSettings.existingClientPoints ||
    settings.ratingPeriod !== savedSettings.ratingPeriod ||
    (settings.ratingPeriod === "custom" &&
      settings.customDays !== savedSettings.customDays) ||
    (settings.ratingPeriod === "custom" &&
      savedSettings.ratingPeriod !== "custom") ||
    (settings.ratingPeriod !== "custom" &&
      savedSettings.ratingPeriod === "custom");

  const canSave =
    !loading &&
    !saving &&
    isDirty &&
    (settings.ratingPeriod === "custom" ? !customDaysError : true);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError("");
    setMessage("");
    try {
      const body = {
        enabled: settings.enabled,
        pointsForNewCustomer: Math.round(settings.newClientPoints),
        pointsForExistingCustomer: Math.round(settings.existingClientPoints),
        leaderboardPeriod: settings.ratingPeriod,
        customDays:
          settings.ratingPeriod === "custom"
            ? Math.round(settings.customDays)
            : null,
      };
      const response = await fetch("/api/portal/staff-motivation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json().catch(() => body);
      const normalized = normalizeSettings(data);
      setSettings(normalized);
      setSavedSettings(normalized);
      setMessage("Настройки сохранены");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message || "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Мотивация персонала</h1>
        <p style={{ margin: 0, opacity: 0.75, maxWidth: 680 }}>
          Настройте правила начисления очков сотрудникам и отображение рейтинга
          в панели кассира. Прозрачная система мотивации помогает команде
          фокусироваться на важных действиях — регистрации новых клиентов и
          качественном обслуживании постоянных гостей.
        </p>
        {loading && (
          <span style={{ fontSize: 13, color: "rgba(148,163,184,0.9)" }}>
            Загружаем текущие настройки...
          </span>
        )}
        {loadError && (
          <div
            style={{
              fontSize: 13,
              color: "#f87171",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>Не удалось загрузить настройки: {loadError}</span>
            <button
              type="button"
              onClick={() => void fetchSettings()}
              style={{
                border: "1px solid rgba(248,113,113,0.4)",
                borderRadius: 8,
                padding: "6px 12px",
                background: "transparent",
                color: "#fca5a5",
                cursor: loading ? "not-allowed" : "pointer",
              }}
              disabled={loading}
            >
              Повторить
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Toggle
          checked={settings.enabled}
          onChange={(value) => {
            if (loading || saving) return;
            setSettings((prev) => ({ ...prev, enabled: value }));
          }}
          label=""
          disabled={loading || saving}
        />
        <div style={{ display: "grid" }}>
          <span style={{ fontWeight: 600 }}>Включить функцию</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            Показывать рейтинг сотрудников и начислять очки за выполненные
            действия
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 24 }}>
          <section
            style={{
              padding: 24,
              borderRadius: 20,
              background: "rgba(15,23,42,0.65)",
              border: "1px solid rgba(148,163,184,0.15)",
              display: "grid",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Настройки начисления очков сотрудникам
            </h2>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>
                За нового клиента
              </span>
              <input
                type="number"
                min={0}
                value={settings.newClientPoints}
                onChange={(event) => {
                  if (!settings.enabled || loading || saving) return;
                  const next = clampPoints(
                    event.target.value,
                    settings.newClientPoints,
                  );
                  setSettings((prev) => ({
                    ...prev,
                    newClientPoints: next,
                  }));
                }}
                disabled={!settings.enabled || loading || saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>
                За существующего клиента
              </span>
              <input
                type="number"
                min={0}
                value={settings.existingClientPoints}
                onChange={(event) => {
                  if (!settings.enabled || loading || saving) return;
                  const next = clampPoints(
                    event.target.value,
                    settings.existingClientPoints,
                  );
                  setSettings((prev) => ({
                    ...prev,
                    existingClientPoints: next,
                  }));
                }}
                disabled={!settings.enabled || loading || saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                }}
              />
            </label>
          </section>

          <section
            style={{
              padding: 24,
              borderRadius: 20,
              background: "rgba(15,23,42,0.65)",
              border: "1px solid rgba(148,163,184,0.15)",
              display: "grid",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Настройки отображения рейтинга в панели кассира
            </h2>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>
                За какой период отобразить начисленные сотрудникам очки
              </span>
              <select
                value={settings.ratingPeriod}
                onChange={(event) => {
                  if (!settings.enabled || loading || saving) return;
                  const next = event.target.value as RatingPeriod;
                  setSettings((prev) => {
                    const base = { ...prev, ratingPeriod: next };
                    if (
                      next === "custom" &&
                      (!prev.customDays || prev.customDays <= 0)
                    ) {
                      base.customDays = DEFAULT_CUSTOM_DAYS;
                    }
                    return base;
                  });
                }}
                disabled={!settings.enabled || loading || saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                }}
              >
                {ratingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {settings.ratingPeriod === "custom" && (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>
                  Количество дней
                </span>
                <input
                  type="number"
                  min={1}
                  max={MAX_CUSTOM_DAYS}
                  value={settings.customDays}
                  onChange={(event) => {
                    if (!settings.enabled || loading || saving) return;
                    const next = Math.round(Number(event.target.value));
                    setSettings((prev) => ({
                      ...prev,
                      customDays: Number.isFinite(next)
                        ? next
                        : prev.customDays,
                    }));
                  }}
                  disabled={!settings.enabled || loading || saving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${
                      customDaysError
                        ? "rgba(248,113,113,0.55)"
                        : "rgba(148,163,184,0.35)"
                    }`,
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
                <span
                  style={{
                    color: "#f87171",
                    fontSize: 12,
                    visibility: customDaysError ? "visible" : "hidden",
                  }}
                >
                  {customDaysError || " "}
                </span>
              </label>
            )}
          </section>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                padding: "12px 22px",
                borderRadius: 12,
                background: canSave ? "#38bdf8" : "rgba(56,189,248,0.3)",
                color: canSave ? "#0f172a" : "rgba(15,23,42,0.6)",
                border: "none",
                fontWeight: 600,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
            {message && (
              <span style={{ color: "#34d399", fontSize: 13 }}>{message}</span>
            )}
            {saveError && (
              <span style={{ color: "#f87171", fontSize: 13 }}>
                {saveError}
              </span>
            )}
          </div>
        </div>

        <aside
          aria-label="Предпросмотр панели кассира"
          style={{
            borderRadius: 24,
            border: "1px solid rgba(148,163,184,0.2)",
            background: "rgba(15,23,42,0.45)",
            padding: 20,
            display: "grid",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            Предпросмотр экрана кассира
          </span>
          <div
            style={{
              borderRadius: 18,
              border: "1px dashed rgba(148,163,184,0.3)",
              background: "rgba(30,41,59,0.6)",
              padding: 16,
              minHeight: 260,
              display: "grid",
              alignContent: "start",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "grid" }}>
                <span style={{ fontWeight: 600 }}>Рейтинг сотрудников</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Период: {getPeriodLabel(settings)}
                </span>
              </div>
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "rgba(56,189,248,0.15)",
                  color: "#38bdf8",
                  fontSize: 12,
                }}
              >
                {settings.enabled ? "Активно" : "Выключено"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {["Ирина М.", "Андрей П.", "Светлана К."].map((name, index) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(15,23,42,0.45)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "rgba(56,189,248,0.2)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 14,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ display: "grid" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {name}
                      </span>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        Очки: {calculateScorePreview(index, settings)}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Новые клиенты: {Math.round(settings.newClientPoints / 10)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
