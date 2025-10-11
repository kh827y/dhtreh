"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button } from '@loyalty/ui';

export default function PortalLoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [needCode, setNeedCode] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  async function login() {
    if (loading) return;
    setMsg('');
    setLoading(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        code: needCode ? code.trim() : undefined,
      };
      const r = await fetch('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const t = await r.text();
        if (/TOTP required/i.test(t)) { setNeedCode(true); setMsg('Требуется код аутентификатора'); return; }
        throw new Error(t || 'Ошибка входа');
      }
      location.href = '/';
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display:'grid', placeContent:'center', minHeight:'80vh', padding: 16 }}>
      <Card style={{ minWidth: 360 }}>
        <CardHeader title="Вход в Merchant Portal" subtitle="По email и паролю + код 2FA (если включён)" />
        <CardBody>
          <div style={{ display:'grid', gap: 10 }}>
            <label style={{ display:'grid', gap: 4 }}>
              <span style={{ opacity:.8, fontSize:12 }}>Email</span>
              <input value={email} onChange={e=>{ setEmail(e.target.value); setMsg(''); }} placeholder="you@example.com" type="email" style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
            </label>
            <label style={{ display:'grid', gap: 4 }}>
              <span style={{ opacity:.8, fontSize:12 }}>Пароль</span>
              <input value={password} onChange={e=>{ setPassword(e.target.value); setMsg(''); }} placeholder="••••••••" type="password" style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
            </label>
            {needCode && (
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Код аутентификатора</span>
                <input value={code} onChange={e=>{ setCode(e.target.value); setMsg(''); }} placeholder="123456" inputMode="numeric" maxLength={6} style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
              </label>
            )}
            {!!msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            <div style={{ display:'flex', gap: 8, justifyContent:'flex-end' }}>
              <Button variant="primary" onClick={login} disabled={loading || !email.trim() || !password || (needCode && !code.trim())}>{loading ? 'Входим...' : 'Войти'}</Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
