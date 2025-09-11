"use client";
import { useEffect, useState } from 'react';
import { listTransactionsAdmin, transactionsCsvUrl } from '../../lib/admin';

export default function TransactionsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [customerId, setCustomerId] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [outletId, setOutletId] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [staffId, setStaffId] = useState<string>('');
  const [limit, setLimit] = useState<number>(20);
  const [items, setItems] = useState<any[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const resp = await listTransactionsAdmin(merchantId, {
        limit,
        type: type || undefined,
        customerId: customerId || undefined,
        outletId: outletId || undefined,
        deviceId: deviceId || undefined,
        staffId: staffId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setItems(resp.items); setNextBefore(resp.nextBefore || null); setMsg('');
    } catch (e: any) { setMsg(String(e?.message || e)); setItems([]); setNextBefore(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load().catch(()=>{}); }, []);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoading(true);
    try {
      const resp = await listTransactionsAdmin(merchantId, {
        limit,
        before: nextBefore,
        type: type || undefined,
        customerId: customerId || undefined,
        outletId: outletId || undefined,
        deviceId: deviceId || undefined,
        staffId: staffId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setItems(prev=>[...prev, ...resp.items]); setNextBefore(resp.nextBefore || null);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  };

  const csvHref = transactionsCsvUrl(merchantId, {
    limit,
    type: type || undefined,
    customerId: customerId || undefined,
    outletId: outletId || undefined,
    deviceId: deviceId || undefined,
    staffId: staffId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <div>
      <h2>Операции</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Клиент: <input value={customerId} onChange={e=>setCustomerId(e.target.value)} /></label>
        <label>Тип: <select value={type} onChange={e=>setType(e.target.value)}>
          <option value="">— любой —</option>
          <option value="EARN">EARN</option>
          <option value="REDEEM">REDEEM</option>
          <option value="REFUND">REFUND</option>
        </select></label>
        <label>Outlet: <input value={outletId} onChange={e=>setOutletId(e.target.value)} /></label>
        <label>Device: <input value={deviceId} onChange={e=>setDeviceId(e.target.value)} /></label>
        <label>Staff: <input value={staffId} onChange={e=>setStaffId(e.target.value)} /></label>
        <label>От (ISO): <input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>До (ISO): <input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} /></label>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'20',10))} style={{ width:80 }} /></label>
        <button onClick={load} disabled={loading} style={{ padding:'6px 10px' }}>Обновить</button>
        <a href={csvHref} download style={{ color:'#89b4fa' }}>Скачать CSV</a>
      </div>
      {msg && <div style={{ color:'#f38ba8', marginBottom:8 }}>{msg}</div>}
      <div style={{ display:'grid', gap:6 }}>
        {items.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
        {items.map(tx => (
          <div key={tx.id} style={{ background:'#0e1629', padding:8, borderRadius:6, display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:6 }}>
            <div>{new Date(tx.createdAt).toLocaleString()}</div>
            <div>{tx.type}</div>
            <div>{tx.amount}</div>
            <div style={{ opacity:0.8 }}>order: {tx.orderId || '—'}</div>
            <div style={{ opacity:0.8 }}>outlet: {tx.outletId || '—'} device: {tx.deviceId || '—'} staff: {tx.staffId || '—'}</div>
          </div>
        ))}
        {nextBefore && <button onClick={loadMore} disabled={loading} style={{ padding:'6px 10px' }}>Загрузить ещё</button>}
      </div>
    </div>
  );
}
