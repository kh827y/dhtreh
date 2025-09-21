"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Chart, Skeleton, Button } from '@loyalty/ui';

type RevenueMetrics = { totalRevenue: number; averageCheck: number; transactionCount: number; dailyRevenue: Array<{ date: string; revenue: number; transactions: number; customers: number }>; revenueGrowth: number };
type CustomerMetrics = { totalCustomers: number; newCustomers: number; activeCustomers: number; churnRate: number; retentionRate: number };
type LoyaltyMetrics = { activeWallets: number; totalPointsIssued: number; totalPointsRedeemed: number; pointsRedemptionRate: number };

export default function AnalyticsSummaryPage() {
  const [loading, setLoading] = React.useState(true);
  const [rev, setRev] = React.useState<RevenueMetrics | null>(null);
  const [cust, setCust] = React.useState<CustomerMetrics | null>(null);
  const [loyal, setLoyal] = React.useState<LoyaltyMetrics | null>(null);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled = false;
    (async () => {
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/dashboard?period=month');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Ошибка загрузки');
        if (!cancelled) {
          setRev(data?.revenue ?? null);
          setCust(data?.customers ?? null);
          setLoyal(data?.loyalty ?? null);
        }
      } catch (e: any) { if (!cancelled) setMsg(String(e?.message || e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const option = React.useMemo(()=>{
    const dates = (rev?.dailyRevenue || []).map(d => d.date);
    const values = (rev?.dailyRevenue || []).map(d => d.revenue);
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: values, smooth: true, areaStyle: {} }],
    } as any;
  }, [rev]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
        <Button variant="secondary" onClick={()=>location.href='/analytics/rfm'}>RFM</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/portrait'}>Портрет клиента</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/repeat'}>Повторные продажи</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/time'}>По времени</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/activity'}>Активность точек/сотрудников</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/birthdays'}>Дни рождения</Button>
        <Button variant="secondary" onClick={()=>location.href='/analytics/referrals'}>Реферальная сводка</Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 8 }}>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Выручка (мес.)</div><div style={{ fontSize:22, fontWeight:700 }}>{rev ? Math.round(rev.totalRevenue) : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Средний чек</div><div style={{ fontSize:22, fontWeight:700 }}>{rev ? Math.round(rev.averageCheck) : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Покупки</div><div style={{ fontSize:22, fontWeight:700 }}>{rev ? rev.transactionCount : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Клиентов</div><div style={{ fontSize:22, fontWeight:700 }}>{cust ? cust.totalCustomers : '—'}</div></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Динамика выручки по дням" />
        <CardBody>
          {loading ? <Skeleton height={260} /> : <Chart option={option} height={300} />}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 8 }}>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Новые клиенты</div><div style={{ fontSize:22, fontWeight:700 }}>{cust ? cust.newCustomers : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Активные клиенты</div><div style={{ fontSize:22, fontWeight:700 }}>{cust ? cust.activeCustomers : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Активных кошельков</div><div style={{ fontSize:22, fontWeight:700 }}>{loyal ? loyal.activeWallets : '—'}</div></CardBody></Card>
      </div>
    </div>
  );
}
