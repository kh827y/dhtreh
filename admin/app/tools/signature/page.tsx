"use client";
import { useState } from 'react';

export default function SignatureTool() {
  const [secret, setSecret] = useState('');
  const [body, setBody] = useState(`{
  "merchantId": "M-1",
  "holdId": "H-123",
  "orderId": "O-1"
}`);
  const [ts, setTs] = useState<string>(() => Math.floor(Date.now()/1000).toString());
  const [sig, setSig] = useState<string>('');
  const [verifyHeader, setVerifyHeader] = useState<string>('');
  const [verifyBody, setVerifyBody] = useState<string>('');
  const [verifySecret, setVerifySecret] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<string>('');

  const compute = async () => {
    try {
      const b = body.trim();
      JSON.parse(b); // только проверка валидности
      const header = await sign(secret, b, ts);
      setSig(header);
    } catch (e:any) { setSig('Ошибка JSON: ' + (e.message||e)); }
  };

  const verify = async () => {
    try {
      const ok = await verifyHeaderHmac(verifyHeader, verifyBody, verifySecret);
      setVerifyResult(ok ? 'Подпись валидна' : 'Подпись НЕ валидна');
    } catch (e:any) { setVerifyResult('Ошибка проверки: ' + (e.message||e)); }
  };

  return (
    <div>
      <h2>Инструмент подписи (X-Bridge-Signature)</h2>
      <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
        <div>
          <label>Секрет:</label>
          <input type="password" value={secret} onChange={e=>setSecret(e.target.value)} style={{ marginLeft: 8, width: 400 }} placeholder="bridge secret" />
        </div>
        <div>
          <label>Timestamp (sec):</label>
          <input value={ts} onChange={e=>setTs(e.target.value)} style={{ marginLeft: 8, width: 160 }} />
        </div>
        <div>
          <label>JSON‑тело:</label>
          <textarea rows={8} value={body} onChange={e=>setBody(e.target.value)} style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }} />
        </div>
        <div><button onClick={compute} style={{ padding: '6px 10px' }}>Сгенерировать подпись</button></div>
        <div>
          Заголовок: <code>{sig || '—'}</code>
        </div>
      </div>

      <hr />
      <h3>Проверка подписи</h3>
      <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
        <div>
          <label>Заголовок X-Bridge-Signature:</label>
          <input value={verifyHeader} onChange={e=>setVerifyHeader(e.target.value)} style={{ marginLeft: 8, width: 620 }} placeholder="v1,ts=...,sig=..." />
        </div>
        <div>
          <label>Секрет:</label>
          <input type="password" value={verifySecret} onChange={e=>setVerifySecret(e.target.value)} style={{ marginLeft: 8, width: 400 }} />
        </div>
        <div>
          <label>JSON‑тело:</label>
          <textarea rows={6} value={verifyBody} onChange={e=>setVerifyBody(e.target.value)} style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }} />
        </div>
        <div><button onClick={verify} style={{ padding: '6px 10px' }}>Проверить</button></div>
        <div>{verifyResult}</div>
      </div>
    </div>
  );
}

async function sign(secret: string, body: string, ts?: string) {
  if (!secret) throw new Error('Секрет обязателен');
  const t = String(ts && ts.trim() ? ts : Math.floor(Date.now()/1000));
  const mac = await hmacSha256Base64(secret, t + '.' + body);
  return `v1,ts=${t},sig=${mac}`;
}

async function verifyHeaderHmac(header: string, body: string, secret: string) {
  if (!header || !secret) return false;
  if (!header.startsWith('v1,')) return false;
  const parts = Object.fromEntries(header.split(',').slice(1).map((s:string)=>s.split('=')));
  const ts = parts.ts; const sig = parts.sig;
  if (!ts || !sig) return false;
  const skew = Math.abs(Math.floor(Date.now()/1000) - Number(ts));
  if (skew > 300) return false;
  const calc = await hmacSha256Base64(secret, ts + '.' + body);
  return calc === sig;
}

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return arrayBufferToBase64(sig);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
