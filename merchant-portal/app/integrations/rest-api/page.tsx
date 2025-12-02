"use client";

import React from "react";
import { Card, CardBody, CardHeader, Button, Skeleton } from "@loyalty/ui";

type RateLimit = { limit?: number; ttl?: number };
type RateLimits = {
  code?: RateLimit;
  calculate?: RateLimit;
  bonus?: RateLimit;
  refund?: RateLimit;
};

type RestApiState = {
  enabled: boolean;
  status?: string;
  integrationId: string | null;
  apiKeyMask: string | null;
  baseUrl: string | null;
  requireBridgeSignature: boolean;
  rateLimits?: RateLimits;
  issuedAt: string | null;
  availableEndpoints?: string[];
  message?: string | null;
};

type IssueResponse = RestApiState & { apiKey?: string | null; message?: string | null };

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
      <span>{label}</span>
    </div>
  );
}

function BlockTitle({ label }: { label: string }) {
  return <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.9 }}>{label}</div>;
}

export default function RestApiIntegrationPage() {
  const [state, setState] = React.useState<RestApiState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [issuedKey, setIssuedKey] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function load() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/integrations/rest-api");
      const data: RestApiState = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && (data as any)?.message) || "Не удалось получить состояние REST API");
      }
      setState(data || null);
      setMessage((data && data.message) || "");
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

  const statusLabel = state?.enabled ? "Активна" : "Отключена";
  const statusColor = state?.enabled ? "#22c55e" : "rgba(148,163,184,0.5)";
  const bridgeLabel = state?.requireBridgeSignature ? "Требуется подпись Bridge" : "Подпись Bridge отключена";
  const bridgeColor = state?.requireBridgeSignature ? "#f97316" : "rgba(148,163,184,0.7)";

  const baseUrl = (state?.baseUrl || "").replace(/\/$/, "");
  const endpoints =
    state?.availableEndpoints?.length && state.availableEndpoints.length > 0
      ? state.availableEndpoints
      : [
          `${baseUrl || ""}/api/integrations/code`,
          `${baseUrl || ""}/api/integrations/bonus/calculate`,
          `${baseUrl || ""}/api/integrations/bonus`,
          `${baseUrl || ""}/api/integrations/refund`,
        ];

  const formatRateLimit = (rl?: RateLimit) => {
    if (!rl || typeof rl.limit !== "number" || typeof rl.ttl !== "number") return "—";
    const ttlSeconds = Math.max(1, Math.round(rl.ttl / 1000));
    return `${rl.limit} за ${ttlSeconds}с`;
  };

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Скопировано в буфер обмена");
    } catch {
      setError("Не удалось скопировать");
    }
  };

  const issueKey = async () => {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/integrations/rest-api/issue", { method: "POST" });
      const data: IssueResponse = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && data.message) || "Не удалось сгенерировать ключ");
      }
      setState(data || null);
      setIssuedKey(data?.apiKey || "");
      setMessage(data?.message || "API-ключ обновлён");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/integrations/rest-api", { method: "DELETE" });
      const data: RestApiState = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((data && (data as any)?.message) || "Не удалось отключить интеграцию");
      }
      setState(data || null);
      setIssuedKey("");
      setMessage((data && (data as any)?.message) || "Интеграция отключена");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPending(false);
    }
  };

  const actionLabel = state?.enabled ? "Перегенерировать ключ" : "Сгенерировать ключ";
  const disableLabel = state?.enabled ? "Отключить интеграцию" : "Интеграция уже выключена";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>REST API интеграция</div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          Подключите CRM/кассы по ключу. В запросах используются методы CODE, CALCULATE, BONUS, REFUND по мотивам GMB.
        </div>
      </div>

      <Card>
        <CardHeader title="API-ключ и настройки" />
        <CardBody>
          {loading ? (
            <Skeleton height={340} />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <StatusBadge label={statusLabel} color={statusColor} />
                <StatusBadge label={bridgeLabel} color={bridgeColor} />
                {state?.issuedAt && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Ключ обновлён: {new Date(state.issuedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {message && <div style={{ color: "#22c55e", fontSize: 13 }}>{message}</div>}
              {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}

              {issuedKey && (
                <div
                  style={{
                    padding: "12px 14px",
                    border: "1px dashed rgba(34,197,94,0.35)",
                    borderRadius: 10,
                    background: "rgba(34,197,94,0.08)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Новый ключ (показывается один раз)</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "monospace",
                      fontSize: 13,
                      wordBreak: "break-all",
                    }}
                  >
                    <span>{issuedKey}</span>
                    <Button size="sm" onClick={() => copy(issuedKey)} style={{ background: "#22c55e", color: "#0f172a" }}>
                      Скопировать
                    </Button>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Сохраните ключ сейчас — после обновления страницы он будет недоступен, останется только маска.
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 12,
                    padding: 14,
                    display: "grid",
                    gap: 8,
                    background: "linear-gradient(120deg, rgba(14,165,233,0.12), rgba(30,41,59,0.7))",
                  }}
                >
                  <BlockTitle label="API-ключ" />
                  <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
                    {state?.apiKeyMask || "Ключ ещё не создан"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button
                      onClick={issueKey}
                      disabled={pending}
                      style={{ background: "#22c55e", color: "#0f172a", fontWeight: 600 }}
                    >
                      {pending ? "Сохраняем..." : actionLabel}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={disable}
                      disabled={pending || !state?.enabled}
                      style={{ borderColor: "rgba(248,113,113,0.4)", color: "#fca5a5" }}
                    >
                      {pending ? "Отключение..." : disableLabel}
                    </Button>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 12,
                    padding: 14,
                    display: "grid",
                    gap: 8,
                    background: "linear-gradient(120deg, rgba(94,234,212,0.12), rgba(30,41,59,0.7))",
                  }}
                >
                  <BlockTitle label="Базовый URL REST API" />
                  <div style={{ fontSize: 13, wordBreak: "break-all" }}>
                    {baseUrl ? (
                      <span style={{ fontFamily: "monospace" }}>{baseUrl}</span>
                    ) : (
                      "Не задан в переменной окружения API_BASE_URL"
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Все запросы отправляются на этот домен: POST /api/integrations/code, /bonus/calculate, /bonus, /refund.
                  </div>
                  <div style={{ display: "grid", gap: 4, fontSize: 12, opacity: 0.9 }}>
                    {endpoints.map((ep) => (
                      <div key={ep} style={{ fontFamily: "monospace" }}>
                        {ep}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 10,
                  background: "linear-gradient(120deg, rgba(226,232,240,0.05), rgba(30,41,59,0.6))",
                }}
              >
                <BlockTitle label="Лимиты по умолчанию (переключатель на стороне интеграции)" />
                <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <div>
                    <strong>CODE</strong>: {formatRateLimit(state?.rateLimits?.code)}
                  </div>
                  <div>
                    <strong>CALCULATE</strong>: {formatRateLimit(state?.rateLimits?.calculate)}
                  </div>
                  <div>
                    <strong>BONUS</strong>: {formatRateLimit(state?.rateLimits?.bonus)}
                  </div>
                  <div>
                    <strong>REFUND</strong>: {formatRateLimit(state?.rateLimits?.refund)}
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Троттлинг привязывается к integrationId, чтобы ограничивать поток запросов от внешней системы, а не по IP.
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
