"use client";
import { useEffect, useState } from 'react';
import { outboxStats } from '../../../lib/outbox';

type Summary = { outboxPending: number; outboxDead: number; http5xx: number; http4xx: number; circuitOpen?: number; rateLimited?: number; counters: Record<string, number>; outboxEvents?: Record<string, number> };

export default function OutboxMonitorPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [since, setSince] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [metrics, setMetrics] = useState<Summary | null>(null);
  const [err, setErr] = useState<string>('');

  async function load() {
    try {
      const [st, met] = await Promise.all([
        outboxStats(merchantId, since || undefined),
        fetch('/api/metrics').then(r=>r.json()),
      ]);
      setStats(st); setMetrics(met); setErr('');
    } catch (e: any) { setErr(String(e?.message || e)); }
  }
  useEffect(() => { load().catch(()=>{}); const id = setInterval(load, 15000); return () => clearInterval(id); }, [merchantId, since]);

  const setPreset = (h: number) => setSince(new Date(Date.now() - h*3600*1000).toISOString());

  return (
    <div>
      <h2>Outbox Monitor</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft:8 }} /></label>
        <label>С даты (ISO): <input value={since} onChange={e=>setSince(e.target.value)} style={{ marginLeft:8, width:240 }} placeholder="2025-09-01T00:00:00Z" /></label>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setPreset(1)} style={{ padding:'6px 10px' }}>1h</button>
          <button onClick={()=>setPreset(24)} style={{ padding:'6px 10px' }}>24h</button>
          <button onClick={()=>setPreset(24*7)} style={{ padding:'6px 10px' }}>7d</button>
        </div>
        <button onClick={load} style={{ padding:'6px 10px' }}>Обновить</button>
      </div>
      {err && <div style={{ color:'#f38ba8', marginBottom:8 }}>{err}</div>}

      {metrics && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10 }}>
          <Metric label="Pending" value={metrics.outboxPending} warn={v=>v>0} />
          <Metric label="DEAD total" value={metrics.outboxDead} warn={v=>v>0} />
          <Metric label="Breaker open" value={metrics.circuitOpen || 0} warn={v=>v>0} />
          <Metric label="Rate-limited" value={metrics.rateLimited || 0} />
        </div>
      )}
      {metrics?.outboxEvents && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ opacity:0.85, marginBottom: 4 }}>Outbox events by result (cumulative):</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {Object.entries(metrics.outboxEvents).map(([k,v]) => (
              <div key={k} style={{ background:'#0e1629', padding:'6px 10px', borderRadius:6 }}>
                <b>{k}</b>: {v}
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {['PENDING','SENDING','FAILED','DEAD','SENT'].map(k => (
              <Metric key={k} label={k} value={stats.counts[k] || 0} warn={k==='DEAD'?v=>v>0:undefined} />
            ))}
          </div>
          {stats.typeCounts && (
            <div>
              <div style={{ opacity:0.85, marginBottom:4 }}>Топ типов событий:</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {Object.entries(stats.typeCounts).sort((a,b)=>b[1]-a[1]).slice(0,16).map(([t,c]) => (
                  <div key={t} style={{ background:'#0e1629', padding:'6px 10px', borderRadius:6 }}>
                    <b>{t}</b>: {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: (v:number)=>boolean }) {
  const danger = warn ? warn(value) : false;
  return (
    <div>
      <div style={{ opacity:0.8, fontSize:12 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:600, color: danger ? '#f38ba8' : '#a6e3a1' }}>{value}</div>
    </div>
  );
}

