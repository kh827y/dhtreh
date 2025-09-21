"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton } from '@loyalty/ui';

type BirthdayItem = { customerId: string; name?: string; phone?: string; nextBirthday: string; age: number };

export default function AnalyticsBirthdaysPage() {
  const [items, setItems] = React.useState<BirthdayItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/analytics/birthdays?withinDays=30&limit=100');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Ошибка загрузки');
        if (!cancelled) setItems(Array.isArray(data)? data : []);
      } catch (e:any) { if(!cancelled) setMsg(String(e?.message||e)); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <Card>
        <CardHeader title="Ближайшие дни рождения (30 дней)" />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(i => (
                <div key={i.customerId+':'+i.nextBirthday} style={{ display:'grid', gridTemplateColumns:'1fr 160px 160px', gap: 8, borderBottom:'1px solid rgba(255,255,255,.06)', padding:'8px 0' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{i.name || i.phone || i.customerId}</div>
                    <div style={{ opacity:.7, fontSize:12 }}>{i.phone || i.customerId}</div>
                  </div>
                  <div style={{ opacity:.9 }}>{new Date(i.nextBirthday).toLocaleDateString()}</div>
                  <div style={{ opacity:.9 }}>{i.age} лет</div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет ближайших дней рождения</div>}
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
