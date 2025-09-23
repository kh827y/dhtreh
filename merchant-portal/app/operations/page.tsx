"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton, Button } from '@loyalty/ui';

type Tx = { id: string; type: string; amount: number; orderId?: string|null; customerId?: string; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };
type Rc = { id: string; orderId: string; customerId: string; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };

export default function OperationsPage() {
  const [loadingTx, setLoadingTx] = React.useState(true);
  const [loadingRc, setLoadingRc] = React.useState(true);
  const [tx, setTx] = React.useState<Tx[]>([]);
  const [rc, setRc] = React.useState<Rc[]>([]);
  const [orderId, setOrderId] = React.useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('orderId') || '';
  });
  const [staffId, setStaffId] = React.useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('staffId') || '';
  });
  const [msg, setMsg] = React.useState('');

  async function load() {
    setMsg('');
    setLoadingTx(true); setLoadingRc(true);
    try {
      const params = new URLSearchParams();
      if (orderId) params.set('orderId', orderId);
      if (staffId) params.set('staffId', staffId);
      const qs = params.size ? `?${params.toString()}` : '';
      const [rTx, rRc] = await Promise.all([
        fetch(`/api/portal/transactions${qs}`),
        fetch(`/api/portal/receipts${qs}`),
      ]);
      const [dTx, dRc] = await Promise.all([rTx.json(), rRc.json()]);
      setTx(Array.isArray(dTx) ? dTx : []);
      setRc(Array.isArray(dRc) ? dRc : []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoadingTx(false); setLoadingRc(false);
    }
  }
  React.useEffect(()=>{ load(); },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr auto' }}>
        <input placeholder="OrderId (опционально)" value={orderId} onChange={e=>setOrderId(e.target.value)} style={{ padding:8 }} />
        <input placeholder="ID сотрудника" value={staffId} onChange={e=>setStaffId(e.target.value)} style={{ padding:8 }} />
        <Button onClick={load}>Обновить</Button>
      </div>
      <Card>
        <CardHeader title="Транзакции" subtitle="последние операции" />
        <CardBody>
          {loadingTx ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 6 }}>
              {tx.map(t => (
                <div key={t.id} style={{ display:'grid', gridTemplateColumns:'120px 120px 1fr 1fr 1fr 160px', gap: 8, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div><code>{t.id.slice(0,8)}</code></div>
                  <div><span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.06)' }}>{t.type}</span></div>
                  <div>{t.amount}</div>
                  <div style={{ opacity:.9 }}>{t.orderId || <span style={{ opacity:.6 }}>—</span>}</div>
                  <div style={{ opacity:.9 }}>{t.customerId || <span style={{ opacity:.6 }}>—</span>}</div>
                  <div style={{ opacity:.7 }}>{new Date(t.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {!tx.length && <div style={{ opacity:.7 }}>Нет транзакций</div>}
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Чеки" subtitle="последние чеки" />
        <CardBody>
          {loadingRc ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 6 }}>
              {rc.map(r => (
                <div key={r.id} style={{ display:'grid', gridTemplateColumns:'120px 1fr 1fr 120px 160px', gap: 8, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div><code>{r.id.slice(0,8)}</code></div>
                  <div style={{ opacity:.9 }}>{r.orderId}</div>
                  <div style={{ opacity:.9 }}>{r.customerId}</div>
                  <div>{r.total}</div>
                  <div style={{ opacity:.7 }}>{new Date(r.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {!rc.length && <div style={{ opacity:.7 }}>Нет чеков</div>}
            </div>
          )}
          {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
