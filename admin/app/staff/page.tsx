"use client";
import { useEffect, useState } from 'react';
import { type Staff, listStaff, createStaff, updateStaff, deleteStaff, issueStaffToken, revokeStaffToken } from '../../lib/staff';
import { listOutlets, type Outlet } from '../../lib/outlets';
import { listDevices, type Device } from '../../lib/devices';

const ROLES = ['ADMIN','MANAGER','CASHIER'];
const STATUSES = ['ACTIVE','DISABLED'];

export default function StaffPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [items, setItems] = useState<Staff[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('CASHIER');

  const load = async () => {
    setLoading(true);
    try { const [st, o, d] = await Promise.all([listStaff(merchantId), listOutlets(merchantId), listDevices(merchantId)]); setItems(st); setOutlets(o); setDevices(d); }
    catch (e:any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load().catch(()=>{}); }, []);

  const onCreate = async () => {
    try { await createStaff(merchantId, { login: login || undefined, email: email || undefined, role }); setLogin(''); setEmail(''); setRole('CASHIER'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onSave = async (s: Staff) => {
    try { await updateStaff(merchantId, s.id, { login: s.login || undefined, email: s.email || undefined, role: s.role, status: s.status, allowedOutletId: s.allowedOutletId || undefined, allowedDeviceId: s.allowedDeviceId || undefined }); setMsg('Сохранено'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onDelete = async (id: string) => {
    if (!confirm('Удалить сотрудника?')) return;
    try { await deleteStaff(merchantId, id); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onIssueToken = async (id: string) => {
    try { const r = await issueStaffToken(merchantId, id); alert('Staff Key (показывается один раз):\n' + r.token); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };
  const onRevokeToken = async (id: string) => {
    try { await revokeStaffToken(merchantId, id); setMsg('Staff Key отозван'); await load(); }
    catch (e:any) { setMsg(String(e?.message||e)); }
  };

  return (
    <div>
      <h2>Сотрудники</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
      </div>
      <div style={{ background: '#0e1629', padding: 10, borderRadius: 8, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Добавить сотрудника</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Логин" value={login} onChange={e=>setLogin(e.target.value)} />
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <label>Роль:
            <select value={role} onChange={e=>setRole(e.target.value)} style={{ marginLeft: 8 }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button onClick={onCreate} style={{ padding: '6px 10px' }}>Добавить</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(s => (
          <div key={s.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>ID: {s.id.slice(0,8)}…</div>
              <label>Логин: <input value={s.login || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, login:e.target.value}:p))} /></label>
              <label>Email: <input value={s.email || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, email:e.target.value}:p))} /></label>
              <label>Роль:
                <select value={s.role} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, role:e.target.value}:p))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Статус:
                <select value={s.status} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, status:e.target.value}:p))}>
                  {STATUSES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Точка:
                <select value={s.allowedOutletId || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, allowedOutletId:e.target.value || null}:p))}>
                  <option value="">— любая —</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label>Устройство:
                <select value={s.allowedDeviceId || ''} onChange={e=>setItems(prev => prev.map(p=>p.id===s.id?{...p, allowedDeviceId:e.target.value || null}:p))}>
                  <option value="">— любое —</option>
                  {devices.map(d => <option key={d.id} value={d.id}>{d.type} {d.label || ''}</option>)}
                </select>
              </label>
              <button onClick={()=>onSave(s)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={()=>onIssueToken(s.id)} style={{ padding: '6px 10px' }}>Выдать Staff Key</button>
              <button onClick={()=>onRevokeToken(s.id)} style={{ padding: '6px 10px' }}>Отозвать Staff Key</button>
              <button onClick={()=>onDelete(s.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Создано: {new Date(s.createdAt).toLocaleString()} • {s.apiKeyHash ? 'Staff Key выдан' : 'нет Staff Key'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

