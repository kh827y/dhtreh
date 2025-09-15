'use client';
import Link from 'next/link';

export default function SignatureDocs() {
  return (
    <main style={{ maxWidth: 820, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Подпись ответов и вебхуков (v1)</h1>
      <p>
        Сервер подписывает ответы commit/refund и вебхуки HMAC SHA-256.
        Строка для подписи: <code>ts + '.' + body</code>, где <code>ts</code> — Unix-время (секунды),
        а <code>body</code> — JSON-строка (точно в том виде, как отправлена).
      </p>
      <h3>Заголовки</h3>
      <ul>
        <li><code>X-Loyalty-Signature</code>: <code>v1,ts=...,sig=base64(...)</code></li>
        <li><code>X-Signature-Timestamp</code>: Unix-время</li>
        <li><code>X-Merchant-Id</code>: идентификатор мерчанта</li>
        <li><code>X-Signature-Key-Id</code>: (опц.) идентификатор ключа</li>
        <li><code>X-Event-Id</code>: (в вебхуках) идентификатор события</li>
      </ul>
      <h3>Проверка (Node.js)</h3>
      <pre style={{ background: '#fafafa', padding: 10, overflow: 'auto' }}>
{`import crypto from 'crypto';

function verify(headers, body, secret) {
  const ts = headers['x-signature-timestamp'];
  const sigHeader = headers['x-loyalty-signature'] || '';
  if (!ts || !sigHeader.startsWith('v1,')) return false;
  const sig = Object.fromEntries(sigHeader.split(',').slice(1).map(x => x.split('=')));
  const calc = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('base64');
  const ok = crypto.timingSafeEqual(Buffer.from(sig.sig||'', 'utf8'), Buffer.from(calc, 'utf8'));
  const skewOk = Math.abs(Math.floor(Date.now()/1000) - Number(ts)) <= 300; // 5 минут
  return ok && skewOk;
}`}
      </pre>
      <p>
        Рекомендуется проверять окно времени ±5 минут и учитывать <code>X-Signature-Key-Id</code> для ротации ключей.
      </p>
      <div style={{ marginTop: 12 }}>
        <Link href="/">← Настройки</Link>
      </div>
    </main>
  );
}

