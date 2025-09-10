export default function IntegrationDocsPage() {
  return (
    <div>
      <h2>Интеграции (POS / CRM)</h2>
      <h3>POS через Bridge</h3>
      <ol>
        <li>Установите POS Bridge на кассовый ПК (см. infra/bridge.service.example).</li>
        <li>Настройте: API_BASE, MERCHANT_ID, BRIDGE_SECRET, STAFF_KEY (опц.).</li>
        <li>Включите «Требовать подпись Bridge» в настройках мерчанта.</li>
      </ol>
      <p>Протокол:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`POST http://127.0.0.1:18080/quote
{ "mode":"redeem","merchantId":"M-1","orderId":"O-1","total":1000,"eligibleTotal":1000,"userToken":"<jwt|id>" }
→ { canRedeem, discountToApply, finalPayable, holdId }

POST http://127.0.0.1:18080/commit
{ "merchantId":"M-1","holdId":"...","orderId":"O-1","receiptNumber":"000001" }
→ { ok, receiptId, earnApplied, redeemApplied }
`}</pre>
      <h3>Прямая интеграция (без Bridge)</h3>
      <p>Подписывайте запросы HMAC‑заголовком <code>X-Bridge-Signature</code> и используйте <code>Idempotency-Key</code> на commit/refund.</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`const body = JSON.stringify({...});
const sig = sign(secret, body); // v1,ts=...,sig=...
fetch(API_BASE + '/loyalty/commit', { method:'POST', headers:{ 'X-Bridge-Signature': sig, 'Idempotency-Key': 'commit:M-1:O-1' }, body });
`}</pre>
      <h3>CRM‑виджет</h3>
      <p>Сервер CRM вызывает API от имени мерчанта: баланс, история, поиск клиента по телефону.</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`GET /merchants/:id/customer/summary?customerId=...
GET /merchants/:id/customer/search?phone=+7999...
`}</pre>
      <h3>Frontol / 1С — алгоритм скидки/начислений</h3>
      <p>Применение скидки (REDEEM):</p>
      <ol>
        <li>Перед закрытием чека посчитайте общую сумму (<code>total</code>) и сумму, подходящую под правила (<code>eligibleTotal</code>).</li>
        <li>Получите <code>userToken</code> из QR (JWT) или ID клиента.</li>
        <li>Вызовите <code>POST /loyalty/quote</code> с <code>{`{mode:'redeem', merchantId, orderId, total, eligibleTotal, userToken}`}</code>.</li>
        <li>Если <code>canRedeem</code> и есть <code>holdId</code>, уменьшите сумму чека на <code>discountToApply</code> и отобразите клиенту.</li>
        <li>После успешной оплаты вызовите <code>POST /loyalty/commit</code> с <code>holdId</code>, <code>orderId</code>, <code>receiptNumber</code>. Передайте заголовок <code>Idempotency-Key</code> вида <code>commit:{`{merchantId}`}:{`{orderId}`}</code>.</li>
      </ol>
      <p>Начисление (EARN):</p>
      <ol>
        <li>Перед закрытием чека вызовите <code>POST /loyalty/quote</code> c <code>mode:'earn'</code>.</li>
        <li>После оплаты — <code>POST /loyalty/commit</code>. Идемпотентность обязательна.</li>
      </ol>
      <p>Пример JSON запроса:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`{
  "mode": "redeem",
  "merchantId": "M-1",
  "orderId": "O-123",
  "total": 1500,
  "eligibleTotal": 1200,
  "userToken": "<JWT из QR>"
}`}</pre>
      <p>Важно: при включённой подписи Bridge добавляйте заголовок <code>X-Bridge-Signature</code>, а при commit/refund всегда передавайте <code>Idempotency-Key</code>.</p>

      <h3>SDK TypeScript</h3>
      <p>Используйте пакет <code>@loyalty/sdk-ts</code> (минимальный):</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`import { LoyaltyApi } from '@loyalty/sdk-ts';
const api = new LoyaltyApi({ baseUrl: 'http://localhost:3000' });
const q = await api.quote({ mode:'redeem', merchantId:'M-1', userToken:'...', orderId:'O-1', total:1000, eligibleTotal:1000 }, { staffKey: '...', bridgeSignatureSecret: '...' });
const c = await api.commit({ merchantId:'M-1', holdId:q.holdId!, orderId:'O-1' }, { idempotencyKey:'commit:M-1:O-1' });
`}</pre>
    </div>
  );
}
