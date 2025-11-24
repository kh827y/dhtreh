export default function ObservabilityDocs() {
  return (
    <div>
      <h2>Наблюдаемость и Алерты</h2>
      <h3>Метрики Prometheus</h3>
      <ul>
        <li><b>loyalty_request_duration_seconds_bucket</b>: гистограмма latency по HTTP‑запросам</li>
        <li><b>loyalty_errors_total</b>: счётчик ошибок (лейблы method, route, status)</li>
        <li><b>webhook_queue_size</b>: размер очереди вебхуков</li>
        <li><b>antifraud_blocked_total</b>: количество заблокированных антифродом операций</li>
        <li><b>loyalty_transactions_total</b>: количество транзакций лояльности</li>
      </ul>
      <h3>Примеры алертов</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`# 5xx всплеск
- alert: HighErrorRate
  expr: rate(loyalty_errors_total[5m]) > 0.1
  for: 5m
  labels: { severity: 'critical' }
  annotations:
    summary: "Высокий уровень ошибок"
    description: "Более 10% запросов завершаются ошибкой"

- alert: HighLatency
  expr: histogram_quantile(0.95, rate(loyalty_request_duration_seconds_bucket[5m])) > 0.5
  for: 10m
  labels: { severity: 'warning' }
  annotations:
    summary: "Высокая задержка API"
    description: "P95 latency превышает 500ms"

- alert: WebhookQueueGrowing
  expr: rate(webhook_queue_size[5m]) > 100
  for: 15m
  labels: { severity: 'warning' }
  annotations:
    summary: "Очередь вебхуков растет"
    description: "Очередь вебхуков растет быстрее, чем обрабатывается"

- alert: FraudDetectionHigh
  expr: rate(antifraud_blocked_total[1h]) > 10
  for: 5m
  labels: { severity: 'warning' }
  annotations:
    summary: "Высокая активность фрода"
    description: "Заблокировано более 10 транзакций за час"

- alert: NoTransactionsLongTime
  expr: increase(loyalty_transactions_total[1h]) == 0
  for: 2h
  labels: { severity: 'info' }
  annotations:
    summary: "Нет транзакций"
    description: "Нет новых транзакций более 2 часов"
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

