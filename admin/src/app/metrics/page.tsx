'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export default function MetricsPage() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const r = await fetch(`${API}/metrics`);
      if (!r.ok) throw new Error(await r.text());
      setText(await r.text());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Метрики</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={load} style={{ padding: '6px 10px' }}>Обновить</button>
        <Link href={`${API}/metrics`} target="_blank" rel="noreferrer">Открыть /metrics</Link>
      </div>
      {error && <div style={{ color: '#b00', marginTop: 8 }}>{error}</div>}
      <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', background: '#fafafa', padding: 10, marginTop: 12 }}>{text || 'Нет данных'}</pre>
      <div style={{ marginTop: 12 }}>
        <Link href="/">← Настройки</Link>
      </div>
    </main>
  );
}

