"use client";

import React from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

type Banner = { type: "success" | "error"; text: string } | null;

type State = {
  loading: boolean;
  saving: boolean;
  error: string;
  banner: Banner;
  enabled: boolean;
  daysBefore: string;
  text: string;
  pointsTtlDays: number;
  telegramBotConnected: boolean;
};

const defaultText = "Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!";

const initialState: State = {
  loading: true,
  saving: false,
  error: "",
  banner: null,
  enabled: false,
  daysBefore: "5",
  text: defaultText,
  pointsTtlDays: 0,
  telegramBotConnected: false,
};

export default function BurnReminderPage() {
  const [state, setState] = React.useState<State>(initialState);

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/ttl");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить настройки");
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        enabled: Boolean(json?.enabled),
        daysBefore: String(Number(json?.daysBefore ?? json?.days ?? 5) || 5),
        text: typeof json?.text === "string" ? json.text : defaultText,
        pointsTtlDays: Number(json?.pointsTtlDays ?? 0) || 0,
        telegramBotConnected: Boolean(json?.telegramBotConnected),
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

    const daysValue = Math.max(0, Math.floor(Number(state.daysBefore) || 0));
    if (state.enabled) {
      if (!state.text.trim()) {
        setState((prev) => ({ ...prev, error: "Укажите текст push-уведомления", banner: null }));
        return;
      }
      if (daysValue <= 0) {
        setState((prev) => ({ ...prev, error: "Количество дней должно быть положительным", banner: null }));
        return;
      }
    }

    setState((prev) => ({ ...prev, saving: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/ttl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: state.enabled,
          daysBefore: daysValue,
          text: state.text,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось сохранить настройки");
      }
      setState((prev) => ({
        ...prev,
        saving: false,
        banner: { type: "success", text: "Настройки сохранены" },
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: String(error?.message || error || "Не удалось сохранить настройки"),
      }));
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>
          Механики
        </a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Напоминание о сгорании баллов</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Напоминание о сгорании баллов</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Уведомляйте клиентов о скором сгорании подарочных баллов</div>
      </div>

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
              <Toggle
                checked={state.enabled}
                onChange={(value) => setState((prev) => ({ ...prev, enabled: value }))}
                label={state.enabled ? "Уведомления включены" : "Уведомления выключены"}
                disabled={state.saving}
              />

              <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
                <span>За сколько дней отправлять сообщение (дней)</span>
                <input
                  type="number"
                  min="1"
                  value={state.daysBefore}
                  onChange={(event) => setState((prev) => ({ ...prev, daysBefore: event.target.value }))}
                  disabled={state.saving || !state.enabled}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: state.enabled ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.3)",
                    color: "#e2e8f0",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Текст push-уведомления</span>
                <textarea
                  value={state.text}
                  maxLength={300}
                  onChange={(event) => setState((prev) => ({ ...prev, text: event.target.value }))}
                  rows={4}
                  disabled={state.saving || !state.enabled}
                  style={{
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: state.enabled ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.3)",
                    color: "#e2e8f0",
                    resize: "vertical",
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                  <span>Осталось символов: {charsLeft}</span>
                  <span>Плейсхолдеры: %username%, %amount%, %burn_date%</span>
                </div>
              </label>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "stretch" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Предпросмотр</div>
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "16px 18px",
                      background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(236,72,153,0.12))",
                      minHeight: 120,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Push-уведомление</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Скоро сгорят баллы</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{state.text}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Отправим за {state.daysBefore || "?"} дней до даты сгорания</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, display: "grid", gap: 8 }}>
                  <div>
                    <strong>Срок жизни баллов:</strong> {state.pointsTtlDays > 0 ? `${state.pointsTtlDays} дней` : "не задан"}
                  </div>
                  <div>
                    <strong>Подключен Telegram-бот:</strong> {state.telegramBotConnected ? "да" : "нет"}
                  </div>
                </div>
              </div>

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
