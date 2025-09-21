"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton } from '@loyalty/ui';

export default function AnalyticsRfmPage() {
  const [grid, setGrid] = React.useState<number[][]>(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0)));
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled = false;
    (async () => {
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/rfm-heatmap');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Ошибка загрузки');
        if (!cancelled) setGrid(Array.isArray(data?.grid)? data.grid : grid);
      } catch (e: any) { if (!cancelled) setMsg(String(e?.message || e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const flat = grid.flat();
  const max = flat.length ? Math.max(...flat) : 1;

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="RFM-анализ (5×5)" />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 6 }}>
              {grid.map((row, ri) => row.map((v, ci) => {
                const intensity = max>0 ? v / max : 0;
                const bg = `rgba(99, 102, 241, ${0.15 + intensity*0.85})`;
                return (
                  <div key={`${ri}-${ci}`} style={{ aspectRatio:'1 / 1', display:'grid', placeItems:'center', borderRadius:8, background:bg }}>
                    <div style={{ fontWeight:600 }}>{v}</div>
                  </div>
                );
              }))}
            </div>
          )}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
