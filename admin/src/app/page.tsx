'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [earnBps, setEarnBps] = useState<number>(500);
  const [redeemLimitBps, setRedeemLimitBps] = useState<number>(5000);
  const [msg, setMsg] = useState<string>('');
  const [qrTtlSec, setQrTtlSec] = useState<number>(120);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [webhookKeyId, setWebhookKeyId] = useState<string>('');
  const [redeemCooldownSec, setRedeemCooldownSec] = useState<number>(0);
  const [earnCooldownSec, setEarnCooldownSec] = useState<number>(0);
  const [redeemDailyCap, setRedeemDailyCap] = useState<number>(0);
  const [earnDailyCap, setEarnDailyCap] = useState<number>(0);
  const [requireJwtForQuote, setRequireJwtForQuote] = useState<boolean>(false);
  const [rulesJson, setRulesJson] = useState<string>('[\n  {\n    "if": { "channelIn": ["VIRTUAL"], "weekdayIn": [1,2,3,4,5] },\n    "then": { "earnBps": 600 }\n  }\n]');
  const [requireBridgeSig, setRequireBridgeSig] = useState<boolean>(false);
  const [bridgeSecret, setBridgeSecret] = useState<string>('');
  const [requireStaffKey, setRequireStaffKey] = useState<boolean>(false);

  const earnPct = useMemo(() => (earnBps/100).toFixed(2), [earnBps]);
  const redeemPct = useMemo(() => (redeemLimitBps/100).toFixed(2), [redeemLimitBps]);

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/merchants/${MERCHANT}/settings`, {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setEarnBps(data.earnBps);
      setRedeemLimitBps(data.redeemLimitBps);
      if (typeof data.qrTtlSec === 'number') setQrTtlSec(data.qrTtlSec);
      setWebhookUrl(data.webhookUrl || '');
      setWebhookSecret(data.webhookSecret || '');
      setWebhookKeyId(data.webhookKeyId || '');
      setRedeemCooldownSec(Number(data.redeemCooldownSec || 0));
      setEarnCooldownSec(Number(data.earnCooldownSec || 0));
      setRedeemDailyCap(Number(data.redeemDailyCap || 0));
      setEarnDailyCap(Number(data.earnDailyCap || 0));
      setRequireJwtForQuote(Boolean(data.requireJwtForQuote));
      if (data.rulesJson) setRulesJson(JSON.stringify(data.rulesJson, null, 2));
      setRequireBridgeSig(Boolean(data.requireBridgeSig));
      setBridgeSecret(data.bridgeSecret || '');
      setRequireStaffKey(Boolean(data.requireStaffKey));
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
      const r = await fetch(`${API}/merchants/${MERCHANT}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({ earnBps, redeemLimitBps, qrTtlSec, webhookUrl, webhookSecret, webhookKeyId, redeemCooldownSec, earnCooldownSec, redeemDailyCap, earnDailyCap, requireJwtForQuote, rulesJson: JSON.parse(rulesJson||'null'), requireBridgeSig, bridgeSecret, requireStaffKey }),
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
        <a href="/txns">Txns</a>
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
          <input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="секрет для подписи"
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>Подпись: HMAC_SHA256(ts + '.' + body), заголовок X-Loyalty-Signature</div>
        </label>
        <label>
          Webhook Key ID (kid):
          <input value={webhookKeyId} onChange={(e) => setWebhookKeyId(e.target.value)} placeholder="идентификатор ключа"
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>Отправляется в заголовке X-Signature-Key-Id</div>
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
