"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton } from '@loyalty/ui';

type OutletPerf = { id: string; name: string; revenue: number; transactions: number; growth: number };
type StaffPerf = { id: string; name: string; transactions: number; revenue: number; averageCheck: number };
type DeviceStats = { deviceId: string; type: string; transactions: number; lastActive: string | null };
type Resp = { topOutlets: OutletPerf[]; topStaff: StaffPerf[]; peakHours: string[]; deviceUsage: DeviceStats[] };

export default function AnalyticsActivityPage() {
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/operations?period=month');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || 'Ошибка загрузки');
        if (!cancelled) setData(json);
      } catch (e:any) { if(!cancelled) setMsg(String(e?.message||e)); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="Топ точек" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : (
            <div style={{ display:'grid', gap: 6 }}>
              {(data?.topOutlets||[]).map(o=> (
                <div key={o.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px 100px', gap: 8, borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{o.name || o.id}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{o.id}</div>
                  </div>
                  <div>Выручка: {Math.round(o.revenue)}</div>
                  <div>Чеки: {o.transactions}</div>
                  <div style={{ color: o.growth>=0?'#4ade80':'#f87171' }}>{o.growth}%</div>
                </div>
              ))}
              {!data?.topOutlets?.length && <div style={{ opacity:.7 }}>Нет данных</div>}
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Топ сотрудников" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : (
            <div style={{ display:'grid', gap: 6 }}>
              {(data?.topStaff||[]).map(s=> (
                <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 120px 140px', gap: 8, borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{s.name || s.id}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{s.id}</div>
                  </div>
                  <div>Выручка: {Math.round(s.revenue)}</div>
                  <div>Чеки: {s.transactions}</div>
                  <div>Средний чек: {Math.round(s.averageCheck)}</div>
                </div>
              ))}
              {!data?.topStaff?.length && <div style={{ opacity:.7 }}>Нет данных</div>}
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Устройства" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : (
            <div style={{ display:'grid', gap: 6 }}>
              {(data?.deviceUsage||[]).map(d=> (
                <div key={d.deviceId} style={{ display:'grid', gridTemplateColumns:'1fr 140px 120px', gap: 8, borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{d.deviceId}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{d.type}</div>
                  </div>
                  <div>Чеки: {d.transactions}</div>
                  <div>Активность: {d.lastActive ? new Date(d.lastActive).toLocaleString() : '—'}</div>
                </div>
              ))}
              {!data?.deviceUsage?.length && <div style={{ opacity:.7 }}>Нет данных</div>}
            </div>
          )}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
