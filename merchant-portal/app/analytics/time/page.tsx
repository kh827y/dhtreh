"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton, Chart } from '@loyalty/ui';

type Revenue = { hourlyDistribution: Array<{ hour:number; revenue:number; transactions:number }>; dailyRevenue: Array<{ date:string; revenue:number; transactions:number; customers:number }> };

export default function AnalyticsTimePage() {
  const [today, setToday] = React.useState<Revenue | null>(null);
  const [month, setMonth] = React.useState<Revenue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const [rDay, rMonth] = await Promise.all([
          fetch('/api/portal/analytics/revenue?period=day'),
          fetch('/api/portal/analytics/revenue?period=month'),
        ]);
        const [dDay, dMonth] = await Promise.all([rDay.json(), rMonth.json()]);
        if (!rDay.ok) throw new Error(dDay?.message || 'Ошибка загрузки (day)');
        if (!rMonth.ok) throw new Error(dMonth?.message || 'Ошибка загрузки (month)');
        if (!cancelled) { setToday(dDay); setMonth(dMonth); }
      } catch (e:any) { if(!cancelled) setMsg(String(e?.message||e)); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  const hourOpt = React.useMemo(()=>{
    const labels = (today?.hourlyDistribution||[]).map(h=>String(h.hour).padStart(2,'0')+':00');
    const values = (today?.hourlyDistribution||[]).map(h=>h.revenue);
    return { tooltip:{ trigger:'axis' }, xAxis:{ type:'category', data: labels }, yAxis:{ type:'value' }, series:[{ type:'line', data: values, smooth:true, areaStyle:{} }] } as any;
  },[today]);
  const dailyOpt = React.useMemo(()=>{
    const labels = (month?.dailyRevenue||[]).map(d=>d.date);
    const values = (month?.dailyRevenue||[]).map(d=>d.revenue);
    return { tooltip:{ trigger:'axis' }, xAxis:{ type:'category', data: labels }, yAxis:{ type:'value' }, series:[{ type:'bar', data: values }] } as any;
  },[month]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="Распределение по часам (сегодня)" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={hourOpt} height={300} />}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Выручка по дням (месяц)" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={dailyOpt} height={300} />}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
