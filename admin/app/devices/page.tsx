"use client";
import { useEffect, useState } from 'react';
import { type Device, listDevices, createDevice, updateDevice, deleteDevice, issueDeviceSecret, revokeDeviceSecret } from '../../lib/devices';
import { listOutlets, type Outlet } from '../../lib/outlets';

const DEVICE_TYPES = ['SMART','PC_POS','VIRTUAL'];

export default function DevicesPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [items, setItems] = useState<Device[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [type, setType] = useState<string>('SMART');
  const [outletId, setOutletId] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    try { const [d, o] = await Promise.all([listDevices(merchantId), listOutlets(merchantId)]); setItems(d); setOutlets(o); } catch (e:any) { setMsg(String(e?.message||e)); } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(()=>{}); }, []);

  const onCreate = async () => {
    try { await createDevice(merchantId, { type, outletId: outletId || undefined, label: label || undefined }); setType('SMART'); setOutletId(''); setLabel(''); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onSave = async (d: Device) => {
    try { await updateDevice(merchantId, d.id, { outletId: d.outletId || undefined, label: d.label || undefined }); setMsg('Сохранено'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onDelete = async (id: string) => {
    if (!confirm('Удалить устройство?')) return;
    try { await deleteDevice(merchantId, id); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onIssueSecret = async (id: string) => {
    try { const r = await issueDeviceSecret(merchantId, id); alert('Секрет устройства (показывается один раз):\n' + r.secret); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onRevokeSecret = async (id: string) => {
    try { await revokeDeviceSecret(merchantId, id); setMsg('Секрет отозван'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };

  return (
    <div>
      <h2>Устройства</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      <div style={{ background: '#0e1629', padding: 10, borderRadius: 8, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Добавить устройство</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label>Тип: 
            <select value={type} onChange={e=>setType(e.target.value)} style={{ marginLeft: 8 }}>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Точка: 
            <select value={outletId} onChange={e=>setOutletId(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">— не привязано —</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <input placeholder="Метка устройства" value={label} onChange={e=>setLabel(e.target.value)} />
          <button onClick={onCreate} style={{ padding: '6px 10px' }}>Добавить</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(d => (
          <div key={d.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>ID: {d.id.slice(0,8)}… • {d.type}</div>
              <label>Метка: <input value={d.label || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===d.id?{...p, label:e.target.value}:p))} /></label>
              <label>Точка: 
                <select value={d.outletId || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===d.id?{...p, outletId:e.target.value || null}:p))}>
                  <option value="">— не привязано —</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <button onClick={()=>onSave(d)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={()=>onIssueSecret(d.id)} style={{ padding: '6px 10px' }}>Выдать секрет</button>
              <button onClick={()=>onRevokeSecret(d.id)} style={{ padding: '6px 10px' }}>Отозвать секрет</button>
              <button onClick={()=>onDelete(d.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Создано: {new Date(d.createdAt).toLocaleString()} • lastSeen: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

