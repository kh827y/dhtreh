'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:18080';

type BridgeHealth = { ok?: boolean } | null;
type QueueStatus = { pending?: number; preview?: Array<{ id: string; type: string; idemKey?: string|null }> } | null;

export default function BridgeStatusPage() {
  const [health, setHealth] = useState<BridgeHealth>(null);
  const [queue, setQueue] = useState<QueueStatus>(null);
  const [metrics, setMetrics] = useState<string>('');
  const [msg, setMsg] = useState('');

  async function load() {
    setMsg('');
    try {
      const [h, q, m] = await Promise.all([
        fetch(`${BRIDGE}/health`).then(r=>r.json()).catch(()=>null),
        fetch(`${BRIDGE}/queue/status`).then(r=>r.json()).catch(()=>null),
        fetch(`${BRIDGE}/metrics`).then(r=>r.text()).catch(()=>''),
      ]);
      setHealth(h); setQueue(q); setMetrics(m);
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка загрузки: ' + msg); }
  }
  async function flush() {
    setMsg('');
    try {
      const r = await fetch(`${BRIDGE}/queue/flush`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      await load();
      setMsg('Очередь отправлена');
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка flush: ' + msg); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Bridge Status</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={load} style={{ padding: '6px 10px' }}>Обновить</button>
        <button onClick={flush} style={{ padding: '6px 10px' }}>Flush очередь</button>
        <a href={`${BRIDGE}/metrics`} target="_blank" rel="noreferrer">Открыть /metrics</a>
      </div>
      {msg && <div style={{ color: '#b00', marginTop: 8 }}>{msg}</div>}

      <h3 style={{ marginTop: 16 }}>Health</h3>
      <pre style={{ background: '#fafafa', padding: 10 }}>{JSON.stringify(health, null, 2)}</pre>

      <h3>Очередь</h3>
      <pre style={{ background: '#fafafa', padding: 10 }}>{JSON.stringify(queue, null, 2)}</pre>

      <h3>Метрики</h3>
      <pre style={{ whiteSpace:'pre-wrap', background: '#fafafa', padding: 10 }}>{metrics || 'Нет данных'}</pre>

      <div style={{ marginTop: 12 }}>
        <Link href="/">← Настройки</Link>
      </div>
    </main>
  );
}
