"use client";

import React from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

function normalizeInt(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

type Banner = { type: "success" | "error"; text: string } | null;

type State = {
  loading: boolean;
  saving: boolean;
  error: string;
  banner: Banner;
  enabled: boolean;
  points: string;
  burnEnabled: boolean;
  burnTtlDays: string;
  delayEnabled: boolean;
  delayDays: string;
};

const initialState: State = {
  loading: true,
  saving: false,
  error: "",
  banner: null,
  enabled: false,
  points: "150",
  burnEnabled: false,
  burnTtlDays: "30",
  delayEnabled: false,
  delayDays: "3",
};

export default function RegistrationBonusPage() {
  const [state, setState] = React.useState<State>(initialState);

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/registration-bonus");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось загрузить настройки");
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        enabled: Boolean(json?.enabled),
        points: String(Number(json?.points ?? 0) || 0),
        burnEnabled: Boolean(json?.burnEnabled),
        burnTtlDays: String(Number(json?.burnTtlDays ?? 0) || 0),
        delayEnabled: Boolean(json?.delayEnabled),
        delayDays: String(Number(json?.delayDays ?? 0) || 0),
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.saving) return;

    const pointsValue = normalizeInt(state.points, 0);
    if (state.enabled && pointsValue <= 0) {
      setState((prev) => ({ ...prev, error: "Укажите положительное количество баллов", banner: null }));
      return;
    }

    const ttlValue = normalizeInt(state.burnTtlDays, 0);
    if (state.burnEnabled && ttlValue <= 0) {
      setState((prev) => ({ ...prev, error: "Укажите срок сгорания в днях", banner: null }));
      return;
    }

    const delayValue = normalizeInt(state.delayDays, 0);
    if (state.delayEnabled && delayValue <= 0) {
      setState((prev) => ({ ...prev, error: "Укажите задержку начисления в днях", banner: null }));
      return;
    }

    setState((prev) => ({ ...prev, saving: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/loyalty/registration-bonus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: state.enabled,
          points: pointsValue,
          burnEnabled: state.burnEnabled,
          burnTtlDays: ttlValue,
          delayEnabled: state.delayEnabled,
          delayDays: delayValue,
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
        <span style={{ color: "var(--brand-primary)" }}>Баллы за регистрацию</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Баллы за регистрацию</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Приветственный бонус новым участникам программы</div>
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
            <Skeleton height={220} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
              <Toggle
                checked={state.enabled}
                onChange={(value) => setState((prev) => ({ ...prev, enabled: value }))}
                label={state.enabled ? "Механика включена" : "Механика выключена"}
                disabled={state.saving}
              />

              <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                <span>Сколько баллов начислять за регистрацию</span>
                <input
                  type="number"
                  min="0"
                  value={state.points}
                  onChange={(event) => setState((prev) => ({ ...prev, points: event.target.value }))}
                  disabled={state.saving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
              </label>

              <div style={{ display: "grid", gap: 12 }}>
                <Toggle
                  checked={state.burnEnabled}
                  onChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      burnEnabled: value,
                      burnTtlDays:
                        value && (!prev.burnTtlDays || Number(prev.burnTtlDays) <= 0)
                          ? "30"
                          : prev.burnTtlDays,
                    }))
                  }
                  label="Сделать начисляемые баллы сгораемыми"
                  disabled={state.saving}
                />
                {state.burnEnabled && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Через сколько дней баллы сгорят</span>
                    <input
                      type="number"
                      min="1"
                      value={state.burnTtlDays}
                      onChange={(event) => setState((prev) => ({ ...prev, burnTtlDays: event.target.value }))}
                      disabled={state.saving}
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

              <div style={{ display: "grid", gap: 12 }}>
                <Toggle
                  checked={state.delayEnabled}
                  onChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      delayEnabled: value,
                      delayDays:
                        value && (!prev.delayDays || Number(prev.delayDays) <= 0)
                          ? "3"
                          : prev.delayDays,
                    }))
                  }
                  label="Отложить начисление баллов"
                  disabled={state.saving}
                />
                {state.delayEnabled && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Через сколько дней начислить баллы</span>
                    <input
                      type="number"
                      min="1"
                      value={state.delayDays}
                      onChange={(event) => setState((prev) => ({ ...prev, delayDays: event.target.value }))}
                      disabled={state.saving}
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <Button type="button" variant="secondary" onClick={load} disabled={state.saving}>
                  Сбросить
                </Button>
                <Button variant="primary" type="submit" disabled={state.saving}>
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
