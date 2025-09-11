"use client";
import { useState } from 'react';
import { customerSearch, customerSummary, transactionsCsvUrl, receiptsCsvUrl, listTransactionsAdmin, listReceiptsAdmin, type CustomerSummary } from '../../lib/admin';

export default function CustomersPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [phone, setPhone] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [found, setFound] = useState<{ customerId: string; phone: string; balance: number } | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [txItems, setTxItems] = useState<any[]>([]);
  const [txNextBefore, setTxNextBefore] = useState<string | null>(null);
  const [rcItems, setRcItems] = useState<any[]>([]);
  const [rcBefore, setRcBefore] = useState<string | undefined>(undefined);
  const [txType, setTxType] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(20);

  const doSearch = async () => {
    setBusy(true); setMsg(''); setSummary(null);
    try {
      const r = await customerSearch(merchantId, phone.trim());
      setFound(r);
      if (!r) setMsg('Клиент не найден');
      if (r) {
        const s = await customerSummary(merchantId, r.customerId);
        setSummary(s);
        // prime paged lists
        const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, customerId: r.customerId, type: txType || undefined });
        setTxItems(tx.items); setTxNextBefore(tx.nextBefore || null);
        const rc = await listReceiptsAdmin(merchantId, { limit: pageSize, customerId: r.customerId });
        setRcItems(rc); setRcBefore(undefined);
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setFound(null); setSummary(null); setTxItems([]); setRcItems([]);
    } finally { setBusy(false); }
  };

  const txCsv = found ? transactionsCsvUrl(merchantId, { customerId: found.customerId }) : '#';
  const rcCsv = found ? receiptsCsvUrl(merchantId, { customerId: found.customerId }) : '#';

  const loadMoreTx = async () => {
    if (!found) return;
    const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, before: txNextBefore || undefined, customerId: found.customerId, type: txType || undefined });
    setTxItems(prev=>[...prev, ...tx.items]); setTxNextBefore(tx.nextBefore || null);
  };
  const reloadTx = async () => {
    if (!found) return;
    const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, customerId: found.customerId, type: txType || undefined });
    setTxItems(tx.items); setTxNextBefore(tx.nextBefore || null);
  };
  const loadMoreRc = async () => {
    if (!found) return;
    const rc = await listReceiptsAdmin(merchantId, { limit: pageSize, before: rcBefore, customerId: found.customerId });
    setRcItems(prev=>[...prev, ...rc]);
    if (rc.length > 0) setRcBefore(rc[rc.length-1].createdAt);
  };

  return (
    <div>
      <h2>Клиенты</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Телефон клиента: <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+7..." /></label>
        <button onClick={doSearch} disabled={busy} style={{ padding:'6px 10px' }}>Искать</button>
      </div>
      {msg && <div style={{ color:'#f38ba8', marginBottom:8 }}>{msg}</div>}

      {found && (
        <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
          <div style={{ marginBottom:6 }}>Найден клиент: <b>{found.customerId}</b> (тел: {found.phone})</div>
          <div style={{ marginBottom:6 }}>Баланс: <b>{found.balance}</b></div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <a href={txCsv} download style={{ color:'#89b4fa' }}>Скачать transactions.csv</a>
            <a href={rcCsv} download style={{ color:'#89b4fa' }}>Скачать receipts.csv</a>
          </div>
        </div>
      )}

      {summary && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <h3 style={{ marginTop:0 }}>Последние операции</h3>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
              <label>Тип:
                <select value={txType} onChange={e=>setTxType(e.target.value)} style={{ marginLeft:8 }}>
                  <option value="">— любой —</option>
                  <option value="EARN">EARN</option>
                  <option value="REDEEM">REDEEM</option>
                  <option value="REFUND">REFUND</option>
                </select>
              </label>
              <label>Page size: <input type="number" value={pageSize} onChange={e=>setPageSize(parseInt(e.target.value||'20',10))} style={{ marginLeft:8, width:80 }} /></label>
              <button onClick={reloadTx} style={{ padding:'6px 10px' }}>Обновить</button>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              {txItems.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
              {txItems.map(tx => (
                <div key={tx.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
                  <div>{new Date(tx.createdAt).toLocaleString()}</div>
                  <div>{tx.type}</div>
                  <div>{tx.amount}</div>
                  <div style={{ opacity:0.8 }}>order: {tx.orderId || '—'}</div>
                </div>
              ))}
              {txNextBefore && <button onClick={loadMoreTx} style={{ padding:'6px 10px' }}>Загрузить ещё</button>}
            </div>
          </div>
          <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <h3 style={{ marginTop:0 }}>Последние чеки</h3>
            <div style={{ display:'grid', gap:6 }}>
              {rcItems.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
              {rcItems.map(r => (
                <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:6 }}>
                  <div>{new Date(r.createdAt).toLocaleString()}</div>
                  <div>order: {r.orderId}</div>
                  <div>total: {r.total}</div>
                  <div>redeem: {r.redeemApplied}</div>
                  <div>earn: {r.earnApplied}</div>
                </div>
              ))}
              <button onClick={loadMoreRc} style={{ padding:'6px 10px' }}>Загрузить ещё</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
