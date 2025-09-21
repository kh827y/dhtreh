"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function StaffCardPage({ params }: { params: { staffId: string } }) {
  const staffId = (typeof params?.staffId === 'string' ? params.staffId : Array.isArray(params?.staffId) ? params.staffId[0] : '').toString();
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [item, setItem] = React.useState<any|null>(null);
  const [accesses, setAccesses] = React.useState<Array<{ outletId: string; outletName: string; pinCode?: string|null; lastTxnAt?: string|null }>>([]);
  const [outlets, setOutlets] = React.useState<Array<{ id: string; name: string }>>([]);
  const [newOutletId, setNewOutletId] = React.useState('');
  const [working, setWorking] = React.useState(false);

  React.useEffect(()=>{
    let mounted = true;
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const res = await fetch('/api/portal/staff');
        const data = await res.json();
        const found = (Array.isArray(data) ? data : []).find((x:any)=>x.id===staffId) || null;
        if (!mounted) return;
        setItem(found);
        // загрузим доступы и точки
        const [accRes, otRes] = await Promise.all([
          fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`),
          fetch('/api/portal/outlets'),
        ]);
        const acc = await accRes.json();
        const ot = await otRes.json();
        if (!mounted) return;
        setAccesses(Array.isArray(acc) ? acc : []);
        setOutlets(Array.isArray(ot) ? ot : []);
      } catch (e: any) { setMsg(String(e?.message || e)); }
      finally { if (mounted) setLoading(false); }
    })();
    return ()=>{ mounted = false; };
  }, [staffId]);

  const isOwner = (item?.role||'').toUpperCase() === 'MERCHANT';

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ position:'relative' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(255,255,255,.08)' }} />
            <div title="Редактировать аватар" style={{ position:'absolute', right:-2, bottom:-2, width:22, height:22, borderRadius:'50%', background:'rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✎</div>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:700 }}>{item?.login || '—'} {isOwner && <span title="Владелец" style={{ marginLeft:8, border:'1px solid rgba(255,255,255,.4)', borderRadius:'50%', width:18, height:18, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>A</span>}</div>
            <div style={{ opacity:.8, fontSize:13 }}>{item?.email || '—'}</div>
            <div style={{ opacity:.6, fontSize:12 }}>{staffId}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button disabled title="Редактировать">Редактировать</Button>
          <Button disabled title="Доступно только для своего профиля">Сменить пароль</Button>
          <Button disabled title="Нет транзакций">Посмотреть транзакции</Button>
          <Button variant="danger" disabled={isOwner}>Уволить</Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Доступы" subtitle="Панель мерчанта и панель кассира" />
        <CardBody>
          {loading ? <Skeleton height={120} /> : (
            <div style={{ display:'grid', gap:12 }}>
              <label style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="checkbox" checked={isOwner || !!item?.email} disabled={isOwner} readOnly /> Доступ в админ панель
              </label>
              <div style={{ opacity:.8 }}>Группа доступа: <b>{isOwner? 'OWNER' : (item?.role||'CASHIER')}</b></div>
              <div style={{ display:'grid', gap:6 }}>
                <label>E-mail</label>
                <input value={item?.email || ''} disabled style={{ padding:8 }} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Связанные торговые точки" subtitle="Права кассира по точкам" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : (
            <div style={{ display:'grid', gap:12 }}>
              <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 200px auto' }}>
                <select value={newOutletId} onChange={e=>setNewOutletId(e.target.value)} style={{ padding:8 }}>
                  <option value="">Выберите точку…</option>
                  {outlets.filter(o => !accesses.find(a=>a.outletId===o.id)).map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <button className="btn btn-primary" disabled={!newOutletId || working} onClick={async()=>{
                  setWorking(true); setMsg('');
                  try {
                    const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ outletId: newOutletId }) });
                    if (!res.ok) throw new Error(await res.text());
                    const a = await res.json();
                    const name = outlets.find(o=>o.id===a.outletId)?.name || a.outletId;
                    setAccesses(prev => [...prev, { outletId: a.outletId, outletName: name, pinCode: a.pinCode }]);
                    setNewOutletId('');
                  } catch (e:any) { setMsg(String(e?.message||e)); }
                  finally { setWorking(false); }
                }}>Добавить доступ</button>
              </div>
              <div style={{ display:'grid', gap:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 200px 200px', fontSize:12, opacity:.8 }}>
                  <div>Точка</div>
                  <div>PIN</div>
                  <div>Последняя активность</div>
                  <div>Действия</div>
                </div>
                {accesses.map(a => (
                  <div key={a.outletId} style={{ display:'grid', gridTemplateColumns:'1fr 140px 200px 200px', gap:8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                    <div>{a.outletName}</div>
                    <div><code>{a.pinCode || '—'}</code></div>
                    <div style={{ opacity:.8 }}>{a.lastTxnAt ? new Date(a.lastTxnAt).toLocaleString() : '—'}</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn" disabled={working} onClick={async()=>{
                        setWorking(true); setMsg('');
                        try {
                          const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(a.outletId)}/regenerate-pin`, { method: 'POST' });
                          if (!res.ok) throw new Error(await res.text());
                          const r = await res.json();
                          setAccesses(prev => prev.map(x => x.outletId===a.outletId ? { ...x, pinCode: r.pinCode } : x));
                        } catch(e:any) { setMsg(String(e?.message||e)); }
                        finally { setWorking(false); }
                      }}>Обновить PIN</button>
                      <button className="btn" disabled={working} onClick={async()=>{
                        if (!confirm('Удалить доступ?')) return;
                        setWorking(true); setMsg('');
                        try {
                          const res = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(a.outletId)}`, { method: 'DELETE' });
                          if (!res.ok) throw new Error(await res.text());
                          setAccesses(prev => prev.filter(x => x.outletId !== a.outletId));
                        } catch(e:any) { setMsg(String(e?.message||e)); }
                        finally { setWorking(false); }
                      }}>Удалить</button>
                    </div>
                  </div>
                ))}
                {!accesses.length && <div style={{ opacity:.7 }}>Нет привязанных точек</div>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
    </div>
  );
}
