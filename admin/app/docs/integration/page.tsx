export default function IntegrationDocsPage() {
  return (
    <div>
      <h2>Интеграции (POS / CRM)</h2>
      <h3>Интеграция через REST API</h3>
      <p>Для подключения кассы или внешней системы используйте REST API с заголовком <code>X-Api-Key</code>. Для commit/refund всегда передавайте <code>Idempotency-Key</code>, чтобы избежать повторных операций.</p>
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
      <p>Важно: при commit/refund всегда передавайте <code>Idempotency-Key</code>, чтобы избежать дублей.</p>

      <h3>SDK TypeScript</h3>
      <p>Используйте пакет <code>@loyalty/sdk-ts</code> (минимальный):</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`import { LoyaltyApi } from '@loyalty/sdk-ts';
const api = new LoyaltyApi({ baseUrl: 'http://localhost:3000' });
const q = await api.quote({ mode:'redeem', merchantId:'<merchant_id>', userToken:'...', orderId:'O-1', total:1000, positions:[{ externalId:'SKU-1', qty:1, price:1000 }] });
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
