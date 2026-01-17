"use client";
import React from 'react';
import { listMerchants, createMerchant, updateMerchant as apiUpdateMerchant, setPortalLoginEnabled, initTotp, verifyTotp, disableTotp, impersonatePortal, getCashier, rotateCashier, setCashier as apiSetCashier, grantSubscription as apiGrantSubscription, resetSubscription as apiResetSubscription, updateMerchantSettings, type MerchantRow } from "../../lib/merchants";

const PORTAL_BASE = process.env.NEXT_PUBLIC_PORTAL_BASE || 'http://localhost:3004';

function parseOptionalPositiveInt(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export default function AdminMerchantsPage() {
  const [items, setItems] = React.useState<MerchantRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [ownerName, setOwnerName] = React.useState('');
  const [maxOutlets, setMaxOutlets] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [totp, setTotp] = React.useState<{ merchantId: string; secret: string; otpauth: string }|null>(null);
  const [code, setCode] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [subscriptionFilter, setSubscriptionFilter] = React.useState<'all'|'active'|'expiring'|'expired'>('all');
  const maxOutletsParsed = parseOptionalPositiveInt(maxOutlets);
  const maxOutletsInvalid = maxOutletsParsed === null;

  async function load() {
    setLoading(true); setMsg('');
    try { setItems(await listMerchants()); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);
  const stats = React.useMemo(() => {
    const total = items.length;
    const expired = items.filter((m) => m.subscriptionExpired).length;
    const expiring = items.filter((m) => !m.subscriptionExpired && m.subscriptionExpiresSoon).length;
    const loginDisabled = items.filter((m) => m.portalLoginEnabled === false).length;
    const active = items.filter((m) => (m.subscriptionStatus || '').toLowerCase() === 'active').length;
    return { total, expired, expiring, loginDisabled, active };
  }, [items]);
  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      const matchesQuery = !q || `${m.id} ${m.name} ${m.portalEmail || ''}`.toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (subscriptionFilter === 'active' && m.subscriptionExpired) return false;
      if (subscriptionFilter === 'expiring' && !(m.subscriptionExpiresSoon && !m.subscriptionExpired)) return false;
      if (subscriptionFilter === 'expired' && !m.subscriptionExpired) return false;
      return true;
    });
  }, [items, search, subscriptionFilter]);

  async function create() {
    setMsg('');
    const parsedLimit = parseOptionalPositiveInt(maxOutlets);
    if (parsedLimit === null) {
      setMsg('Лимит торговых точек должен быть целым числом >= 1');
      return;
    }
    try {
      await createMerchant(
        name.trim(),
        email.trim().toLowerCase(),
        password,
        ownerName.trim() || undefined,
        parsedLimit ?? undefined,
      );
      setName(''); setEmail(''); setPassword(''); setOwnerName(''); setMaxOutlets('');
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function saveRow(id: string, fields: { name?: string; email?: string; password?: string }) {
    setMsg('');
    try { await apiUpdateMerchant(id, fields); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function updateMaxOutlets(id: string, maxOutletsValue: number | null) {
    await updateMerchantSettings(id, {
      maxOutlets: maxOutletsValue,
    });
    await load();
  }
  async function toggleLogin(id: string, enabled: boolean) {
    setMsg(''); try { await setPortalLoginEnabled(id, enabled); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function grantPlan(id: string, days: number) {
    setMsg('');
    try {
      await apiGrantSubscription(id, { days, planId: 'plan_full' });
      await load();
      setMsg('Подписка обновлена');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }
  async function resetPlan(id: string) {
    setMsg('');
    try {
      await apiResetSubscription(id);
      await load();
      setMsg('Подписка сброшена');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }
  async function doInitTotp(id: string) {
    setMsg(''); setTotp(null); setCode('');
    try { const r = await initTotp(id); setTotp({ merchantId: id, secret: r.secret, otpauth: r.otpauth }); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function doVerifyTotp(id: string) {
    setMsg('');
    try { await verifyTotp(id, code.trim()); setMsg('TOTP включён'); setTotp(null); setCode(''); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function doDisableTotp(id: string) {
    setMsg(''); try { await disableTotp(id); setMsg('TOTP выключен'); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function openAs(id: string) {
    setMsg('');
    try { 
      const r = await impersonatePortal(id);
      const url = `${PORTAL_BASE}/api/session/accept-token?token=${encodeURIComponent(r.token)}&redirect=${encodeURIComponent('/')}`;
      window.open(url, '_blank');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <main style={{ maxWidth: 980, margin: '32px auto', fontFamily: 'system-ui, Arial' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Мерчанты</h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, opacity:.8 }}>Данные загружаются из API (без моков)</span>
          <button onClick={load} disabled={loading} style={{ padding:'8px 12px' }}>{loading ? 'Обновление…' : 'Обновить список'}</button>
        </div>
      </div>

      <div style={{ display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', marginBottom: 12 }}>
        <StatTile label="Всего" value={stats.total} />
        <StatTile label="Активные" value={stats.active} color="#a6e3a1" />
        <StatTile label="Истекает скоро" value={stats.expiring} color="#f9e2af" />
        <StatTile label="Истекла подписка" value={stats.expired} color="#f38ba8" />
        <StatTile label="Логин отключён" value={stats.loginDisabled} color="#f9e2af" />
      </div>

      <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom: 16 }}>
        <label style={{ display:'flex', flexDirection:'column', gap:4, color:'#cbd5e1', fontSize:13 }}>
          Поиск (id/название/логин)
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск..." style={{ padding: 8, minWidth:240 }} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:4, color:'#cbd5e1', fontSize:13 }}>
          Подписка
          <select value={subscriptionFilter} onChange={e=>setSubscriptionFilter(e.target.value as any)} style={{ padding: 8, minWidth:180 }}>
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="expiring">Истекает скоро</option>
            <option value="expired">Истекла</option>
          </select>
        </label>
        <div style={{ fontSize:13, opacity:.8 }}>Показано: {filteredItems.length} из {items.length}</div>
      </div>

      <div style={{ background:'#0e1629', border:'1px solid #1e2a44', borderRadius:10, padding:12, marginBottom:16 }}>
        <div style={{ fontWeight:600, marginBottom:8 }}>Создать мерчанта</div>
        <div style={{ display:'grid', gap: 8, alignItems:'center', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto' }}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Название мерчанта" style={{ padding: 8 }} />
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Логин" type="text" autoComplete="username" style={{ padding: 8 }} />
          <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль (мин. 6)" type="password" style={{ padding: 8 }} />
          <input value={ownerName} onChange={e=>setOwnerName(e.target.value)} placeholder="Имя владельца (обяз.)" style={{ padding: 8 }} />
          <input value={maxOutlets} onChange={e=>setMaxOutlets(e.target.value)} placeholder="Лимит точек (опц.)" type="number" min={1} inputMode="numeric" style={{ padding: 8 }} />
          <button onClick={create} disabled={!name.trim() || !email.trim() || password.length < 6 || !ownerName.trim() || maxOutletsInvalid} style={{ padding: '8px 12px' }}>Создать</button>
        </div>
        <div style={{ fontSize:12, opacity:.8, marginTop:6 }}>Требуется минимум: имя, логин, пароль (≥6), имя владельца. Лимит точек можно не задавать — тогда ограничений нет.</div>
      </div>
      {msg && <div style={{ marginBottom: 12, color: '#f44' }}>{msg}</div>}
      <div style={{ display:'grid', gap: 12 }}>
        {filteredItems.map(m => (
          <div key={m.id} style={{ border:'1px solid #ddd', borderRadius: 10, padding: 12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, flexWrap:'wrap' }}>
              <RowEditor
                row={m}
                onSave={saveRow}
                onGrantSubscription={grantPlan}
                onResetSubscription={resetPlan}
                onUpdateMaxOutlets={updateMaxOutlets}
              />
              <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
                <button onClick={()=>openAs(m.id)} style={{ padding: '6px 10px' }}>Открыть как мерчант</button>
                <label style={{ display:'flex', gap: 6, alignItems:'center' }}>
                  <input type="checkbox" checked={!!m.portalLoginEnabled} onChange={e=>toggleLogin(m.id, e.target.checked)} /> Вход включён
                </label>
                {m.portalTotpEnabled ? (
                  <button onClick={()=>doDisableTotp(m.id)} style={{ padding: '6px 10px' }}>Отключить TOTP</button>
                ) : (
                  <button onClick={()=>doInitTotp(m.id)} style={{ padding: '6px 10px' }}>Включить TOTP</button>
                )}
              </div>
            </div>
            {totp && totp.merchantId === m.id && (
              <div style={{ marginTop: 10, borderTop:'1px dashed #ccc', paddingTop: 10 }}>
                <div style={{ display:'grid', gap: 6 }}>
                  <div>Секрет: <code>{totp.secret}</code></div>
                  <div style={{ opacity:.7, fontSize:12, wordBreak:'break-all' }}>otpauth: {totp.otpauth}</div>
                  <label style={{ display:'flex', gap: 8, alignItems:'center' }}>
                    Код: <input value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" inputMode="numeric" style={{ padding: 6 }} />
                    <button onClick={()=>doVerifyTotp(m.id)} style={{ padding:'6px 10px' }}>Подтвердить</button>
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
        {(!filteredItems.length && !loading) && <div style={{ opacity:.7 }}>Нет подходящих мерчантов под фильтры</div>}
      </div>
    </main>
  );
}

function StatTile({ label, value, color = '#e6edf3' }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background:'#0e1629', border:'1px solid #1e2a44', borderRadius:10, padding:10 }}>
      <div style={{ fontSize:12, color:'#9fb0c9' }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color }}>{value}</div>
    </div>
  );
}

function RowEditor({ row, onSave, onGrantSubscription, onResetSubscription, onUpdateMaxOutlets }: {
  row: MerchantRow;
  onSave: (id: string, patch: { name?: string; email?: string; password?: string }) => void;
  onGrantSubscription: (id: string, days: number) => void;
  onResetSubscription: (id: string) => void;
  onUpdateMaxOutlets: (id: string, maxOutletsValue: number | null) => Promise<void>;
}) {
  const [name, setName] = React.useState(row.name);
  const [email, setEmail] = React.useState(row.portalEmail || '');
  const [pwd, setPwd] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [cashier, setCashier] = React.useState<{ login: string|null }|null>(null);
  const [cashierMsg, setCashierMsg] = React.useState('');
  const [cashierInput, setCashierInput] = React.useState('');
  const [subscriptionDays, setSubscriptionDays] = React.useState(30);
  const [subscriptionMsg, setSubscriptionMsg] = React.useState('');
  const [subscriptionBusy, setSubscriptionBusy] = React.useState(false);
  const [maxOutletsInput, setMaxOutletsInput] = React.useState(
    row.maxOutlets != null ? String(row.maxOutlets) : '',
  );
  const [maxOutletsMsg, setMaxOutletsMsg] = React.useState('');
  const [maxOutletsBusy, setMaxOutletsBusy] = React.useState(false);
  const parsedMaxOutlets = parseOptionalPositiveInt(maxOutletsInput);
  const maxOutletsInvalid = parsedMaxOutlets === null;
  async function save() {
    setSaving(true);
    try {
      const patch: { name?: string; email?: string; password?: string } = {};
      const nextName = name.trim();
      if (nextName && nextName !== row.name) patch.name = nextName;
      const nextLogin = email.trim();
      const currentLogin = row.portalEmail ?? '';
      if (nextLogin && nextLogin !== currentLogin) patch.email = nextLogin;
      if (pwd.trim()) patch.password = pwd;
      if (Object.keys(patch).length === 0) return;
      await onSave(row.id, patch);
      setPwd('');
    } finally {
      setSaving(false);
    }
  }
  async function loadCashier() {
    setCashierMsg('');
    try {
      const current = await getCashier(row.id);
      setCashier(current);
      setCashierInput(current.login || '');
    } catch (e: any) {
      setCashierMsg(String(e?.message || e));
    }
  }
  async function rotateLogin(regenLogin?: boolean) {
    setCashierMsg('');
    try {
      const r = await rotateCashier(row.id, !!regenLogin);
      setCashier({ login: r.login });
      setCashierInput(r.login || '');
      setCashierMsg('Логин кассира обновлён');
    } catch (e: any) { setCashierMsg(String(e?.message || e)); }
  }
  async function saveCashierLogin() {
    setCashierMsg('');
    const nextLogin = cashierInput.trim();
    if (!nextLogin) {
      setCashierMsg('Введите логин кассира');
      return;
    }
    try {
      const r = await apiSetCashier(row.id, nextLogin);
      setCashier({ login: r.login });
      setCashierInput(r.login || '');
      setCashierMsg('Логин кассира обновлён');
    } catch (e: any) {
      setCashierMsg(String(e?.message || e));
    }
  }
  async function grantSubscription() {
    const days = Number(subscriptionDays);
    if (!Number.isFinite(days) || days <= 0) {
      setSubscriptionMsg('Укажите срок в днях (>0)');
      return;
    }
    setSubscriptionBusy(true);
    setSubscriptionMsg('');
    try {
      await onGrantSubscription(row.id, days);
      setSubscriptionMsg('Подписка обновлена');
    } catch (e: any) {
      setSubscriptionMsg(String(e?.message || e));
    } finally {
      setSubscriptionBusy(false);
    }
  }
  async function resetSubscription() {
    setSubscriptionBusy(true);
    setSubscriptionMsg('');
    try {
      await onResetSubscription(row.id);
      setSubscriptionMsg('Подписка сброшена');
    } catch (e: any) {
      setSubscriptionMsg(String(e?.message || e));
    } finally {
      setSubscriptionBusy(false);
    }
  }
  async function saveMaxOutlets() {
    setMaxOutletsMsg('');
    const limit = parseOptionalPositiveInt(maxOutletsInput);
    if (limit === null) {
      setMaxOutletsMsg('Лимит должен быть целым числом ≥ 1');
      return;
    }
    setMaxOutletsBusy(true);
    try {
      await onUpdateMaxOutlets(row.id, limit ?? null);
      setMaxOutletsMsg('Лимит обновлён');
    } catch (e: any) {
      setMaxOutletsMsg(String(e?.message || e));
    } finally {
      setMaxOutletsBusy(false);
    }
  }
  const expiresLabel = row.subscriptionEndsAt ? new Date(row.subscriptionEndsAt).toLocaleString('ru-RU') : '—';
  const daysLeftLabel = row.subscriptionDaysLeft != null ? `${row.subscriptionDaysLeft} дн.` : '—';
  const subscriptionStatus = row.subscriptionStatus || 'missing';
  const subscriptionPlan = row.subscriptionPlanName || '—';
  const subscriptionBadgeColor = row.subscriptionExpired
    ? '#dc2626'
    : row.subscriptionExpiresSoon
      ? '#d97706'
      : '#0f9d58';
  return (
    <div style={{ display:'grid', gap:6 }}>
      <div style={{ display:'grid', gap:4 }}>
        <span style={{ opacity:.7, fontSize:12 }}>{row.id}</span>
        <span style={{ fontSize:13, opacity:.85 }}>
          {row.initialName}
          {row.initialName !== row.name && (
            <span style={{ color:'#d97706' }}> (мерчант переименовал в «{row.name}»)</span>
          )}
        </span>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input value={name} onChange={e=>setName(e.target.value)} style={{ padding:6 }} />
        <input value={email} onChange={e=>setEmail(e.target.value)} style={{ padding:6 }} placeholder="логин (опц.)" type="text" autoComplete="username" />
        <input value={pwd} onChange={e=>setPwd(e.target.value)} type="password" placeholder="новый пароль (опц.)" style={{ padding:6 }} />
        <button onClick={save} disabled={saving} style={{ padding:'6px 10px' }}>{saving?'Сохранение…':'Сохранить'}</button>
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Учётные данные кассира</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={loadCashier} className="btn">Показать логин</button>
          <button onClick={()=>rotateLogin(true)} className="btn">Регенерировать логин</button>
          <input value={cashierInput} onChange={e=>setCashierInput(e.target.value)} placeholder="новый логин" style={{ padding:6 }} />
          <button onClick={saveCashierLogin} className="btn">Сохранить логин</button>
          {cashier && (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ opacity:.7 }}>Логин:</span>
              <code>{cashier.login || '—'}</code>
            </div>
          )}
        </div>
        {cashierMsg && <div style={{ color:'#0a0' }}>{cashierMsg}</div>}
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Подписка</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center' }}>
          <span>План: <b>{subscriptionPlan}</b></span>
          <span style={{ opacity:.7 }}>Статус: {subscriptionStatus}</span>
          <span style={{ opacity:.7 }}>Истекает: {expiresLabel}</span>
          <span style={{ color: subscriptionBadgeColor }}>
            {row.subscriptionExpired ? 'Подписка истекла' : `Осталось: ${daysLeftLabel}`}
          </span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}>
            Дней:
            <input
              type="number"
              min={1}
              value={subscriptionDays}
              onChange={(e)=>setSubscriptionDays(Number(e.target.value))}
              style={{ padding:6, width:100 }}
            />
          </label>
          <button onClick={grantSubscription} disabled={subscriptionBusy || !Number.isFinite(subscriptionDays) || subscriptionDays <= 0} className="btn btn-primary">
            {subscriptionBusy ? 'Сохранение…' : 'Выдать Full'}
          </button>
          <button onClick={resetSubscription} disabled={subscriptionBusy} className="btn">
            Сбросить подписку
          </button>
        </div>
        {subscriptionMsg && (
          <div style={{ color: subscriptionMsg.toLowerCase().includes('ошиб') ? '#f33' : '#0a0' }}>
            {subscriptionMsg}
          </div>
        )}
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Лимит торговых точек</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}>
            Макс.:
            <input
              type="number"
              min={1}
              value={maxOutletsInput}
              onChange={(e)=>setMaxOutletsInput(e.target.value)}
              placeholder="без лимита"
              style={{ padding:6, width:140 }}
            />
          </label>
          <button onClick={saveMaxOutlets} disabled={maxOutletsBusy || maxOutletsInvalid} className="btn btn-primary">
            {maxOutletsBusy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
        {maxOutletsInvalid && (
          <div style={{ color:'#f33', fontSize:12 }}>Укажите целое число ≥ 1 или оставьте пустым.</div>
        )}
        {maxOutletsMsg && (
          <div style={{ color: maxOutletsMsg.toLowerCase().includes('ошиб') ? '#f33' : '#0a0' }}>
            {maxOutletsMsg}
          </div>
        )}
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Настройки кассовых операций</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <a
            href={`/settings?merchantId=${encodeURIComponent(row.id)}`}
            className="btn"
            style={{ padding:'6px 10px' }}
          >
            Открыть настройки мерчанта
          </a>
        </div>
      </div>
    </div>
  );
}
