"use client";
import { useEffect, useState } from 'react';

type HealthPayload = {
  health?: { ok?: boolean; ts?: string };
  ready?: { ready?: boolean; ts?: string; checks?: { database?: boolean; migrations?: boolean } };
  error?: string;
};

export default function StatusPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [err, setErr] = useState<string>('');

  async function load() {
    try {
      const r = await fetch('/api/health');
      const payload = await r.json().catch(() => null) as HealthPayload | null;
      setData(payload);
      if (!r.ok) {
        const msg = payload?.error ? String(payload.error) : `HTTP ${r.status}`;
        setErr(msg);
      } else {
        setErr('');
      }
    } catch (e: unknown) { setErr(String(e instanceof Error ? e.message : e)); }
  }

  useEffect(() => { load().catch(()=>{}); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const V = (label: string, value: string, ok?: boolean) => (
    <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ opacity: 0.85, fontSize: 13, color: ok == null ? '#e5e7eb' : ok ? '#a6e3a1' : '#f38ba8' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div>
      <h2>Состояние API</h2>
      {err && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {V('Health', (data.health?.ok ? 'OK' : 'FAIL') + ` · ${data.health?.ts || '—'}`, Boolean(data.health?.ok))}
            {V('Ready', (data.ready?.ready ? 'READY' : 'NOT READY') + ` · ${data.ready?.ts || '—'}`, Boolean(data.ready?.ready))}
            {V('DB', data.ready?.checks?.database === true ? 'ok' : data.ready?.checks?.database === false ? 'failed' : '—', data.ready?.checks?.database)}
            {V('Migrations', data.ready?.checks?.migrations === true ? 'ok' : data.ready?.checks?.migrations === false ? 'failed' : '—', data.ready?.checks?.migrations)}
          </div>
        </div>
      )}
    </div>
  );
}
