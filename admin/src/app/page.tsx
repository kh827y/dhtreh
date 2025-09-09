'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [earnBps, setEarnBps] = useState<number>(500);
  const [redeemLimitBps, setRedeemLimitBps] = useState<number>(5000);
  const [msg, setMsg] = useState<string>('');
  const [qrTtlSec, setQrTtlSec] = useState<number>(120);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [webhookKeyId, setWebhookKeyId] = useState<string>('');
  const [webhookSecretNext, setWebhookSecretNext] = useState<string>('');
  const [webhookKeyIdNext, setWebhookKeyIdNext] = useState<string>('');
  const [useWebhookNext, setUseWebhookNext] = useState<boolean>(false);
  const [redeemCooldownSec, setRedeemCooldownSec] = useState<number>(0);
  const [earnCooldownSec, setEarnCooldownSec] = useState<number>(0);
  const [redeemDailyCap, setRedeemDailyCap] = useState<number>(0);
  const [earnDailyCap, setEarnDailyCap] = useState<number>(0);
  const [requireJwtForQuote, setRequireJwtForQuote] = useState<boolean>(false);
  const [rulesJson, setRulesJson] = useState<string>('[\n  {\n    "if": { "channelIn": ["VIRTUAL"], "weekdayIn": [1,2,3,4,5] },\n    "then": { "earnBps": 600 }\n  }\n]');
  const [requireBridgeSig, setRequireBridgeSig] = useState<boolean>(false);
  const [bridgeSecret, setBridgeSecret] = useState<string>('');
  const [bridgeSecretNext, setBridgeSecretNext] = useState<string>('');
  const [requireStaffKey, setRequireStaffKey] = useState<boolean>(false);
  const [pointsTtlDays, setPointsTtlDays] = useState<number>(0);
  const [rulesCheck, setRulesCheck] = useState<string>('');

  const earnPct = useMemo(() => (earnBps/100).toFixed(2), [earnBps]);
  const redeemPct = useMemo(() => (redeemLimitBps/100).toFixed(2), [redeemLimitBps]);

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/settings`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setEarnBps(data.earnBps);
      setRedeemLimitBps(data.redeemLimitBps);
      if (typeof data.qrTtlSec === 'number') setQrTtlSec(data.qrTtlSec);
      setWebhookUrl(data.webhookUrl || '');
      setWebhookSecret(data.webhookSecret || '');
      setWebhookKeyId(data.webhookKeyId || '');
      setWebhookSecretNext(data.webhookSecretNext || '');
      setWebhookKeyIdNext(data.webhookKeyIdNext || '');
      setUseWebhookNext(Boolean(data.useWebhookNext));
      setRedeemCooldownSec(Number(data.redeemCooldownSec || 0));
      setEarnCooldownSec(Number(data.earnCooldownSec || 0));
      setRedeemDailyCap(Number(data.redeemDailyCap || 0));
      setEarnDailyCap(Number(data.earnDailyCap || 0));
      setRequireJwtForQuote(Boolean(data.requireJwtForQuote));
      if (data.rulesJson) setRulesJson(JSON.stringify(data.rulesJson, null, 2));
      setRequireBridgeSig(Boolean(data.requireBridgeSig));
      setBridgeSecret(data.bridgeSecret || '');
      setBridgeSecretNext(data.bridgeSecretNext || '');
      setRequireStaffKey(Boolean(data.requireStaffKey));
      setPointsTtlDays(Number(data.pointsTtlDays || 0));
    } catch (e: any) {
      setMsg('Ошибка загрузки: ' + e?.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ earnBps, redeemLimitBps, qrTtlSec, webhookUrl, webhookSecret, webhookKeyId, webhookSecretNext, webhookKeyIdNext, useWebhookNext, redeemCooldownSec, earnCooldownSec, redeemDailyCap, earnDailyCap, requireJwtForQuote, rulesJson: JSON.parse(rulesJson||'null'), requireBridgeSig, bridgeSecret, bridgeSecretNext, requireStaffKey, pointsTtlDays }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setMsg(`Сохранено: начисление ${data.earnBps/100}% | лимит ${data.redeemLimitBps/100}%`);
    } catch (e: any) {
      setMsg('Ошибка сохранения: ' + e?.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 560, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Настройки мерчанта</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <a href="/outbox">Outbox</a>
        <a href="/outlets">Outlets</a>
        <a href="/devices">Devices</a>
        <a href="/staff">Staff</a>
        <a href="/docs/signature">Signature</a>
        <a href="/docs/rotation">Rotation</a>
        <a href="/txns">Txns</a>
        <a href="/ledger">Ledger</a>
        <a href="/receipts">Receipts</a>
        <a href="/docs/bridge">Bridge</a>
        <a href="/metrics">Metrics</a>
        <a href="/bridge-status">Bridge Status</a>
      </div>
      <div style={{ color: '#666' }}>Merchant: <code>{MERCHANT}</code></div>

      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label>
          Начисление (basis points):
          <input type="number" min={0} max={10000} value={earnBps}
                 onChange={(e) => setEarnBps(Math.max(0, Math.min(10000, Number(e.target.value))))}
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>= {earnPct}% от базы</div>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireJwtForQuote} onChange={(e) => setRequireJwtForQuote(e.target.checked)} /> Требовать JWT для QUOTE
        </label>

        <label>
          Правила (JSON):
          <textarea value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} rows={8} style={{ width: '100%', padding: 8, fontFamily: 'monospace' }} />
          <div style={{ color: '#666', fontSize: 12 }}>Пример: массив правил с условиями channelIn/weekdayIn/minEligible и действиями earnBps/redeemLimitBps</div>
        </label>
        <div style={{ display:'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => {
            try {
              const parsed = JSON.parse(rulesJson||'null');
              if (!Array.isArray(parsed)) throw new Error('Должен быть массив правил');
              for (const [i, it] of parsed.entries()) {
                if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error(`Правило #${i+1}: ожидался объект`);
                if ('if' in it && (typeof it.if !== 'object' || Array.isArray(it.if))) throw new Error(`Правило #${i+1}: if должен быть объектом`);
                if ('then' in it && (typeof it.then !== 'object' || Array.isArray(it.then))) throw new Error(`Правило #${i+1}: then должен быть объектом`);
                const allowedIf = ['channelIn','weekdayIn','minEligible','categoryIn'];
                if (it.if) {
                  for (const k of Object.keys(it.if)) if (!allowedIf.includes(k)) throw new Error(`Правило #${i+1}: неизвестное условие '${k}'`);
                }
                const allowedThen = ['earnBps','redeemLimitBps'];
                if (it.then) {
                  for (const k of Object.keys(it.then)) if (!allowedThen.includes(k)) throw new Error(`Правило #${i+1}: неизвестное действие '${k}'`);
                }
              }
              setRulesCheck('OK: правила валидны');
            } catch (e: any) {
              setRulesCheck('Ошибка правил: ' + (e?.message||e));
            }
          }} style={{ padding:'6px 10px' }}>Проверить правила</button>
          {rulesCheck && <span style={{ color: rulesCheck.startsWith('OK')?'#0a0':'#b00' }}>{rulesCheck}</span>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireJwtForQuote} onChange={(e) => setRequireJwtForQuote(e.target.checked)} /> Требовать JWT для QUOTE
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireBridgeSig} onChange={(e) => setRequireBridgeSig(e.target.checked)} /> Требовать подпись Bridge
        </label>

        <label>
          Лимит списания (basis points):
          <input type="number" min={0} max={10000} value={redeemLimitBps}
                 onChange={(e) => setRedeemLimitBps(Math.max(0, Math.min(10000, Number(e.target.value))))}
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>= {redeemPct}% от базы</div>
        </label>

        <label>
          Bridge Secret (merchant-level):
          <input value={bridgeSecret} onChange={(e) => setBridgeSecret(e.target.value)} placeholder="секрет Bridge"
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>Для проверки входящих запросов Bridge (если нет секретов на устройствах)</div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireBridgeSig} onChange={(e) => setRequireBridgeSig(e.target.checked)} /> Требовать подпись Bridge
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireStaffKey} onChange={(e) => setRequireStaffKey(e.target.checked)} /> Требовать ключ кассира (X‑Staff‑Key)
        </label>

        <label>
          QR TTL (секунды):
          <input type="number" min={15} max={600} value={qrTtlSec}
                 onChange={(e) => setQrTtlSec(Math.max(15, Math.min(600, Number(e.target.value))))}
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>Минимум 15 сек; мини‑аппа обновляет QR за 2/3 TTL</div>
        </label>

        <label>
          Webhook URL:
          <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..."
                 style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          Webhook Secret:
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="секрет для подписи"
                   style={{ width: '100%', padding: 8 }} />
            <button type="button" onClick={() => {
              const s = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,'0')).join('');
              setWebhookSecret(s);
            }} style={{ padding: '8px 12px' }}>Generate</button>
          </div>
          <div style={{ color: '#666', fontSize: 12 }}>Подпись: HMAC_SHA256(ts + '.' + body), заголовок X-Loyalty-Signature</div>
        </label>
        <label>
          Webhook Key ID:
          <input value={webhookKeyId} onChange={(e) => setWebhookKeyId(e.target.value)} placeholder="kid"
                 style={{ width: '100%', padding: 8 }} />
        </label>
        <div style={{ borderTop: '1px dashed #ddd', margin: '8px 0' }} />
        <label>
          Webhook Secret (next):
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={webhookSecretNext} onChange={(e) => setWebhookSecretNext(e.target.value)} placeholder="секрет следующего ключа"
                   style={{ width: '100%', padding: 8 }} />
            <button type="button" onClick={() => {
              const s = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,'0')).join('');
              setWebhookSecretNext(s);
            }} style={{ padding: '8px 12px' }}>Generate</button>
          </div>
        </label>
        <label>
          Webhook Key ID (next):
          <input value={webhookKeyIdNext} onChange={(e) => setWebhookKeyIdNext(e.target.value)} placeholder="kid-next"
                 style={{ width: '100%', padding: 8 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={useWebhookNext} onChange={(e) => setUseWebhookNext(e.target.checked)} /> Использовать следующий ключ для подписи (ротация)
        </label>
        <label>
          Webhook Key ID (kid):
          <input value={webhookKeyId} onChange={(e) => setWebhookKeyId(e.target.value)} placeholder="идентификатор ключа"
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>Отправляется в заголовке X-Signature-Key-Id</div>
        </label>

        <label>
          Bridge Secret (merchant-level):
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={bridgeSecret} onChange={(e) => setBridgeSecret(e.target.value)} placeholder="секрет Bridge"
                   style={{ width: '100%', padding: 8 }} />
            <button type="button" onClick={() => {
              const s = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,'0')).join('');
              setBridgeSecret(s);
            }} style={{ padding: '8px 12px' }}>Generate</button>
          </div>
          <div style={{ color: '#666', fontSize: 12 }}>Для проверки входящих запросов Bridge (если нет секретов на устройствах)</div>
        </label>
        <label>
          Bridge Secret (next):
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={bridgeSecretNext} onChange={(e) => setBridgeSecretNext(e.target.value)} placeholder="следующий секрет Bridge"
                   style={{ width: '100%', padding: 8 }} />
            <button type="button" onClick={() => {
              const s = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,'0')).join('');
              setBridgeSecretNext(s);
            }} style={{ padding: '8px 12px' }}>Generate</button>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={requireBridgeSig} onChange={(e) => setRequireBridgeSig(e.target.checked)} /> Требовать подпись Bridge
        </label>

        <label>
          Правила (JSON):
          <textarea value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} rows={8} style={{ width: '100%', padding: 8, fontFamily: 'monospace' }} />
          <div style={{ color: '#666', fontSize: 12 }}>Пример: массив правил с условиями channelIn/weekdayIn/minEligible и действиями earnBps/redeemLimitBps</div>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Кулдаун списаний (сек):
            <input type="number" min={0} max={86400} value={redeemCooldownSec}
                   onChange={(e) => setRedeemCooldownSec(Math.max(0, Math.min(86400, Number(e.target.value))))}
                   style={{ width: '100%', padding: 8 }} />
          </label>
          <label style={{ flex: 1 }}>
            Кулдаун начислений (сек):
            <input type="number" min={0} max={86400} value={earnCooldownSec}
                   onChange={(e) => setEarnCooldownSec(Math.max(0, Math.min(86400, Number(e.target.value))))}
                   style={{ width: '100%', padding: 8 }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            TTL баллов (дни):
            <input type="number" min={0} value={pointsTtlDays}
                   onChange={(e) => setPointsTtlDays(Math.max(0, Number(e.target.value)))}
                   style={{ width: '100%', padding: 8 }} />
            <div style={{ color: '#666', fontSize: 12 }}>Предпросмотр истечения пишется в Outbox (loyalty.points_ttl.preview). Списание выключено.</div>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Дневной лимит списаний (баллы):
            <input type="number" min={0} value={redeemDailyCap}
                   onChange={(e) => setRedeemDailyCap(Math.max(0, Number(e.target.value)))}
                   style={{ width: '100%', padding: 8 }} />
          </label>
          <label style={{ flex: 1 }}>
            Дневной лимит начислений (баллы):
            <input type="number" min={0} value={earnDailyCap}
                   onChange={(e) => setEarnDailyCap(Math.max(0, Number(e.target.value)))}
                   style={{ width: '100%', padding: 8 }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={load} disabled={loading} style={{ padding: '8px 16px' }}>Обновить</button>
          <button onClick={save} disabled={loading} style={{ padding: '8px 16px' }}>Сохранить</button>
        </div>

        {msg && <div style={{ color: '#333' }}>{msg}</div>}
      </div>

      <p style={{ marginTop: 24, color: '#888', fontSize: 12 }}>
        * Для локалки ключ админа передаётся с клиента. В проде используйте серверный прокси/route handler, чтобы скрыть ключ.
      </p>
    </main>
  );
}
