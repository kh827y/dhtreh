'use client';
import Link from 'next/link';

export default function BridgeDocs() {
  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>POS Bridge (локальный сервис)</h1>
      <p>
        Локальный агент, слушающий <code>http://127.0.0.1:18080</code> и принимающий JSON с составом чека.
        Возвращает скидку/начисление, вызывает API лояльности и обеспечивает оффлайн‑очередь.
      </p>
      <h3>Эндпоинты</h3>
      <ul>
        <li>
          <b>POST /quote</b> — вход: <code>{'{ merchantId, orderId, total, eligibleTotal, userToken? }'}</code>;
          выход: <code>{'{ discountToApply|pointsToEarn, holdId }'}</code>
        </li>
        <li>
          <b>POST /commit</b> — вход: <code>{'{ merchantId, holdId, orderId, receiptNumber? }'}</code>;
          выход: <code>{'{ ok }'}</code>
        </li>
        <li><b>POST /queue/flush</b> — принудительно отправить отложенные операции</li>
      </ul>
      <h3>Безопасность</h3>
      <p>Локальная подпись запросов к API: заголовок <code>X-Bridge-Signature</code> HMAC_SHA256(secret, ts + '.' + body), где secret хранится на устройстве.</p>
      <h3>Идемпотентность</h3>
      <p>Bridge устанавливает заголовок <code>Idempotency-Key</code> при commit/refund, чтобы повтор при сетевых ошибках не дублировал операцию.</p>
      <div style={{ marginTop: 12 }}>
        <Link href="/">← Настройки</Link>
      </div>
    </main>
  );
}
