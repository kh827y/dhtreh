"use client";
import { useState } from 'react';

export default function ExportsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [limit, setLimit] = useState<number>(1000);
  const [orderId, setOrderId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');

  const csvUrl = (path: string, params: Record<string,string|number|undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v!=null && v!=='') q.set(k, String(v)); });
    return `/api/admin/merchants/${encodeURIComponent(merchantId)}${path}${q.toString()?`?${q.toString()}`:''}`;
  };

  return (
    <div>
      <h2>Экспорт CSV</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'1000',10))} style={{ width: 100 }} /></label>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Операции</h3>
          <a href={csvUrl('/transactions.csv', { limit })} style={{ color: '#89b4fa' }}>Скачать transactions.csv</a>
        </div>
        <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Чеки</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>OrderId: <input value={orderId} onChange={e=>setOrderId(e.target.value)} /></label>
            <label>CustomerId: <input value={customerId} onChange={e=>setCustomerId(e.target.value)} /></label>
          </div>
          <a href={csvUrl('/receipts.csv', { limit, orderId: orderId || undefined, customerId: customerId || undefined })} style={{ color: '#89b4fa' }}>Скачать receipts.csv</a>
        </div>
        <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Леджер</h3>
          <a href={csvUrl('/ledger.csv', { limit })} style={{ color: '#89b4fa' }}>Скачать ledger.csv</a>
        </div>
      </div>
    </div>
  );
}

