'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

type Staff = { id: string; login?: string|null; email?: string|null; role: string; status: string; createdAt: string; allowedOutletId?: string|null; allowedDeviceId?: string|null };

export default function StaffPage() {
  const [items, setItems] = useState<Staff[]>([]);
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('CASHIER');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [lastToken, setLastToken] = useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff`);
      if (!r.ok) throw new Error(await r.text());
      setItems(await r.json());
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); } finally { setLoading(false); }
  }
  async function create() {
    setMsg('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: login||undefined, email: email||undefined, role }) });
      if (!r.ok) throw new Error(await r.text());
      setLogin(''); setEmail(''); setRole('CASHIER');
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }
  async function save(s: Staff) {
    const body = { login: s.login||undefined, email: s.email||undefined, role: s.role, status: s.status, allowedOutletId: s.allowedOutletId||undefined, allowedDeviceId: s.allowedDeviceId||undefined };
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) alert(await r.text());
  }
  async function del(id: string) {
    if (!confirm('Удалить сотрудника?')) return;
    const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff/${id}`, { method: 'DELETE' });
    if (!r.ok) return alert(await r.text());
    load();
  }
  async function issueToken(id: string) {
    setMsg(''); setLastToken('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff/${id}/token`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setLastToken(data.token || '');
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }
  async function revokeToken(id: string) {
    setMsg(''); setLastToken('');
    try {
      const r = await fetch(`/api/admin/merchants/${MERCHANT}/staff/${id}/token`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      await load();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Сотрудники</h1>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
        <Link href="/outbox">Outbox</Link>
        <Link href="/outlets">Outlets</Link>
        <Link href="/devices">Devices</Link>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" style={{ padding: 8 }} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" style={{ padding: 8 }} />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: 8 }}>
          <option value="CASHIER">CASHIER</option>
          <option value="MERCHANT">MERCHANT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button onClick={create} style={{ padding: '8px 12px' }}>Добавить</button>
      </div>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      {lastToken && <div style={{ marginTop: 8, color: '#0a0' }}>Staff Token: <code>{lastToken}</code> (сохраните сейчас — повторно не показывается)</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {items.map(s => (
          <div key={s.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={s.login||''} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,login:e.target.value||null}:x))} placeholder="login" style={{ padding: 8 }} />
              <input value={s.email||''} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,email:e.target.value||null}:x))} placeholder="email" style={{ padding: 8 }} />
              <select value={s.role} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,role:e.target.value}:x))} style={{ padding: 8 }}>
                <option value="CASHIER">CASHIER</option>
                <option value="MERCHANT">MERCHANT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <select value={s.status} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,status:e.target.value}:x))} style={{ padding: 8 }}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
              <input value={s.allowedOutletId||''} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,allowedOutletId:e.target.value||null}:x))} placeholder="allowedOutletId" style={{ padding: 8 }} />
              <input value={s.allowedDeviceId||''} onChange={(e) => setItems(prev => prev.map(x => x.id===s.id?{...x,allowedDeviceId:e.target.value||null}:x))} placeholder="allowedDeviceId" style={{ padding: 8 }} />
              <button onClick={() => save(s)} style={{ padding: '6px 10px' }}>Сохранить</button>
              <button onClick={() => issueToken(s.id)} style={{ padding: '6px 10px' }}>Выдать токен</button>
              <button onClick={() => revokeToken(s.id)} style={{ padding: '6px 10px' }}>Отозвать токен</button>
              <button onClick={() => del(s.id)} style={{ padding: '6px 10px' }}>Удалить</button>
            </div>
            <div style={{ color: '#666' }}>Создан: {new Date(s.createdAt).toLocaleString()}</div>
          </div>
        ))}
        {(!items.length && !loading) && <div style={{ color: '#666' }}>Пока нет сотрудников</div>}
      </div>
    </main>
  );
}
