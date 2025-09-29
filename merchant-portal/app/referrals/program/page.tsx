"use client";

import React from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type RewardTrigger = "first" | "all";
type RewardType = "fixed" | "percent";

type LevelState = { level: number; enabled: boolean; reward: string };

type Banner = { type: "success" | "error"; text: string } | null;

type LoadedData = {
  enabled: boolean;
  rewardTrigger: RewardTrigger;
  rewardType: RewardType;
  multiLevel: boolean;
  rewardValue: number;
  levels: Array<{ level: number; enabled: boolean; reward: number }>;
  friendReward: number;
  stackWithRegistration: boolean;
  message: string;
  placeholders?: string[];
};

type State = {
  loading: boolean;
  saving: boolean;
  error: string;
  banner: Banner;
  enabled: boolean;
  rewardTrigger: RewardTrigger;
  rewardType: RewardType;
  multiLevel: boolean;
  rewardValue: string;
  levels: LevelState[];
  friendReward: string;
  stackWithRegistration: boolean;
  message: string;
  placeholders: string[];
};

const rewardTriggers: Array<{ value: RewardTrigger; label: string }> = [
  { value: "first", label: "За первую покупку друга" },
  { value: "all", label: "За все покупки друга" },
];

const rewardTypes: Array<{ value: RewardType; label: string }> = [
  { value: "fixed", label: "Фиксированное количество баллов" },
  { value: "percent", label: "Процент от суммы покупки" },
];

const initialLevels: LevelState[] = Array.from({ length: 5 }).map((_, index) => ({
  level: index + 1,
  enabled: index < 2,
  reward: index === 0 ? "300" : index === 1 ? "150" : "0",
}));

const initialState: State = {
  loading: true,
  saving: false,
  error: "",
  banner: null,
  enabled: false,
  rewardTrigger: "first",
  rewardType: "fixed",
  multiLevel: false,
  rewardValue: "300",
  levels: initialLevels,
  friendReward: "150",
  stackWithRegistration: false,
  message:
    "Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или промокодом {code}.",
  placeholders: ["{businessname}", "{bonusamount}", "{code}", "{link}"],
};

