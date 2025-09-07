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
        body: JSON.stringify({ earnBps, redeemLimitBps }),
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
      <div style={{ color: '#666' }}>Merchant: <code>{MERCHANT}</code></div>

      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label>
          Начисление (basis points):
          <input type="number" min={0} max={10000} value={earnBps}
                 onChange={(e) => setEarnBps(Math.max(0, Math.min(10000, Number(e.target.value))))}
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>= {earnPct}% от базы</div>
        </label>

        <label>
          Лимит списания (basis points):
          <input type="number" min={0} max={10000} value={redeemLimitBps}
                 onChange={(e) => setRedeemLimitBps(Math.max(0, Math.min(10000, Number(e.target.value))))}
                 style={{ width: '100%', padding: 8 }} />
          <div style={{ color: '#666', fontSize: 12 }}>= {redeemPct}% от базы</div>
        </label>

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
