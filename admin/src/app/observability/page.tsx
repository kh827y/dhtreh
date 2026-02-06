"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getObservabilitySummary, sendAlertTest, type ObservabilitySummary } from "../../lib/admin";
import { useActionGuard, useLatestRequest } from "../../lib/async-guards";

function formatAgo(iso: string | null) {
  if (!iso) return "нет данных";
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s назад`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m назад`;
  return `${Math.floor(diffSec / 3600)}h назад`;
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ padding: "4px 8px", borderRadius: 999, background: color, color: "#0b1220", fontSize: 12, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div style={{ background: "#0e1629", padding: 12, borderRadius: 8, minWidth: 140 }}>
      <div style={{ opacity: 0.75, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 700, color: warn ? "#f38ba8" : "#a6e3a1", fontSize: 20 }}>{value}</div>
    </div>
  );
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilitySummary | null>(null);
  const [err, setErr] = useState<string>("");
  const [sending, setSending] = useState(false);
  const { start, isLatest } = useLatestRequest();
  const runAction = useActionGuard();

  const load = useCallback(async () => {
    const requestId = start();
    try {
      const res = await getObservabilitySummary();
      if (!isLatest(requestId)) return;
      setData(res); setErr("");
    } catch (e: unknown) {
      if (!isLatest(requestId)) return;
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [isLatest, start]);

  useEffect(() => {
    load().catch(() => {});
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const incidents = useMemo(() => {
    const list = data?.incidents || [];
    return list.slice(0, 10);
  }, [data]);

  const telemetry = data?.telemetry || { prometheus: true, grafana: true, sentry: false, otel: false };

  const sendTest = async () => {
    await runAction(async () => {
      try {
        setSending(true);
        await sendAlertTest("Проверка из админки");
        await load();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Наблюдаемость и алерты</h2>
        <div style={{ opacity: 0.8 }}>Версия: {data?.version || "…"}</div>
      </div>

      {err && <div style={{ background: "#3f1d2e", color: "#f38ba8", padding: 8, borderRadius: 6 }}>{err}</div>}

      <section style={{ background: "#0e1629", padding: 16, borderRadius: 10, border: "1px solid #1e2a44" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Алерт-бот (Telegram)</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              {data?.alerts?.enabled
                ? `Включен, чат ${data?.alerts?.chatId || "?"}, сэмплинг 5xx: ${data?.alerts?.sampleRate ?? 0}`
                : "Не настроен (ALERT_TELEGRAM_BOT_TOKEN/ALERT_TELEGRAM_CHAT_ID)"}
            </div>
          </div>
          <button onClick={sendTest} disabled={sending} style={{ background: "#89b4fa", color: "#0b1220", border: "none", borderRadius: 6, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            {sending ? "Отправка…" : "Отправить тест"}
          </button>
        </div>
        {incidents.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Последние инциденты</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>История хранится только за текущий запуск сервиса.</div>
            <div style={{ display: "grid", gap: 8 }}>
              {incidents.map((ev) => (
                <div key={ev.id} style={{ background: "#10182c", padding: 10, borderRadius: 8, border: ev.severity === "critical" ? "1px solid #f38ba8" : "1px solid #1e2a44" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Badge
                        text={ev.severity.toUpperCase()}
                        color={ev.severity === "critical" ? "#f38ba8" : ev.severity === "warn" ? "#f9e2af" : "#a6e3a1"}
                      />
                      <div style={{ fontWeight: 700 }}>{ev.title}</div>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{formatAgo(ev.at)}</div>
                  </div>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap", opacity: 0.9 }}>{ev.message}</div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                    {ev.delivered ? "Отправлено" : "Не отправлено"}{ev.throttled ? " · подавлено по частоте" : ""}{ev.error ? ` · ${ev.error}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Stat label="Outbox pending" value={data?.metrics?.outboxPending ?? 0} warn={(data?.metrics?.outboxPending ?? 0) > 0} />
        <Stat label="Outbox DEAD" value={data?.metrics?.outboxDead ?? 0} warn={(data?.metrics?.outboxDead ?? 0) > 0} />
        <Stat label="Breaker open" value={data?.metrics?.circuitOpen ?? 0} warn={(data?.metrics?.circuitOpen ?? 0) > 0} />
        <Stat label="HTTP 5xx (всего)" value={data?.metrics?.http5xx ?? 0} />
        <Stat label="HTTP 4xx (всего)" value={data?.metrics?.http4xx ?? 0} />
        <Stat label="Rate limited (всего)" value={data?.metrics?.rateLimited ?? 0} />
      </section>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: -6 }}>
        HTTP 4xx/5xx и Rate limited — накопительные значения с момента старта.
      </div>

      <section style={{ background: "#0e1629", padding: 16, borderRadius: 10, border: "1px solid #1e2a44" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Воркеры</div>
        <div style={{ display: "grid", gap: 8 }}>
          {(data?.workers || []).map((w) => (
            <div key={w.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", background: "#10182c", padding: 10, borderRadius: 8, border: w.stale ? "1px solid #f38ba8" : "1px solid #1e2a44" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{w.name}</div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>
                  {w.expected ? "Ожидается" : `Отключен (${w.reason || "флаг"})`} · тик: {formatAgo(w.lastTickAt)} · interval: {Math.round(w.intervalMs / 1000)}s
                </div>
              </div>
              <Badge
                text={w.stale ? "STALLED" : w.alive ? "OK" : "NO TICK"}
                color={w.stale ? "#f38ba8" : w.expected && w.alive ? "#a6e3a1" : "#f9e2af"}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#0e1629", padding: 16, borderRadius: 10, border: "1px solid #1e2a44" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Инструменты наблюдаемости</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Badge text="Prometheus" color={telemetry.prometheus ? "#a6e3a1" : "#f38ba8"} />
          <Badge text="Grafana" color={telemetry.grafana ? "#a6e3a1" : "#f38ba8"} />
          <Badge text={`Sentry ${telemetry.sentry ? "on" : "off"}`} color={telemetry.sentry ? "#a6e3a1" : "#f9e2af"} />
          <Badge text={`OTel ${telemetry.otel ? "on" : "off"}`} color={telemetry.otel ? "#a6e3a1" : "#f9e2af"} />
        </div>
        <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13, lineHeight: 1.5 }}>
          Рекомендуется держать Prometheus + Grafana как основной стек. Telegram-бот покрывает живые инциденты (5xx, outbox, воркеры). Sentry можно включать на проде для
          сборки трассировки ошибок, OpenTelemetry оставлен опционально для точечной отладки (по умолчанию отключён).
        </div>
      </section>
    </div>
  );
}
