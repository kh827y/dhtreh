"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type CashierCreds = { login: string|null; password: string|null; hasPassword: boolean };
type StaffRow = { id: string; login?: string; role: string; outletsCount?: number; lastActivityAt?: string|null };
type AccessRow = { outletId: string; outletName: string; pinCode?: string|null; lastTxnAt?: string|null };

export default function CashierPanelPage() {
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [creds, setCreds] = React.useState<CashierCreds|null>(null);
  const [rotBusy, setRotBusy] = React.useState(false);
  const [lastPassword, setLastPassword] = React.useState<string>('');
  const [regenLogin, setRegenLogin] = React.useState(false);

  const [staff, setStaff] = React.useState<StaffRow[]>([]);
  const [exp, setExp] = React.useState<Record<string, boolean>>({});
  const [accessMap, setAccessMap] = React.useState<Record<string, AccessRow[]>>({});

  const formatPassword = React.useCallback((value?: string | null) => {
    if (!value) return '—';
    const digits = String(value).replace(/[^0-9]/g, '').slice(0, 9);
    if (!digits) return '—';
    const parts: string[] = [];
    for (let i = 0; i < digits.length; i += 3) {
      parts.push(digits.slice(i, Math.min(i + 3, digits.length)));
    }
    return parts.join('-');
  }, []);

  async function loadCreds() {
    try {
      const r = await fetch('/api/portal/cashier');
      const data = await r.json();
      setCreds({ login: data?.login ?? null, password: data?.password ?? null, hasPassword: !!data?.hasPassword });
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }
  async function loadStaff() {
    try {
      const r = await fetch('/api/portal/staff');
      const data = await r.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }
  React.useEffect(()=>{
    (async()=>{ setLoading(true); setMsg(''); await Promise.all([loadCreds(), loadStaff()]); setLoading(false); })();
  },[]);

  async function rotate() {
    setRotBusy(true); setMsg('');
    try {
      const r = await fetch('/api/portal/cashier/rotate', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ regenerateLogin: regenLogin }) });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const nextPassword = String(data?.password || '');
      setLastPassword(nextPassword);
      setCreds(prev => ({ login: data?.login ?? prev?.login ?? null, password: nextPassword || prev?.password || null, hasPassword: true }));
      await loadCreds();
    } catch (e:any) { setMsg(String(e?.message||e)); }
    finally { setRotBusy(false); }
  }

  async function toggleAccess(staffId: string) {
    const now = !!exp[staffId];
    setExp(s => ({ ...s, [staffId]: !now }));
    if (!now) {
      try {
        const r = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access`);
        const data = await r.json();
        setAccessMap(m => ({ ...m, [staffId]: Array.isArray(data) ? data : [] }));
      } catch (e:any) { setMsg(String(e?.message||e)); }
    }
  }
  async function regenPin(staffId: string, outletId: string) {
    try {
      const r = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(outletId)}/regenerate-pin`, { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      await toggleAccess(staffId); // collapse
      await toggleAccess(staffId); // re-expand and reload
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }
  async function revokeAccess(staffId: string, outletId: string) {
    try {
      const r = await fetch(`/api/portal/staff/${encodeURIComponent(staffId)}/access/${encodeURIComponent(outletId)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      await toggleAccess(staffId); await toggleAccess(staffId);
    } catch (e:any) { setMsg(String(e?.message||e)); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Панель кассира</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Логин мерчанта, общий 9‑значный пароль и пин‑коды сотрудников по точкам</div>
        </div>
      </div>

      <Card>
        <CardHeader title="Доступ кассира (общий)" subtitle="Логин мерчанта и 9‑значный пароль" />
        <CardBody>
          {loading ? (
            <Skeleton height={80} />
          ) : (
            <div style={{ display:'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
              <div style={{ display:'grid', gap: 8 }}>
                <div>
                  <span style={{ opacity:.7, fontSize:12 }}>Логин мерчанта</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <code style={{ fontSize:16, fontWeight:700, background:'rgba(255,255,255,.06)', padding:'4px 8px', borderRadius:6 }}>{creds?.login || 'не задан'}</code>
                    {creds?.login && (
                      <button className="btn btn-ghost" onClick={()=>{ navigator.clipboard?.writeText(creds.login as string).catch(()=>{}); }}>Скопировать</button>
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ opacity:.7, fontSize:12 }}>Пароль (9 цифр)</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <code style={{ fontSize:16, fontWeight:700, background:'rgba(255,255,255,.06)', padding:'4px 8px', borderRadius:6 }}>
                      {creds?.password ? formatPassword(creds.password) : 'не установлен'}
                    </code>
                    {creds?.password && (
                      <button className="btn btn-ghost" onClick={()=>{ navigator.clipboard?.writeText(creds.password as string).catch(()=>{}); }}>Скопировать</button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display:'grid', gap: 6, alignContent:'start' }}>
                <label style={{ display:'flex', alignItems:'center', gap: 8 }}>
                  <input type="checkbox" checked={regenLogin} onChange={e=>setRegenLogin(e.target.checked)} /> Сгенерировать новый логин
                </label>
                <Button variant="primary" disabled={rotBusy} onClick={rotate}>{rotBusy ? 'Обновление…' : 'Сгенерировать пароль'}</Button>
              </div>
              {msg && <div style={{ gridColumn:'1/-1', color:'#f87171' }}>{msg}</div>}
              {lastPassword && (
                <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ opacity:.7, fontSize:12 }}>Новый пароль:</div>
                  <code style={{ padding:'2px 6px', borderRadius:6, background:'rgba(255,255,255,.06)', fontSize:16 }}>{formatPassword(lastPassword)}</code>
                  <button className="btn btn-ghost" onClick={()=>{ try { navigator.clipboard.writeText(lastPassword); } catch{} }}>Скопировать</button>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Пин‑коды сотрудников по точкам" subtitle="Управление доступом к панели кассира" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 180px 120px 120px', fontSize:12, opacity:.8 }}>
                <div>Сотрудник</div>
                <div>Роль</div>
                <div>Точек доступа</div>
                <div>Последняя активность</div>
                <div>Действия</div>
              </div>
              {staff.map(s => (
                <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 180px 120px 120px', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{s.login || s.id}</div>
                    <div style={{ opacity:.8, fontSize:12 }}>{s.id}</div>
                  </div>
                  <div>{s.role}</div>
                  <div>{s.outletsCount ?? '—'}</div>
                  <div>{s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : '—'}</div>
                  <div><Button size="sm" onClick={()=>toggleAccess(s.id)}>{exp[s.id] ? 'Скрыть пины' : 'Показать пины'}</Button></div>
                  {exp[s.id] && (
                    <div style={{ gridColumn:'1/-1', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                      <div style={{ display:'grid', gap: 6 }}>
                        {(accessMap[s.id]||[]).map(a => (
                          <div key={a.outletId} style={{ display:'grid', gridTemplateColumns:'1fr 120px 180px 160px', gap: 8, alignItems:'center' }}>
                            <div><b>{a.outletName}</b> <span style={{ opacity:.6, fontSize:12 }}>({a.outletId})</span></div>
                            <div style={{ fontVariantNumeric:'tabular-nums' }}>PIN: <b>{a.pinCode || '—'}</b></div>
                            <div>
                              <Button size="sm" variant="secondary" onClick={()=>regenPin(s.id, a.outletId)}>Обновить PIN</Button>
                              <Button size="sm" style={{ marginLeft: 8 }} variant="ghost" onClick={()=>revokeAccess(s.id, a.outletId)}>Отозвать</Button>
                            </div>
                            <div style={{ opacity:.7, fontSize:12 }}>{a.lastTxnAt ? ('посл.: ' + new Date(a.lastTxnAt).toLocaleString()) : ''}</div>
                          </div>
                        ))}
                        {!(accessMap[s.id]||[]).length && <div style={{ opacity:.7 }}>Нет точек. Добавьте доступ на странице сотрудника.</div>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