function normalizeNumber(value: string, { allowZero = true, max }: { allowZero?: boolean; max?: number } = {}) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return allowZero ? 0 : null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (!allowZero && parsed <= 0) return null;
  if (parsed < 0) return null;
  if (typeof max === "number" && parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

export default function ReferralProgramSettingsPage() {
  const [state, setState] = React.useState<State>(initialState);
  const messageRef = React.useRef<HTMLTextAreaElement | null>(null);

  const load = React.useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "", banner: null }));
    try {
      const res = await fetch("/api/portal/referrals/program");
      const json: LoadedData = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.message || "Не удалось загрузить настройки");
      }
      const levels = Array.isArray(json?.levels)
        ? json.levels.map((level) => ({
            level: level.level,
            enabled: level.level <= 2 ? true : Boolean(level.enabled),
            reward: String(Number.isFinite(level.reward) ? level.reward : 0),
          }))
        : initialLevels;
      setState((prev) => ({
        ...prev,
        loading: false,
        enabled: Boolean(json?.enabled),
        rewardTrigger: json?.rewardTrigger === "all" ? "all" : "first",
        rewardType: json?.rewardType === "percent" ? "percent" : "fixed",
        multiLevel: Boolean(json?.multiLevel),
        rewardValue: String(Number(json?.rewardValue ?? 0) || 0),
        levels: levels.map((item) => ({
          ...item,
          reward: String(Number(item.reward ?? 0) || 0),
        })),
        friendReward: String(Number(json?.friendReward ?? 0) || 0),
        stackWithRegistration: Boolean(json?.stackWithRegistration),
        message:
          typeof json?.message === "string" && json.message.trim()
            ? json.message.slice(0, 300)
            : initialState.message,
        placeholders: Array.isArray(json?.placeholders) && json.placeholders.length > 0
          ? json.placeholders
          : initialState.placeholders,
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

  const charsLeft = Math.max(0, 300 - state.message.length);

  function updateLevel(level: number, patch: Partial<LevelState>) {
    setState((prev) => ({
      ...prev,
      levels: prev.levels.map((item) =>
        item.level === level
          ? { ...item, ...patch, reward: patch.reward ?? item.reward }
          : item,
      ),
    }));
  }

  function handleInsertPlaceholder(placeholder: string) {
    const textarea = messageRef.current;
    setState((prev) => {
      const target = textarea;
      if (!target) {
        return { ...prev, message: prev.message + placeholder };
      }
      const start = target.selectionStart ?? prev.message.length;
      const end = target.selectionEnd ?? prev.message.length;
      const nextValue = `${prev.message.slice(0, start)}${placeholder}${prev.message.slice(end)}`;
      const nextState = { ...prev, message: nextValue.slice(0, 300) };
      requestAnimationFrame(() => {
        const cursor = Math.min(start + placeholder.length, nextState.message.length);
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
        target.focus();
      });
      return nextState;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.saving) return;

    const rewardValue = normalizeNumber(state.rewardValue, {
      allowZero: !state.enabled,
      max: state.rewardType === "percent" ? 100 : undefined,
    });
    if (!state.multiLevel) {
      if (rewardValue == null) {
        setState((prev) => ({
          ...prev,
          error:
            state.rewardType === "percent"
              ? "Укажите процент поощрения в диапазоне 0–100"
              : "Укажите корректный размер поощрения",
          banner: null,
        }));
        return;
      }
      if (state.enabled && rewardValue <= 0) {
        setState((prev) => ({
          ...prev,
          error:
            state.rewardType === "percent"
              ? "Процент поощрения должен быть больше 0"
              : "Размер поощрения должен быть больше 0",
          banner: null,
        }));
        return;
      }
    }

    const friendReward = normalizeNumber(state.friendReward, { allowZero: true });
    if (friendReward == null) {
      setState((prev) => ({
        ...prev,
        error: "Укажите корректное количество баллов для приглашённого друга",
        banner: null,
      }));
      return;
    }

    let levelsPayload: Array<{ level: number; enabled: boolean; reward: number }> = [];
    if (state.multiLevel) {
      try {
        levelsPayload = state.levels.map((level) => {
          const reward = normalizeNumber(level.reward, {
            allowZero: !state.enabled || !level.enabled,
            max: state.rewardType === "percent" ? 100 : undefined,
          });
          if (reward == null) {
            throw new Error(`Укажите корректное значение награды для уровня ${level.level}`);
          }
          if (state.enabled && level.enabled && reward <= 0) {
            throw new Error(`Награда для уровня ${level.level} должна быть больше 0`);
          }
          if (state.rewardType === "percent" && reward > 100) {
            throw new Error(`Процент награды для уровня ${level.level} не может превышать 100%`);
          }
          return { level: level.level, enabled: level.enabled || level.level <= 2, reward };
        });
      } catch (error: any) {
        setState((prev) => ({ ...prev, error: String(error?.message || error), banner: null }));
        return;
      }
    }

    if (state.message.length > 300) {
      setState((prev) => ({
        ...prev,
        error: "Текст сообщения не должен превышать 300 символов",
        banner: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, saving: true, error: "", banner: null }));

    const payload: Record<string, unknown> = {
      enabled: state.enabled,
      rewardTrigger: state.rewardTrigger,
      rewardType: state.rewardType,
      multiLevel: state.multiLevel,
      stackWithRegistration: state.stackWithRegistration,
      friendReward,
      message: state.message.trim(),
    };

    if (state.multiLevel) {
      payload.levels = levelsPayload;
    } else {
      payload.rewardValue = rewardValue ?? 0;
    }

    try {
      const res = await fetch("/api/portal/referrals/program", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        <span style={{ color: "var(--brand-primary)" }}>Реферальная программа</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Реферальная программа</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Вознаграждайте клиентов за приглашения друзей</div>
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
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,.35)",
            padding: "12px 16px",
            color: "#f87171",
          }}
        >
          {state.error}
        </div>
      )}

      <Card>
        <CardBody>
          {state.loading ? (
            <Skeleton height={320} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 24 }}>
              <Toggle
                checked={state.enabled}
                onChange={(value) => setState((prev) => ({ ...prev, enabled: value }))}
                label={state.enabled ? "Сценарий включен" : "Сценарий выключен"}
                disabled={state.saving}
              />

              <section style={{ display: "grid", gap: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Приглашающий</div>

                <fieldset style={{ border: "none", padding: 0, display: "grid", gap: 8 }}>
                  <legend style={{ fontSize: 13, opacity: 0.7 }}>За что поощрять?</legend>
                  {rewardTriggers.map((option) => (
                    <label key={option.value} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="reward-trigger"
                        value={option.value}
                        checked={state.rewardTrigger === option.value}
                        onChange={() => setState((prev) => ({ ...prev, rewardTrigger: option.value }))}
                        disabled={state.saving}
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>

                <fieldset style={{ border: "none", padding: 0, display: "grid", gap: 8 }}>
                  <legend style={{ fontSize: 13, opacity: 0.7 }}>Тип поощрения</legend>
                  {rewardTypes.map((option) => (
                    <label key={option.value} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="reward-type"
                        value={option.value}
                        checked={state.rewardType === option.value}
                        onChange={() =>
                          setState((prev) => {
                            if (prev.rewardType === option.value) return prev;
                            const nextLevels = prev.multiLevel
                              ? prev.levels.map((level) => {
                                  const numeric = normalizeNumber(level.reward, { allowZero: true, max: undefined });
                                  if (option.value === "percent") {
                                    const clamped = Math.min(numeric ?? 0, 100);
                                    return { ...level, reward: String(clamped) };
                                  }
                                  return level;
                                })
                              : prev.levels;
                            let nextRewardValue = prev.rewardValue;
                            if (!prev.multiLevel) {
                              const numeric = normalizeNumber(prev.rewardValue, { allowZero: true, max: undefined });
                              if (option.value === "percent") {
                                const fallback = numeric == null || numeric <= 0 ? 10 : Math.min(numeric, 100);
                                nextRewardValue = String(fallback);
                              } else {
                                const fallback = numeric == null || numeric <= 0 ? 300 : numeric;
                                nextRewardValue = String(fallback);
                              }
                            }
                            return {
                              ...prev,
                              rewardType: option.value,
                              rewardValue: nextRewardValue,
                              levels: nextLevels,
                            };
                          })
                        }
                        disabled={state.saving}
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>

                <Toggle
                  checked={state.multiLevel}
                  onChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      multiLevel: value,
                    }))
                  }
                  label="Многоуровневая система поощрения"
                  disabled={state.saving}
                />
                {state.multiLevel && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Награда начисляется за друга и приглашённых им клиентов при их покупках. Настройте уровни вознаграждения ниже.
                  </div>
                )}

                {!state.multiLevel && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Размер поощрения ({state.rewardType === "fixed" ? "баллы" : "%"})</span>
                    <input
                      type="number"
                      min="0"
                      step={state.rewardType === "percent" ? "0.1" : "1"}
                      value={state.rewardValue}
                      onChange={(event) =>
                        setState((prev) => ({ ...prev, rewardValue: event.target.value }))
                      }
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

                {state.multiLevel && (
                  <div style={{ display: "grid", gap: 16 }}>
                    {state.levels.map((level) => {
                      const optional = level.level > 2;
                      const disabled = !state.multiLevel || (optional && !level.enabled);
                      return (
                        <div
                          key={level.level}
                          style={{
                            display: "grid",
                            gap: 6,
                            padding: "12px 16px",
                            borderRadius: 12,
                            border: "1px solid rgba(148,163,184,0.2)",
                            background: "rgba(15,23,42,0.35)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 600 }}>{level.level} уровень</div>
                            {optional && (
                              <Toggle
                                checked={level.enabled}
                                onChange={(value) => updateLevel(level.level, { enabled: value })}
                                label={level.enabled ? "Включен" : "Выключен"}
                                disabled={state.saving}
                              />
                            )}
                          </div>
                          <input
                            type="number"
                            min="0"
                            step={state.rewardType === "percent" ? "0.1" : "1"}
                            value={level.reward}
                            onChange={(event) =>
                              updateLevel(level.level, { reward: event.target.value })
                            }
                            disabled={disabled || state.saving}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(148,163,184,0.35)",
                              background: disabled ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.6)",
                              color: disabled ? "rgba(226,232,240,0.5)" : "#e2e8f0",
                            }}
                          />
                          <div style={{ fontSize: 12, opacity: 0.6 }}>
                            {state.rewardType === "fixed"
                              ? "Сколько баллов получает приглашающий на этом уровне"
                              : "Какой процент от покупки начисляется приглашающему на этом уровне"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    style={{
                      width: 140,
                      height: 70,
                      background: "rgba(148,163,184,0.1)",
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 26,
                    }}
                  >
                    🤝
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Схема: Приглашающий → Друг. При многоуровневой системе добавляются уровни «Друг приглашает следующего».
                  </div>
                </div>
              </section>

              <section style={{ display: "grid", gap: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Друг</div>

                <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                  <span>Сколько баллов получит приглашённый друг?</span>
                  <input
                    type="number"
                    min="0"
                    value={state.friendReward}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, friendReward: event.target.value }))
                    }
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

                <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={state.stackWithRegistration}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, stackWithRegistration: event.target.checked }))
                    }
                    disabled={state.saving}
                  />
                  <span>
                    <div>Суммировать баллы по реферальной программе и баллы за регистрацию</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Например: 150 баллов за регистрацию + 300 по рефералке = 450 баллов.
                    </div>
                  </span>
                </label>
              </section>

              <section style={{ display: "grid", gap: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Настройка сообщения по приглашению</div>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Текст сообщения при нажатии «Пригласить друга»</span>
                  <textarea
                    ref={messageRef}
                    value={state.message}
                    maxLength={300}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, message: event.target.value.slice(0, 300) }))
                    }
                    rows={4}
                    disabled={state.saving}
                    style={{
                      padding: "12px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.35)",
                      background: "rgba(15,23,42,0.6)",
                      color: "#e2e8f0",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    {state.placeholders.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleInsertPlaceholder(item)}
                        disabled={state.saving}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.35)",
                          background: "rgba(15,23,42,0.45)",
                          color: "#e2e8f0",
                          cursor: "pointer",
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Осталось символов: {charsLeft}. Используйте плейсхолдеры, чтобы подставить название компании, бонус и ссылку.
                  </div>
                </label>
              </section>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" type="submit" disabled={state.saving}>
                  Сохранить
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
