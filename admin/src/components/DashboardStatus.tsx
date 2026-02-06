"use client";
import { useCallback, useEffect, useState } from 'react';
import { useLatestRequest } from '../lib/async-guards';

type Summary = { outboxPending: number; outboxDead: number; http5xx: number; http4xx: number; circuitOpen?: number; counters: Record<string, number> };

export default function DashboardStatus() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string>('');
  const { start, isLatest } = useLatestRequest();

  const load = useCallback(async () => {
    const requestId = start();
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      if (!isLatest(requestId)) return;
      setData(payload); setErr('');
    } catch (e: unknown) {
      if (!isLatest(requestId)) return;
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [isLatest, start]);
  useEffect(() => { load().catch(()=>{}); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  return (
    <div style={{ background: '#0e1629', padding: 12, borderRadius: 8 }}>
      {data && data.http5xx > 0 && (
        <div style={{ marginBottom: 8, background: '#3f1d2e', color: '#f38ba8', padding: '6px 10px', borderRadius: 6 }}>
          Обнаружены ошибки 5xx: {data.http5xx}. Проверьте логи и состояние воркеров.
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Metric label="Outbox pending" value={data?.outboxPending ?? 0} warn={v=>v>0} />
        <Metric label="Outbox DEAD" value={data?.outboxDead ?? 0} warn={v=>v>0} />
        <Metric label="Breaker open" value={data?.circuitOpen ?? 0} warn={v=>v>0} />
        <Metric label="HTTP 5xx" value={data?.http5xx ?? 0} warn={v=>v>0} />
        <Metric label="HTTP 4xx" value={data?.http4xx ?? 0} warn={v=>v>100} />
        <Metric label="Quotes (ok)" value={data?.counters?.['loyalty_quote_requests_total:ok'] ?? 0} />
        <Metric label="Commits (ok)" value={data?.counters?.['loyalty_commit_requests_total:ok'] ?? 0} />
        <Metric label="Refunds (ok)" value={data?.counters?.['loyalty_refund_requests_total:ok'] ?? 0} />
      </div>
      {err && <div style={{ color: '#f38ba8', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: (v:number)=>boolean }) {
  const danger = warn ? warn(value) : false;
  return (
    <div>
      <div style={{ opacity: 0.8, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: danger ? '#f38ba8' : '#a6e3a1' }}>{value}</div>
    </div>
  );
}
