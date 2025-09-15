"use client";
import { useEffect, useMemo, useState } from 'react';
import { listVouchers, type VoucherListItem, issueVoucher, deactivateVoucher, exportVouchersCsvUrl } from '../../lib/vouchers';

const VALUE_TYPES = ['PERCENTAGE','FIXED_AMOUNT'] as const;

type ValueType = typeof VALUE_TYPES[number];

export default function VouchersPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [items, setItems] = useState<VoucherListItem[]>([]);
  const [status, setStatus] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');

  // Issue form
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [valueType, setValueType] = useState<ValueType>('PERCENTAGE');
  const [value, setValue] = useState<number>(10);
  const [validUntil, setValidUntil] = useState<string>('');
  const [minPurchaseAmount, setMinPurchaseAmount] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await listVouchers(merchantId, { status: status || undefined, limit });
      setItems(res.items || []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally { setLoading(false); }
  };

  useEffect(() => { load().catch(()=>{}); }, []);

  const onIssue = async () => {
    if (!code) { setMsg('Введите код ваучера'); return; }
    try {
      await issueVoucher({ merchantId, name: name || undefined, valueType, value: Math.floor(Number(value) || 0), code, validUntil: validUntil || undefined, minPurchaseAmount: Math.floor(Number(minPurchaseAmount) || 0) });
      setName(''); setCode(''); setValueType('PERCENTAGE'); setValue(10); setValidUntil(''); setMinPurchaseAmount(0);
      await load();
      setMsg('Ваучер выпущен');
    } catch (e:any) { setMsg(String(e?.message || e)); }
  };

  const onDeactivate = async (it: VoucherListItem) => {
    if (!confirm(`Деактивировать ваучер ${it.name || it.id}?`)) return;
    try { await deactivateVoucher({ merchantId, voucherId: it.id }); await load(); }
    catch (e:any) { setMsg(String(e?.message || e)); }
  };

  const csvUrl = useMemo(() => exportVouchersCsvUrl(merchantId, { status: status || undefined }), [merchantId, status]);

  return (
    <div>
      <h2>Ваучеры</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Статус:
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">Любой</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
        <label>Лимит: <input type="number" min={1} max={200} value={limit} onChange={e=>setLimit(Math.max(1, Math.min(200, parseInt(e.target.value || '50', 10) || 50)))} /></label>
        <button onClick={load} disabled={loading} style={{ padding:'6px 10px' }}>Обновить</button>
        <a href={csvUrl} style={{ color:'#89b4fa' }}>Экспорт CSV</a>
      </div>
      <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
        <h3 style={{ marginTop:0 }}>Выпуск ваучера</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input placeholder="Название" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="Код" value={code} onChange={e=>setCode(e.target.value)} />
          <label>Тип:
            <select value={valueType} onChange={e=>setValueType(e.target.value as ValueType)} style={{ marginLeft: 8 }}>
              {VALUE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Значение: <input type="number" value={value} onChange={e=>setValue(parseInt(e.target.value || '0', 10) || 0)} /></label>
          <label>Мин. сумма: <input type="number" value={minPurchaseAmount} onChange={e=>setMinPurchaseAmount(parseInt(e.target.value || '0', 10) || 0)} /></label>
          <label>Действует до: <input type="datetime-local" value={validUntil} onChange={e=>setValidUntil(e.target.value)} /></label>
          <button onClick={onIssue} style={{ padding:'6px 10px' }}>Выпустить</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom:8 }}>{msg}</div>}
      <div style={{ display:'grid', gap:8 }}>
        {items.map(it => (
          <div key={it.id} style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <div>ID: {it.id.slice(0,8)}… • {it.status} {it.isActive ? '' : '(inactive)'} • {it.valueType} {it.value}</div>
              <div>Кодов: {it.codes} (активных {it.activeCodes}, использованных {it.usedCodes})</div>
              <div>Примеры: {it.codeSamples.join(', ')}</div>
              <button onClick={()=>onDeactivate(it)} style={{ padding:'6px 10px' }}>Деактивировать</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
