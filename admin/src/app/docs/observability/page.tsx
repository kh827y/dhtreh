export default function ObservabilityDocs() {
  return (
    <div>
      <h2>Наблюдаемость и алерты</h2>
      <p>Основной стек: Prometheus + Grafana + Telegram-бот алертов. Sentry включаем только на проде, OpenTelemetry оставляем опциональным для точечной отладки.</p>

      <h3>Метрики Prometheus</h3>
      <ul>
        <li><code>http_requests_total</code> и <code>http_request_duration_seconds_bucket</code> — ошибки/латентность по методам и маршрутам.</li>
        <li><code>loyalty_outbox_pending</code>, <code>loyalty_outbox_dead_total</code>, <code>loyalty_outbox_events_total</code> — очередь вебхуков и исходящие события.</li>
        <li><code>loyalty_quote_requests_total</code> / <code>loyalty_commit_requests_total</code> / <code>loyalty_refund_requests_total</code> с лейблом <code>result</code>.</li>
        <li><code>pos_requests_total</code>, <code>pos_errors_total</code>, <code>pos_webhooks_total</code> — интеграции касс.</li>
      </ul>

      <h3>Telegram-алерты</h3>
      <ul>
        <li>ENV: <code>ALERT_TELEGRAM_BOT_TOKEN</code>, <code>ALERT_TELEGRAM_CHAT_ID</code>, сэмплинг 5xx — <code>ALERTS_5XX_SAMPLE_RATE</code>.</li>
        <li>Пороги мониторинга: <code>ALERT_OUTBOX_PENDING_THRESHOLD</code>, <code>ALERT_OUTBOX_DEAD_THRESHOLD</code>, <code>ALERT_WORKER_STALE_MINUTES</code>.</li>
        <li>В админке есть раздел «Наблюдаемость»: статус бота, последние инциденты, срабатывания по воркерам/очередям.</li>
      </ul>

      <h3>Grafana (рекомендации)</h3>
      <ul>
        <li>Дашборды RPS/latency с фильтром route и сравнениями по 4xx/5xx.</li>
        <li>Outbox: backlog, DEAD, rate-limited, breaker open, время доставки.</li>
        <li>Quote/Commit/Refund: успешные/ошибки, p95 latency.</li>
        <li>POS-интеграции: webhooks и ошибки по провайдерам.</li>
      </ul>
    </div>
  );
}
