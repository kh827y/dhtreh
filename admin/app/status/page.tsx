"use client";
import { useEffect, useState } from 'react';

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>('');

  async function load() {
    try {
      const r = await fetch('/api/health');
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json()); setErr('');
    } catch (e: any) { setErr(String(e?.message || e)); }
  }

  useEffect(() => { load().catch(()=>{}); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const W = (label: string, obj: any) => (
    <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ opacity: 0.85, fontSize: 13 }}>
        {Object.entries(obj || {}).map(([k,v]) => (
          <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <h2>Состояние API</h2>
      {err && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div>version: <b>{data.version}</b></div>
          <div>flags: <code>{JSON.stringify(data.flags)}</code></div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {W('Workers', data.workers)}
          </div>
        </div>
      )}
    </div>
  );
}

