export default function WebhooksDocPage() {
  return (
    <div>
      <h2>Документация по вебхукам</h2>
      <p>События отправляются на ваш <b>Webhook URL</b> с подписью <code>HMAC-SHA256</code> в заголовке <code>X-Loyalty-Signature</code>:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`X-Loyalty-Signature: v1,ts=1699999999,sig=BASE64_HMAC`}</pre>
      <p>Где:</p>
      <ul>
        <li><b>v1</b> — версия схемы подписи;</li>
        <li><b>ts</b> — UNIX‑время (секунды);</li>
        <li><b>sig</b> — Base64(HMAC_SHA256(secret, ts + '.' + body)).</li>
      </ul>
      <p>Также передаются заголовки:</p>
      <ul>
        <li><code>X-Merchant-Id</code> — идентификатор мерчанта;</li>
        <li><code>X-Signature-Timestamp</code> — дублирование ts;</li>
        <li><code>X-Signature-Key-Id</code> — идентификатор ключа (если задан);</li>
        <li><code>X-Event-Id</code> — ID события в outbox.</li>
      </ul>
      <h3>Проверка подписи</h3>
      <ol>
        <li>Извлеките <code>ts</code> и <code>sig</code> из заголовка.</li>
        <li>Убедитесь, что |now - ts| ≤ 300 секунд.</li>
        <li>Вычислите <code>calc = Base64(HMAC_SHA256(secret, ts + '.' + rawBody))</code>.</li>
        <li>Сравните <code>calc === sig</code>. При ротации ключей используйте <i>current</i> или <i>next</i> секрет.</li>
      </ol>
      <h3>Пример (Node.js)</h3>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`import { createHmac } from 'crypto';
export function verify(headers: any, rawBody: string, secret: string) {
  const header = headers['x-loyalty-signature'] || headers['X-Loyalty-Signature'];
  if (!header || !header.startsWith('v1,')) return false;
  const parts = Object.fromEntries(header.split(',').slice(1).map((s:string)=>s.split('=')));
  const ts = parts.ts; const sig = parts.sig;
  if (!ts || !sig) return false;
  const skew = Math.abs(Math.floor(Date.now()/1000) - Number(ts));
  if (skew > 300) return false;
  const calc = createHmac('sha256', secret).update(ts + '.' + rawBody).digest('base64');
  return calc === sig;
}`}</pre>
      <h3>События</h3>
      <ul>
        <li><code>loyalty.commit</code> — фиксация операции (поля: orderId, receiptId, redeemApplied, earnApplied, ...).</li>
        <li><code>loyalty.refund</code> — возврат (поля: orderId, share, pointsRestored, pointsRevoked, ...).</li>
        <li><code>loyalty.points_ttl.preview</code> — превью сгорания баллов.</li>
        <li><code>loyalty.earnlot.*</code> — события лотов начислений (если включено)</li>
      </ul>
      <p>Полный формат payload смотрите в Swagger (<code>/docs</code>) и в событиях outbox.</p>
    </div>
  );
}

