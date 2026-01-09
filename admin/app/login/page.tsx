"use client";
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, code: code || undefined }) });
      if (r.ok) {
        location.href = '/';
        return;
      }
      if (r.status === 401) {
        setMsg('Неверный пароль или код.');
        return;
      }
      if (r.status === 429) {
        setMsg('Слишком много попыток. Попробуйте позже.');
        return;
      }
      setMsg('Вход временно недоступен. Попробуйте позже.');
    } catch {
      setMsg('Не удалось подключиться. Попробуйте позже.');
    }
    finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 400, margin: '80px auto', fontFamily: 'system-ui, Arial', color: '#e6edf3' }}>
      <h2>Admin Login</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{ padding: 8 }} />
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="OTP code (если включён)" style={{ padding: 8 }} />
        <button type="submit" disabled={busy} style={{ padding: '8px 12px' }}>Sign in</button>
      </form>
      {msg && <div style={{ marginTop: 12, color: '#f38ba8' }}>{msg}</div>}
    </div>
  );
}
