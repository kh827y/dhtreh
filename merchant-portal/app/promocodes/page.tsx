"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Row = {
  id: string;
  name?: string;
  valueType: string;
  value: number;
  status: string;
  isActive: boolean;
  validFrom?: string|null;
  validUntil?: string|null;
  totalUsed?: number;
  codeSamples?: string[];
}

export default function PromocodesPage() {
  const [tab, setTab] = React.useState<'ACTIVE'|'ARCHIVE'>('ACTIVE');
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Row[]>([]);
  const [msg, setMsg] = React.useState('');
  // Create state
  const [showCreate, setShowCreate] = React.useState(false);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [points, setPoints] = React.useState<number|''>('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const url = new URL('/api/portal/promocodes', window.location.origin);
      url.searchParams.set('status', tab === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE');
      const res = await fetch(url.toString());
      const data = await res.json();
      const arr: Row[] = Array.isArray(data?.items) ? data.items : [];
      setItems(arr.filter(r => String(r.valueType) === 'POINTS'));
    } catch (e:any) { setMsg(String(e?.message||e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[tab]);

  async function create() {
    setMsg('');
    try {
      const res = await fetch('/api/portal/promocodes/issue', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name: name || undefined, code, points: Number(points||0) }) });
      if (!res.ok) throw new Error(await res.text());
      setName(''); setCode(''); setPoints(''); setShowCreate(false);
      await load();
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }
  async function deactivate(voucherId?: string, code?: string) {
    setMsg('');
    try {
      const res = await fetch('/api/portal/promocodes/deactivate', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ voucherId, code }) });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Промокоды</div>
        </div>
        <Button variant="primary" onClick={()=>setShowCreate(true)}>Создать промокод</Button>
      </div>

      <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
        <button className={tab==='ACTIVE'?'btn btn-primary':'btn'} onClick={()=>setTab('ACTIVE')}>Активные</button>
        <button className={tab==='ARCHIVE'?'btn btn-primary':'btn'} onClick={()=>setTab('ARCHIVE')}>Архивные</button>
      </div>

      {msg && <div style={{ color:'#f87171' }}>{msg}</div>}

      <Card>
        <CardHeader title={tab==='ACTIVE' ? 'Активные' : 'Архивные'} />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 180px 180px 220px 160px auto', fontSize:12, opacity:.8 }}>
                <div>Промокод</div>
                <div>Баллов</div>
                <div>Статус</div>
                <div>Срок действия</div>
                <div>Использований</div>
                <div>Действия</div>
              </div>
              {items.map(v => (
                <div key={v.id} style={{ display:'grid', gridTemplateColumns:'1fr 180px 180px 220px 160px auto', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{v.name || (v.codeSamples?.[0] || v.id)}</div>
                    <div style={{ opacity:.8, fontSize:12 }}>{v.id}</div>
                  </div>
                  <div>{v.value}</div>
                  <div><span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.06)' }}>{v.status}</span></div>
                  <div style={{ opacity:.8 }}>{v.validUntil ? ('до ' + new Date(v.validUntil).toLocaleDateString()) : 'без срока'}</div>
                  <div>{typeof v.totalUsed === 'number' ? v.totalUsed : '—'}</div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    {v.isActive ? (
                      <Button size="sm" onClick={()=>deactivate(v.id)}>
                        Деактивировать
                      </Button>
                    ) : (
                      <span style={{ opacity:.7 }}>Отключен</span>
                    )}
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет промокодов</div>}
            </div>
          )}
        </CardBody>
      </Card>

      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:50 }}>
          <div style={{ width:'min(720px, 96vw)', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, boxShadow:'0 10px 40px rgba(0,0,0,.4)' }}>
            <div style={{ padding:16, borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:16, fontWeight:700 }}>Новый промокод (баллы)</div>
              <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>✕</button>
            </div>
            <div style={{ padding:16, display:'grid', gap:12 }}>
              <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr' }}>
                <input placeholder="Название (опц.)" value={name} onChange={e=>setName(e.target.value)} style={{ padding:8 }} />
                <input placeholder="Код" value={code} onChange={e=>setCode(e.target.value)} style={{ padding:8 }} />
              </div>
              <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr' }}>
                <input placeholder="Баллы" inputMode="numeric" value={points} onChange={e=>setPoints(e.target.value===''?'':Number(e.target.value))} style={{ padding:8 }} />
              </div>
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
            <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn" onClick={()=>setShowCreate(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={create} disabled={!code.trim() || !points || Number(points)<=0}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
