"use client";
import { useEffect, useState } from 'react';
import { type Outlet, listOutlets, createOutlet, updateOutlet, deleteOutlet } from '../../lib/outlets';

export default function OutletsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [items, setItems] = useState<Outlet[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await listOutlets(merchantId)); } catch (e:any) { setMsg(String(e?.message||e)); } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(()=>{}); }, []);

  const onCreate = async () => {
    try { await createOutlet(merchantId, name, address || undefined); setName(''); setAddress(''); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onSave = async (o: Outlet) => {
    try { await updateOutlet(merchantId, o.id, { name: o.name || undefined, address: o.address || undefined }); setMsg('Сохранено'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onDelete = async (id: string) => {
    if (!confirm('Удалить точку?')) return;
    try { await deleteOutlet(merchantId, id); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };

  return (
    <div>
      <h2>Точки</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      <div style={{ background: '#0e1629', padding: 10, borderRadius: 8, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Добавить точку</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Название" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="Адрес" value={address} onChange={e=>setAddress(e.target.value)} style={{ width: 320 }} />
          <button onClick={onCreate} style={{ padding: '6px 10px' }}>Добавить</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(o => (
          <div key={o.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label>Название: <input value={o.name} onChange={e=>setItems(prev => prev.map(p => p.id===o.id?{...p, name:e.target.value}:p))} /></label>
              <label>Адрес: <input value={o.address || ''} onChange={e=>setItems(prev => prev.map(p => p.id===o.id?{...p, address:e.target.value}:p))} style={{ width: 320 }} /></label>
              <button onClick={()=>onSave(o)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={()=>onDelete(o.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

