export default function ObservabilityDocs() {
  return (
    <div>
      <h2>Наблюдаемость и Алерты</h2>
      <h3>Метрики Prometheus</h3>
      <ul>
        <li><b>http_requests_total</b>: лейблы method, route, status</li>
        <li><b>http_request_duration_seconds</b>: latency (histogram)</li>
        <li><b>loyalty_quote/commit/refund_requests_total</b>: result=ok/error/...</li>
        <li><b>loyalty_outbox_pending</b>, <b>loyalty_outbox_dead_total</b></li>
        <li><b>loyalty_commit/quote_latency_seconds</b></li>
      </ul>
      <h3>Примеры алертов</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`# 5xx всплеск
- alert: ApiHigh5xx
  expr: sum(increase(http_requests_total{status=~"5.."}[5m])) > 20
  for: 10m
  labels: { severity: 'page' }
  annotations:
    summary: "API 5xx > 20/5m"

# Outbox DEAD появился
- alert: OutboxDead
  expr: increase(loyalty_outbox_dead_total[10m]) > 0
  for: 5m
  labels: { severity: 'warn' }
  annotations:
    summary: "Outbox DEAD events detected"

# Outbox backlog
- alert: OutboxPendingBacklog
  expr: loyalty_outbox_pending > 100
  for: 15m
  labels: { severity: 'warn' }
  annotations:
    summary: "Outbox backlog > 100"
`}</pre>
      <h3>Grafana панели</h3>
      <ul>
        <li>RPS/latency по маршрутам</li>
        <li>Quote/Commit/Error rate</li>
        <li>Outbox backlog/SENT/FAILED/DEAD</li>
        <li>Воркеры: lastTickAt, alive</li>
      </ul>
    </div>
  );
}

