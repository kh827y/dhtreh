"use client";

import React from "react";
import Toggle from "../../../components/Toggle";

type RatingPeriod = "week" | "month" | "quarter" | "custom";

type SettingsState = {
  enabled: boolean;
  newClientPoints: number;
  existingClientPoints: number;
  ratingPeriod: RatingPeriod;
  customDays: number;
};

const initialSettings: SettingsState = {
  enabled: true,
  newClientPoints: 200,
  existingClientPoints: 120,
  ratingPeriod: "week",
  customDays: 14,
};

const ratingOptions: { value: RatingPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "custom", label: "Свой период" },
];

function getPeriodLabel(settings: SettingsState) {
  switch (settings.ratingPeriod) {
    case "week":
      return "Последняя неделя";
    case "month":
      return "Последний месяц";
    case "quarter":
      return "Последний квартал";
    case "custom":
      return `${settings.customDays} дней`;
    default:
      return "";
  }
}

function calculateScorePreview(index: number, settings: SettingsState) {
  const base = settings.enabled ? settings.newClientPoints + settings.existingClientPoints : 0;
  const modifier = [1, 0.82, 0.64][index] ?? 0.5;
  return Math.round(base * modifier);
}

export default function StaffMotivationPage() {
  const [settings, setSettings] = React.useState<SettingsState>(initialSettings);
  const [savedSettings, setSavedSettings] = React.useState<SettingsState>(initialSettings);
  const [message, setMessage] = React.useState("");

  const customDaysError = React.useMemo(() => {
    if (settings.ratingPeriod !== "custom") return "";
    if (!Number.isFinite(settings.customDays) || settings.customDays <= 0) {
      return "Введите количество дней";
    }
    if (settings.customDays > 180) {
      return "Не более 180 дней";
    }
    return "";
  }, [settings.ratingPeriod, settings.customDays]);

  const isDirty =
    settings.enabled !== savedSettings.enabled ||
    settings.newClientPoints !== savedSettings.newClientPoints ||
    settings.existingClientPoints !== savedSettings.existingClientPoints ||
    settings.ratingPeriod !== savedSettings.ratingPeriod ||
    (settings.ratingPeriod === "custom" && settings.customDays !== savedSettings.customDays) ||
    (settings.ratingPeriod !== "custom" && savedSettings.ratingPeriod === "custom");

  const canSave = isDirty && !customDaysError;

  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  function updateSetting<T extends keyof SettingsState>(key: T, value: SettingsState[T]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!canSave) return;
    setSavedSettings(settings);
    setMessage("Настройки сохранены");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Мотивация персонала</h1>
        <p style={{ margin: 0, opacity: 0.75, maxWidth: 680 }}>
          Настройте правила начисления очков сотрудникам и отображение рейтинга в панели кассира.
          Прозрачная система мотивации помогает команде фокусироваться на важных действиях — регистрации новых клиентов и
          качественном обслуживании постоянных гостей.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Toggle checked={settings.enabled} onChange={(value) => updateSetting("enabled", value)} label="" />
        <div style={{ display: "grid" }}>
          <span style={{ fontWeight: 600 }}>Включить функцию</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Показывать рейтинг сотрудников и начислять очки за выполненные действия</span>
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
            <h2 style={{ margin: 0, fontSize: 18 }}>Настройки начисления очков сотрудникам</h2>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>За нового клиента</span>
              <input
                type="number"
                min={0}
                value={settings.newClientPoints}
                onChange={(event) => updateSetting("newClientPoints", Number(event.target.value))}
                disabled={!settings.enabled}
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
              <span style={{ fontSize: 13, opacity: 0.75 }}>За существующего клиента</span>
              <input
                type="number"
                min={0}
                value={settings.existingClientPoints}
                onChange={(event) => updateSetting("existingClientPoints", Number(event.target.value))}
                disabled={!settings.enabled}
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
            <h2 style={{ margin: 0, fontSize: 18 }}>Настройки отображения рейтинга в панели кассира</h2>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.75 }}>За какой период отобразить начисленные сотрудникам очки</span>
              <select
                value={settings.ratingPeriod}
                onChange={(event) => updateSetting("ratingPeriod", event.target.value as RatingPeriod)}
                disabled={!settings.enabled}
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
                <span style={{ fontSize: 13, opacity: 0.75 }}>N дней</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={settings.customDays}
                  onChange={(event) => updateSetting("customDays", Number(event.target.value))}
                  disabled={!settings.enabled}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${customDaysError ? "rgba(248,113,113,0.55)" : "rgba(148,163,184,0.35)"}`,
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
                <span style={{ color: "#f87171", fontSize: 12, visibility: customDaysError ? "visible" : "hidden" }}>
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
              Сохранить
            </button>
            {message && <span style={{ color: "#34d399", fontSize: 13 }}>{message}</span>}
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
          <span style={{ fontSize: 13, opacity: 0.75 }}>Предпросмотр экрана кассира</span>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Очки: {calculateScorePreview(index, settings)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Новые клиенты: {settings.newClientPoints / 10}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
