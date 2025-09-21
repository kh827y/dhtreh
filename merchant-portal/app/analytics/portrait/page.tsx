"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton, Chart } from '@loyalty/ui';

type GenderItem = { sex: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type AgeItem = { bucket: string; customers: number; transactions: number; revenue: number; averageCheck: number };
type Resp = { gender: GenderItem[]; age: AgeItem[] };

export default function AnalyticsPortraitPage() {
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/portrait?period=month');
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || 'Ошибка загрузки');
        if (!cancelled) setData(json);
      } catch (e:any) { if(!cancelled) setMsg(String(e?.message||e)); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  const genderOption = React.useMemo(()=>{
    const labels = (data?.gender||[]).map(g=>g.sex);
    const values = (data?.gender||[]).map(g=>g.customers);
    return { tooltip:{}, xAxis:{ type:'category', data: labels }, yAxis:{ type:'value' }, series:[{ type:'bar', data: values }] } as any;
  },[data]);

  const ageOption = React.useMemo(()=>{
    const labels = (data?.age||[]).map(a=>a.bucket);
    const values = (data?.age||[]).map(a=>a.customers);
    return { tooltip:{}, xAxis:{ type:'category', data: labels }, yAxis:{ type:'value' }, series:[{ type:'bar', data: values }] } as any;
  },[data]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="Портрет клиента — пол" />
        <CardBody>
          {loading ? <Skeleton height={220} /> : <Chart option={genderOption} height={260} />}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Портрет клиента — возраст" />
        <CardBody>
          {loading ? <Skeleton height={220} /> : <Chart option={ageOption} height={260} />}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
