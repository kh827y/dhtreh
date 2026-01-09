export default function IntegrationDocsPage() {
  return (
    <div>
      <h2>Интеграции (POS / CRM)</h2>
      <h3>POS через Bridge</h3>
      <ol>
        <li>Установите POS Bridge на кассовый ПК (см. infra/bridge.service.example).</li>
        <li>Настройте: API_BASE, MERCHANT_ID, BRIDGE_SECRET, STAFF_KEY (опц., legacy для старых интеграций).</li>
        <li>Убедитесь, что для мерчанта включён параметр требовать подпись Bridge (`requireBridgeSig`) на стороне backend/поддержки, если хотите жёстко требовать `X-Bridge-Signature`.</li>
      </ol>
      <p>Протокол:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`POST http://127.0.0.1:18080/quote
{ "mode":"redeem","merchantId":"<merchant_id>","orderId":"O-1","total":1000,"positions":[{"externalId":"SKU-1","qty":1,"price":1000}],"userToken":"<jwt|id>" }
→ { canRedeem, discountToApply, finalPayable, holdId }

POST http://127.0.0.1:18080/commit
{ "merchantId":"<merchant_id>","holdId":"...","orderId":"O-1","receiptNumber":"000001" }
→ { ok, receiptId, earnApplied, redeemApplied }
`}</pre>
      <h3>Прямая интеграция (без Bridge)</h3>
      <p>Подписывайте запросы HMAC‑заголовком <code>X-Bridge-Signature</code> и используйте <code>Idempotency-Key</code> на commit/refund.</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`const body = JSON.stringify({...});
const sig = sign(secret, body); // v1,ts=...,sig=...
fetch(API_BASE + '/loyalty/commit', { method:'POST', headers:{ 'X-Bridge-Signature': sig, 'Idempotency-Key': 'commit:<merchant_id>:O-1' }, body });
`}</pre>
      <h3>CRM‑виджет</h3>
      <p>Этот раздел относится к внутренним ручкам админки и не предназначен для внешних CRM‑интеграций.</p>
      <h3>Frontol / 1С — алгоритм скидки/начислений</h3>
      <p>Применение скидки (REDEEM):</p>
      <ol>
        <li>Перед закрытием чека посчитайте общую сумму (<code>total</code>) и передайте позиции для расчёта; исключения настраиваются в каталоге.</li>
        <li>Получите <code>userToken</code> из QR (JWT) или ID клиента.</li>
        <li>Вызовите <code>POST /loyalty/quote</code> с <code>{`{mode:'redeem', merchantId, orderId, total, positions, userToken}`}</code>.</li>
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
  "merchantId": "<merchant_id>",
  "orderId": "O-123",
  "total": 1500,
  "positions": [
    { "externalId": "SKU-1", "qty": 1, "price": 1200 },
    { "externalId": "SKU-2", "qty": 1, "price": 300 }
  ],
  "userToken": "<JWT из QR>"
}`}</pre>
      <p>Важно: при включённой подписи Bridge добавляйте заголовок <code>X-Bridge-Signature</code>, а при commit/refund всегда передавайте <code>Idempotency-Key</code>. Требование подписи Bridge (`requireBridgeSig`) включается на стороне backend и не управляется из админ‑UI.</p>

      <h3>SDK TypeScript</h3>
      <p>Используйте пакет <code>@loyalty/sdk-ts</code> (минимальный):</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`import { LoyaltyApi } from '@loyalty/sdk-ts';
const api = new LoyaltyApi({ baseUrl: 'http://localhost:3000' });
const q = await api.quote({ mode:'redeem', merchantId:'<merchant_id>', userToken:'...', orderId:'O-1', total:1000, positions:[{ externalId:'SKU-1', qty:1, price:1000 }] }, { staffKey: '...', bridgeSignatureSecret: '...' });
const c = await api.commit({ merchantId:'<merchant_id>', holdId:q.holdId!, orderId:'O-1' }, { idempotencyKey:'commit:<merchant_id>:O-1' });
`}</pre>

      <h3>Merchant → Outlet → Device / Staff</h3>
      <p>Базовая иерархия: мерчант → торговые точки (outlet) → устройства (device) и сотрудники (staff).</p>
      <ul>
        <li>Устройства создаются и настраиваются в Merchant Portal на странице торговых точек (раздел «Интеграции»).</li>
        <li>В интеграции указывается идентификатор устройства, который затем попадает в чеки/транзакции и отображается в журналах.</li>
        <li>Антифрод‑лимиты по умолчанию считаются в scope торговой точки (outlet): все устройства и сотрудники внутри точки попадают под общий лимит.</li>
      </ul>
    </div>
  );
}
