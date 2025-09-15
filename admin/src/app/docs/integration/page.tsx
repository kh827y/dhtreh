'use client';
import Link from 'next/link';

export default function IntegrationDocs() {
  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Варианты интеграции</h1>
      <p>Есть три основных способа внедрить программу лояльности:</p>

      <h3>1) Через кассовое ПО (умные кассы) — POS Bridge</h3>
      <ul>
        <li><b>Как работает:</b> локальный сервис Bridge слушает <code>http://127.0.0.1:18080</code>, касса отправляет JSON с чеком.</li>
        <li><b>Безопасность:</b> локальная подпись <code>X-Bridge-Signature</code> HMAC SHA-256.</li>
        <li><b>Надёжность:</b> оффлайн-очередь и идемпотентность (<code>Idempotency-Key</code>).</li>
        <li><b>Эндпоинты:</b> <code>/quote</code>, <code>/commit</code>, <code>/refund</code>, <code>/queue/flush</code>.</li>
      </ul>
      <div style={{ margin: '8px 0' }}>
        Подробнее: <Link href="/docs/bridge">POS Bridge</Link> и <Link href="/docs/signature">подпись</Link>.
      </div>

      <h3>2) Прямая интеграция из CRM</h3>
      <ul>
        <li><b>Как работать:</b> CRM вызывает API: <code>POST /loyalty/quote</code> → <code>POST /loyalty/commit</code>.</li>
        <li><b>Контекст:</b> передавайте <code>merchantId</code>, <code>outletId</code>, <code>deviceId</code>, <code>staffId</code> при наличии.</li>
        <li><b>Идентификатор клиента:</b> краткоживущий JWT из мини‑аппы (скан QR) или постоянный <code>customerId</code>.</li>
        <li><b>Надёжность:</b> используйте <code>Idempotency-Key</code> на <code>commit/refund</code>.</li>
        <li><b>Вебхуки:</b> настройте URL/секрет в «Настройки мерчанта», проверяйте <code>X-Loyalty-Signature</code>.</li>
      </ul>

      <h3>3) Виртуальный терминал кассира</h3>
      <ul>
        <li><b>Как работать:</b> откройте веб‑терминал кассира (папка <code>cashier</code>), сканируйте QR клиента.</li>
        <li><b>Доступ:</b> при включённом «Require Staff Key» введите токен сотрудника (заголовок <code>X-Staff-Key</code>).</li>
        <li><b>Назначение:</b> быстрый старт и демонстрации без интеграции.</li>
      </ul>

      <h3>Проверка сценариев</h3>
      <ul>
        <li>Мини‑аппа генерирует QR → кассир сканирует → <b>QUOTE</b> и <b>COMMIT</b> проходят.</li>
        <li>Вебхук приходит в вашу CRM (см. Outbox и статус доставки).</li>
        <li>Баланс/история корректно отражаются в мини‑аппе и админке.</li>
      </ul>

      <div style={{ marginTop: 12 }}>
        <Link href="/">← Настройки</Link>
      </div>
    </main>
  );
}

