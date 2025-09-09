"use client";
import { useEffect, useState } from 'react';
import { deleteOutbox, listOutbox, retryAll, retryOutbox, type OutboxEvent } from '../../lib/outbox';

export default function OutboxPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [status, setStatus] = useState<string>('PENDING');
  const [type, setType] = useState<string>('');
  const [since, setSince] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [items, setItems] = useState<OutboxEvent[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listOutbox(merchantId, { status: status || undefined, type: type || undefined, since: since || undefined, limit });
      setItems(r);
    } catch (e:any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load().catch(()=>{}); }, []);

  const onRetry = async (id: string) => { await retryOutbox(merchantId, id); await load(); };
  const onDelete = async (id: string) => { await deleteOutbox(merchantId, id); await load(); };
  const onRetryAll = async () => { await retryAll(merchantId, status || undefined); await load(); };

  return (
    <div>
      <h2>Outbox</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} /></label>
        <label>Статус: 
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">— любой —</option>
            <option value="PENDING">PENDING</option>
            <option value="SENDING">SENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD">DEAD</option>
            <option value="SENT">SENT</option>
          </select>
        </label>
        <label>Тип: <input value={type} onChange={e=>setType(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="loyalty.commit" /></label>
        <label>С даты (ISO): <input value={since} onChange={e=>setSince(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="2025-09-01T00:00:00Z" /></label>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'50',10))} style={{ marginLeft: 8, width: 90 }} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
        <button onClick={onRetryAll} disabled={loading} style={{ padding: '6px 10px' }}>Retry All</button>
      </div>
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(ev => (
          <div key={ev.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div><b>{ev.eventType}</b> • <span style={{ opacity: 0.8 }}>{ev.status}</span> • retries: {ev.retries}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>id: {ev.id} • created: {new Date(ev.createdAt).toLocaleString()} • nextRetry: {ev.nextRetryAt ? new Date(ev.nextRetryAt).toLocaleString() : '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={()=>onRetry(ev.id)} style={{ padding: '6px 10px' }}>Retry</button>
                <button onClick={()=>onDelete(ev.id)} style={{ padding: '6px 10px' }}>Delete</button>
              </div>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>{JSON.stringify(ev.payload, null, 2)}</pre>
            {ev.lastError && <div style={{ color: '#f38ba8' }}>lastError: {ev.lastError}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

