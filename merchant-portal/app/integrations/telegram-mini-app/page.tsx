"use client";

import React from "react";
import { Card, CardBody, CardHeader, Button, Skeleton } from "@loyalty/ui";

type TelegramState = {
  enabled: boolean;
  botUsername: string | null;
  botLink: string | null;
  miniappUrl: string | null;
  connectionHealthy: boolean;
  tokenMask: string | null;
  message?: string | null;
};

type FetchResponse = TelegramState & { message?: string | null };

const TOKEN_HINT = "7312849602:AAE7hhQJLspTtFVg4rz2MkP8Cr8-5rKZlu";

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
      <span>{label}</span>
    </div>
  );
}

function SpinnerIcon({ size = 18, color = "#38bdf8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden="true">
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
      >
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function TelegramMiniAppPage() {
  const [state, setState] = React.useState<TelegramState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [token, setToken] = React.useState("");
  const [actionPending, setActionPending] = React.useState(false);
  const [tokenSaving, setTokenSaving] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [showConnectDialog, setShowConnectDialog] = React.useState(false);
  const [connectToken, setConnectToken] = React.useState("");
  const [connectError, setConnectError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/integrations/telegram-mini-app");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState(null);
        setError((data && typeof data?.message === "string" && data.message) || "Не удалось получить состояние интеграции");
      } else {
        setState(data ?? null);
        setMessage((data && typeof data?.message === "string" && data.message) || "");
      }
    } catch (e: any) {
      setState(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const isEnabled = Boolean(state?.enabled);
  const connectionOk = Boolean(state?.connectionHealthy);

  const connect = async (tokenValue: string, options?: { viaSettings?: boolean }) => {
    const trimmed = tokenValue.trim();
    if (!trimmed) {
      if (options?.viaSettings) {
        setError("Введите токен Telegram-бота");
      } else {
        setConnectError("Введите токен Telegram-бота");
      }
      return;
    }

    const setPending = options?.viaSettings ? setTokenSaving : setActionPending;
    setPending(true);

    if (!options?.viaSettings) {
      setConnectError("");
    }

    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/portal/integrations/telegram-mini-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data: FetchResponse = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && typeof data?.message === "string" && data.message) || "Не удалось подключить бота");
      }
      setState(data);
      setToken("");
      setMessage(
        data?.message || (options?.viaSettings ? "Настройки Telegram Mini App обновлены" : "Telegram Mini App подключена"),
      );
      if (!options?.viaSettings) {
        setShowConnectDialog(false);
        setConnectToken("");
      }
    } catch (e: any) {
      const errText = String(e?.message || e);
      if (options?.viaSettings) {
        setError(errText);
      } else {
        setConnectError(errText);
      }
    } finally {
      setPending(false);
    }
  };

  const disconnect = async () => {
    setActionPending(true);
    setError("");
    try {
      const res = await fetch("/api/portal/integrations/telegram-mini-app", { method: "DELETE" });
      const data: FetchResponse = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && typeof data?.message === "string" && data.message) || "Не удалось отключить интеграцию");
      }
      setState(data);
      setToken("");
      setMessage(data?.message || "Интеграция отключена");
      setShowConnectDialog(false);
      setConnectToken("");
      setConnectError("");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setActionPending(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/portal/integrations/telegram-mini-app/check", { method: "POST" });
      const data: FetchResponse = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && typeof data?.message === "string" && data.message) || "Не удалось проверить подключение");
      }
      setState(data);
      setMessage(data?.message || (data.connectionHealthy ? "Подключение к боту работает" : "Подключение к боту не удалось"));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setChecking(false);
    }
  };

  const copyLink = async () => {
    if (!state?.botLink) return;
    try {
      await navigator.clipboard.writeText(state.botLink);
      setMessage("Ссылка на бота скопирована в буфер обмена");
    } catch (e) {
      setError("Не удалось скопировать ссылку");
    }
  };

  const statusLabel = isEnabled ? "Подключена" : "Не подключена";
  const statusColor = isEnabled ? "#22c55e" : "rgba(148,163,184,0.45)";
  const connectionLabel = !isEnabled
    ? "Telegram Mini App отключена"
    : connectionOk
    ? "Подключение к боту работает"
    : "Подключение к боту не удалось";
  const connectionColor = !isEnabled ? "rgba(148,163,184,0.45)" : connectionOk ? "#22c55e" : "#f87171";

  const openConnectDialog = () => {
    setConnectToken("");
    setConnectError("");
    setShowConnectDialog(true);
  };

  const actionButton = (
    <Button
      onClick={isEnabled ? disconnect : openConnectDialog}
      disabled={actionPending || loading || showConnectDialog}
      style={{
        padding: "10px 22px",
        background: isEnabled ? "#ef4444" : "#22c55e",
        color: "#0f172a",
        fontWeight: 600,
      }}
    >
      {actionPending ? "Сохранение..." : isEnabled ? "Отключить" : "Подключить"}
    </Button>
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {loading ? (
        <Skeleton height={320} />
      ) : (
        <Card>
          <CardBody>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) 1fr", gap: 32, alignItems: "center" }}>
              <div
                style={{
                  width: 240,
                  height: 240,
                  borderRadius: "24px",
                  background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(15,23,42,0.85))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="180" height="180" viewBox="0 0 96 96" aria-hidden="true">
                  <circle cx="48" cy="48" r="48" fill="#1d9bf0" />
                  <path
                    d="M70.9 30.3 63.3 62c-.6 2.2-2.2 2.6-4.1 1.6l-10.9-8-5.4 5.1c-.5.6-1 .9-1.9.9l.7-11.4 20.6-18.5c1-.9-.1-1.3-1.5-.6L31 45.6l-11-3.5c-2.3-.7-2.5-2.1.6-3.1L69 26.8c2-.7 3.7.4 3.2 3.5Z"
                    fill="#fff"
                  />
                </svg>
              </div>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>Telegram Mini App</div>
                    <div style={{ fontSize: 15, opacity: 0.75 }}>Программа лояльности в мини-приложении Telegram</div>
                  </div>
                  <StatusBadge color={statusColor} label={statusLabel} />
                </div>
                {isEnabled && state?.botUsername && (
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    Подключен бот: <strong>{state.botUsername}</strong>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>{actionButton}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {message && <div style={{ fontSize: 13, color: "#34d399" }}>{message}</div>}
      {error && <div style={{ fontSize: 13, color: "#f87171" }}>{error}</div>}

      <div
        style={{
          border: "1px dashed rgba(148,163,184,0.35)",
          borderRadius: 16,
          padding: 32,
          minHeight: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          opacity: 0.75,
        }}
      >
        Место для скриншотов мини-приложения
      </div>

      {isEnabled && (
        <Card>
          <CardHeader title="Настройки подключения" />
          <CardBody>
            <div style={{ display: "grid", gap: 20 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Токен Telegram-бота</label>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Введите токен из BotFather"
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.25)",
                    padding: "10px 14px",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    fontSize: 14,
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Токен, полученный от BotFather, обычно это набор букв и цифр например: {TOKEN_HINT}
                </div>
                {state?.tokenMask && (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Последний проверенный токен: {state.tokenMask}</div>
                )}
                <div style={{ display: "flex", gap: 12 }}>
                  <Button
                    variant="secondary"
                    onClick={() => connect(token, { viaSettings: true })}
                    disabled={tokenSaving || !token.trim()}
                  >
                    {tokenSaving ? "Сохранение..." : "Обновить токен"}
                  </Button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 600 }}>Ссылка на Telegram-бота</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    value={state?.botLink || ""}
                    readOnly
                    placeholder="Ссылка появится после проверки бота"
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.25)",
                      background: "rgba(15,23,42,0.45)",
                      fontSize: 14,
                      opacity: state?.botLink ? 0.95 : 0.55,
                      color: "#e2e8f0",
                    }}
                  />
                  <Button variant="secondary" disabled={!state?.botLink} onClick={copyLink}>
                    Скопировать
                  </Button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                {checking ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                    <SpinnerIcon size={22} />
                    <span>Проверка подключения к боту</span>
                  </div>
                ) : (
                  <StatusBadge color={connectionColor} label={connectionLabel} />
                )}
                <Button variant="secondary" onClick={checkConnection} disabled={checking || actionPending || tokenSaving}>
                  Проверить
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardHeader title="Возможности интеграции" />
          <CardBody>
            <div style={{ display: "grid", gap: 10 }}>
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Возможности интеграции" />
          <CardBody>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 }}>
              <li>Клиент может зарегистрироваться в вашей программе лояльности по QR-коду</li>
              <li>Клиент сможет использовать бот для списания и начисления баллов</li>
              <li>Рассылки, включая текст и изображения</li>
            </ul>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardHeader title="Подключение" />
          <CardBody>
            <div style={{ display: "grid", gap: 10 }}>
              <Skeleton height={14} />
              <Skeleton height={14} width="70%" />
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Подключение" />
          <CardBody>
            <a
              href="#"
              onClick={(event) => event.preventDefault()}
              style={{ color: "#38bdf8", fontSize: 13 }}
            >
              Справка по регистрации и использованию бота
            </a>
          </CardBody>
        </Card>
      )}

      {showConnectDialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => {
            if (!actionPending) {
              setShowConnectDialog(false);
              setConnectError("");
            }
          }}
        >
          <div
            style={{
              width: "min(480px, 100%)",
              borderRadius: 20,
              background: "#0f172a",
              border: "1px solid rgba(148,163,184,0.25)",
              padding: 24,
              display: "grid",
              gap: 16,
              boxShadow: "0 22px 44px rgba(15,23,42,0.45)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 20, fontWeight: 700 }}>Подключение Telegram Mini App</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Введите токен Telegram-бота, который вы получили от BotFather. Мы проверим его и активируем интеграцию.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Токен Telegram-бота</label>
              <input
                value={connectToken}
                onChange={(event) => setConnectToken(event.target.value)}
                autoFocus
                placeholder={TOKEN_HINT}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  padding: "10px 14px",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  fontSize: 14,
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.65 }}>
                Например: {TOKEN_HINT}
              </div>
              {connectError && <div style={{ fontSize: 12, color: "#f87171" }}>{connectError}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowConnectDialog(false);
                  setConnectError("");
                }}
                disabled={actionPending}
              >
                Отмена
              </Button>
              <Button
                onClick={() => connect(connectToken)}
                disabled={actionPending}
                style={{ minWidth: 140, background: "#22c55e", color: "#0f172a", fontWeight: 600 }}
              >
                {actionPending ? "Сохранение..." : "Подключить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
