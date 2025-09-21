"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton } from '@loyalty/ui';

type TopRef = { rank:number; name:string; customerId:string; invited:number };
type Resp = { registeredViaReferral:number; purchasedViaReferral:number; referralRevenue:number; topReferrers: TopRef[] };

export default function AnalyticsReferralsPage() {
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/referral?period=month');
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 8 }}>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Зарегистрировано по реф.коду</div><div style={{ fontSize:22, fontWeight:700 }}>{data? data.registeredViaReferral : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Покупателей по реф.коду</div><div style={{ fontSize:22, fontWeight:700 }}>{data? data.purchasedViaReferral : '—'}</div></CardBody></Card>
        <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Выручка по рефералке</div><div style={{ fontSize:22, fontWeight:700 }}>{data? Math.round(data.referralRevenue) : '—'}</div></CardBody></Card>
      </div>
      <Card>
        <CardHeader title="Топ рефереров" />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : (
            <div style={{ display:'grid', gap: 6 }}>
              {(data?.topReferrers||[]).map(r => (
                <div key={r.customerId} style={{ display:'grid', gridTemplateColumns:'60px 1fr 160px', gap: 8, borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0' }}>
                  <div style={{ fontWeight:700 }}>#{r.rank}</div>
                  <div>
                    <div style={{ fontWeight:600 }}>{r.name || r.customerId}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{r.customerId}</div>
                  </div>
                  <div>Приглашено: {r.invited}</div>
                </div>
              ))}
              {!data?.topReferrers?.length && <div style={{ opacity:.7 }}>Нет данных</div>}
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
