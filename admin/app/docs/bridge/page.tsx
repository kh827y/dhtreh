export default function BridgeDocsPage() {
  return (
    <div>
      <h2>POS Bridge — установка и интеграция</h2>
      <h3>Linux (systemd)</h3>
      <ol>
        <li>Скопируйте проект Bridge на кассовый ПК (Node.js 20+).</li>
        <li>Создайте сервис на основе примера: <code>infra/bridge.service.example</code>.</li>
        <li>Отредактируйте переменные: <code>API_BASE</code>, <code>MERCHANT_ID</code>, <code>BRIDGE_PORT</code>, <code>BRIDGE_SECRET</code>, <code>STAFF_KEY</code> (опц., legacy для старых интеграций).</li>
        <li>Запустите: <code>systemctl daemon-reload &amp;&amp; systemctl enable bridge &amp;&amp; systemctl start bridge</code>.</li>
      </ol>
      <h3>Windows (NSSM)</h3>
      <ol>
        <li>Установите NSSM: <a href="https://nssm.cc/download" target="_blank">nssm.cc</a>.</li>
        <li>Команда: <code>nssm install LoyaltyBridge "C:\\Program Files\\nodejs\\node.exe" "C:\\bridge\\src\\index.js"</code>.</li>
        <li>В переменные среды службы добавьте: <code>API_BASE</code>, <code>MERCHANT_ID</code>, <code>BRIDGE_PORT</code>, <code>BRIDGE_SECRET</code>, по желанию <code>STAFF_KEY</code> (legacy).</li>
        <li>Запустите службу и проверьте <code>http://127.0.0.1:18080/health</code> и <code>/config</code>.</li>
      </ol>
      <h3>mTLS (опционально)</h3>
      <p>Рекомендуется размещать Bridge за локальным reverse‑proxy (nginx) с mTLS до API.</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`# nginx (фрагмент)
server {
  listen 18081;
  ssl on; ssl_certificate /etc/ssl/cert.pem; ssl_certificate_key /etc/ssl/key.pem;
  ssl_client_certificate /etc/ssl/ca.pem; ssl_verify_client on;  # требуем клиентский сертификат
  location / {
    proxy_set_header X-Forwarded-Proto https;
    proxy_pass http://127.0.0.1:18080;
  }
}`}</pre>
      <h3>Подпись запросов</h3>
      <p>Заголовок <code>X-Bridge-Signature</code> формируется как <code>v1,ts=...,sig=Base64(HMAC_SHA256(secret, ts + '.' + body))</code>. Параметр требовать подпись Bridge (`requireBridgeSig`) включается на стороне backend/поддержки и не управляется из админ‑UI.</p>
      <p>Проверка выполняется на API с окнами времени ±5 минут и поддержкой ротации секретов.</p>
      <h3>Диагностика</h3>
      <ul>
        <li><code>/health</code> — статус.</li>
        <li><code>/metrics</code> — метрики очереди.</li>
        <li><code>/config</code> — вид конфигурации без секретов.</li>
      </ul>
    </div>
  );
}

