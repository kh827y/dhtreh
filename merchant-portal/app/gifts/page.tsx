"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function GiftsPage() {
  type Gift = {
    id: string; title: string; description?: string|null; imageUrl?: string|null; costPoints: number; active: boolean; periodFrom?: string|null; periodTo?: string|null; inventory?: number|null;
  };
  const [items, setItems] = React.useState<Gift[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/gifts');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Подарки / Каталог</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Каталог подарков за баллы</div>
        </div>
        <Button variant="primary" disabled>Новый подарок</Button>
      </div>
      <Card>
        <CardHeader title="Каталог" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(g => (
                <div key={g.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr 140px 140px 120px', gap: 12, alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div style={{ width:56, height:56, borderRadius:8, background:'rgba(255,255,255,.06)', overflow:'hidden' }}>
                    {g.imageUrl ? <img src={g.imageUrl} alt="" width={56} height={56} style={{ objectFit:'cover' }} /> : null}
                  </div>
                  <div>
                    <div style={{ fontWeight:600 }}>{g.title}</div>
                    {g.description && <div style={{ opacity:.75, fontSize:12 }}>{g.description}</div>}
                  </div>
                  <div style={{ opacity:.9 }}>{g.costPoints} баллов</div>
                  <div style={{ opacity:.8 }}>{(g.periodFrom||g.periodTo) ? `${g.periodFrom?new Date(g.periodFrom).toLocaleDateString():''} - ${g.periodTo?new Date(g.periodTo).toLocaleDateString():''}` : 'без периода'}</div>
                  <div style={{ textAlign:'right', opacity:.8 }}>{g.inventory==null ? '∞' : g.inventory}</div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет активных подарков</div>}
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
