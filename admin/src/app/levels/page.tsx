'use client';

import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

export default function LevelsPreviewPage() {
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [data, setData] = useState<any>(null);

  async function load() {
    setLoading(true); setMsg(''); setData(null);
    try {
      if (!customerId) throw new Error('Введите customerId');
      const r = await fetch(`${API}/levels/${encodeURIComponent(MERCHANT)}/${encodeURIComponent(customerId)}`);
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  return (
    <main style={{ maxWidth: 780, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Уровни клиента</h1>
      <div style={{ display:'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
      </div>
      <div style={{ display:'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>CustomerId: <input value={customerId} onChange={(e)=>setCustomerId(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Показать</button>
      </div>
      {msg && <div style={{ color:'#b00', marginTop: 8 }}>{msg}</div>}
      {data && (
        <pre style={{ background:'#fafafa', padding: 10, marginTop: 12, overflow:'auto' }}>{JSON.stringify(data, null, 2)}</pre>
      )}
    </main>
  );
}
