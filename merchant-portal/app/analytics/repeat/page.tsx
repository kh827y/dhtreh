"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton, Chart } from '@loyalty/ui';

type Histogram = { purchases: number; customers: number }[];
type Resp = { uniqueBuyers: number; newBuyers: number; repeatBuyers: number; histogram: Histogram };

export default function AnalyticsRepeatPage() {
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/repeat?period=month');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || 'Ошибка загрузки');
        if (!cancelled) setData(json);
      } catch (e:any) { if(!cancelled) setMsg(String(e?.message||e)); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  const option = React.useMemo(()=>{
    const labels = (data?.histogram||[]).map(h=>String(h.purchases));
    const values = (data?.histogram||[]).map(h=>h.customers);
    return { tooltip:{}, xAxis:{ type:'category', data: labels }, yAxis:{ type:'value' }, series:[{ type:'bar', data: values }] } as any;
  },[data]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap: 8 }}>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Уникальные покупатели</div><div style={{ fontSize:22, fontWeight:700 }}>{data? data.uniqueBuyers : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Новые</div><div style={{ fontSize:22, fontWeight:700 }}>{data? data.newBuyers : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Повторные</div><div style={{ fontSize:22, fontWeight:700 }}>{data? data.repeatBuyers : '—'}</div></CardBody></Card>
      </div>
      <Card>
        <CardHeader title="Распределение по числу покупок на клиента" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={option} height={300} />}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
