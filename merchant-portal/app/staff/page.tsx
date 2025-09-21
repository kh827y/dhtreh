"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Staff = { id: string; login?: string|null; email?: string|null; role: string; status: string; createdAt?: string; outletsCount?: number; lastActivityAt?: string };
type Outlet = { id: string; name: string };

export default function StaffPage() {
  const [items, setItems] = React.useState<Staff[]>([]);
  const [outlets, setOutlets] = React.useState<Outlet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [login, setLogin] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('CASHIER');
  const [msg, setMsg] = React.useState('');
  // Create modal state (новый UX)
  const [showCreate, setShowCreate] = React.useState(false);
  const [cName, setCName] = React.useState('');
  const [cSurname, setCSurname] = React.useState('');
  const [cEmail, setCEmail] = React.useState('');
  const [cGroup, setCGroup] = React.useState('CASHIER');
  const [cPortal, setCPortal] = React.useState(false);
  // Filters/search
  const [tab, setTab] = React.useState<'ACTIVE'|'FIRED'>('ACTIVE');
  const [roleFilter, setRoleFilter] = React.useState<string>('ALL');
  const [outletFilter, setOutletFilter] = React.useState<string>('ALL');
  const [onlyPortal, setOnlyPortal] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<string>('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const [stRes, otRes] = await Promise.all([
        fetch('/api/portal/staff'),
        fetch('/api/portal/outlets'),
      ]);
      const st = await stRes.json();
      const ot = await otRes.json();
      setItems(Array.isArray(st) ? st : []);
      setOutlets(Array.isArray(ot) ? ot : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  function isOwner(s: Staff) { return (s.role || '').toUpperCase() === 'MERCHANT'; }
  function hasPortalAccess(s: Staff) { return isOwner(s) || !!s.email; }
  const filtered = items.filter(s => {
    if (tab === 'ACTIVE' && s.status !== 'ACTIVE') return false;
    if (tab === 'FIRED' && s.status === 'ACTIVE') return false;
    if (roleFilter !== 'ALL' && (s.role||'').toUpperCase() !== roleFilter) return false;
    if (onlyPortal && !hasPortalAccess(s)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!((s.login||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q))) return false;
    }
    // outletFilter будет активирован после введения связей staff↔outlet
    return true;
  });

  async function createStaff() {
    // Используем модалку: login = "Имя Фамилия", email — если включён доступ в панель, роль — из select
    setCreating(true); setMsg('');
    try {
      const payload: any = { login: `${cName}${cSurname?(' '+cSurname):''}`.trim() || undefined, email: cPortal ? (cEmail||undefined) : undefined, role: cGroup };
      const r = await fetch('/api/portal/staff', { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text());
      setShowCreate(false);
      setCName(''); setCSurname(''); setCEmail(''); setCGroup('CASHIER'); setCPortal(false);
      await load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setCreating(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Сотрудники</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Создание и управление доступами</div>
        </div>
        <div>
          <Button variant="primary" onClick={()=>setShowCreate(true)}>{'Добавить сотрудника'}</Button>
        </div>
      </div>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          <button className={tab==='ACTIVE'?'btn btn-primary':'btn'} onClick={()=>setTab('ACTIVE')}>Работает</button>
          <button className={tab==='FIRED'?'btn btn-primary':'btn'} onClick={()=>setTab('FIRED')}>Уволен</button>
        </div>
        <div style={{ opacity:.7 }}>Найдено: {filtered.length}</div>
      </div>
      <div style={{ display:'grid', gap:10, gridTemplateColumns:'180px 200px auto 1fr 260px' }}>
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{ padding:8 }}>
          <option value="ALL">Все роли</option>
          <option value="MERCHANT">MERCHANT</option>
          <option value="CASHIER">CASHIER</option>
        </select>
        <select value={outletFilter} onChange={e=>setOutletFilter(e.target.value)} style={{ padding:8 }}>
          <option value="ALL">Все торговые точки</option>
          {outlets.map(o=> <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="checkbox" checked={onlyPortal} onChange={e=>setOnlyPortal(e.target.checked)} /> Только с доступом в панель
        </label>
        <div />
        <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end' }}>
          <input placeholder="Поиск по имени или e-mail" value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:8, minWidth: 260 }} />
        </div>
      </div>
      {/* Удалили инлайн-форму, используем модалку создания */}
      <Card>
        <CardHeader title="Список сотрудников" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 220px', fontSize:12, opacity:.8 }}>
                <div>Имя</div>
                <div>Торговые точки</div>
                <div>Активность <span title="Дата последней транзакции или входа в панель управления" style={{ border:'1px solid rgba(255,255,255,.3)', borderRadius:'50%', display:'inline-flex', width:14, height:14, alignItems:'center', justifyContent:'center', fontSize:10, marginLeft:6 }}>?</span></div>
                <div>Доступ в панель управления</div>
              </div>
              {filtered.map(s => (
                <a key={s.id} href={`/staff/${encodeURIComponent(s.id)}`} style={{ textDecoration:'none', color:'inherit' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 220px', gap: 8, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,.08)' }} />
                      <div style={{ display:'grid' }}>
                        <div style={{ fontWeight:600 }}>{s.login || '—'}</div>
                        <div style={{ opacity:.7, fontSize:12 }}>{s.role}</div>
                      </div>
                    </div>
                    <div style={{ opacity:.9 }}>{typeof s.outletsCount === 'number' ? s.outletsCount : '—'}</div>
                    <div style={{ opacity:.9 }}>{s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : '—'}</div>
                    <div>{hasPortalAccess(s) ? <span style={{ color:'#4ade80' }}>Да</span> : <span style={{ opacity:.6 }}>Нет</span>}</div>
                  </div>
                </a>
              ))}
              {!filtered.length && <div style={{ opacity:.7 }}>Нет сотрудников</div>}
            </div>
          )}
        </CardBody>
      </Card>

      {showCreate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:50 }}>
          <div style={{ width:'min(720px, 96vw)', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, boxShadow:'0 10px 40px rgba(0,0,0,.4)' }}>
            <div style={{ padding:16, borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:16, fontWeight:700 }}>Новый сотрудник</div>
              <button className="btn btn-ghost" onClick={()=>setShowCreate(false)}>✕</button>
            </div>
            <div style={{ padding:16, display:'grid', gap:12 }}>
              <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr' }}>
                <input placeholder="Имя" value={cName} onChange={e=>setCName(e.target.value)} style={{ padding:8 }} />
                <input placeholder="Фамилия" value={cSurname} onChange={e=>setCSurname(e.target.value)} style={{ padding:8 }} />
              </div>
              <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr' }}>
                <label style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="checkbox" checked={cPortal} onChange={e=>setCPortal(e.target.checked)} /> Доступ в панель
                </label>
                <select value={cGroup} onChange={e=>setCGroup(e.target.value)} style={{ padding:8 }}>
                  <option value="MERCHANT">MERCHANT</option>
                  <option value="CASHIER">CASHIER</option>
                </select>
              </div>
              <div>
                <input placeholder="E-mail (для входа в панель)" value={cEmail} onChange={e=>setCEmail(e.target.value)} style={{ padding:8, width:'100%' }} disabled={!cPortal} />
              </div>
              {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
            </div>
            <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn" onClick={()=>setShowCreate(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={createStaff} disabled={creating || !cName.trim()}>{creating?'Создание…':'Создать'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
