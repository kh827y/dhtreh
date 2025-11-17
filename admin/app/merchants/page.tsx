"use client";
import React from 'react';
import { listMerchants, createMerchant, updateMerchant as apiUpdateMerchant, deleteMerchant as apiDeleteMerchant, setPortalLoginEnabled, initTotp, verifyTotp, disableTotp, impersonatePortal, getCashier, rotateCashier, updateMerchantSettings, type MerchantRow } from "../../lib/merchants";

const PORTAL_BASE = process.env.NEXT_PUBLIC_PORTAL_BASE || 'http://localhost:3004';

export default function AdminMerchantsPage() {
  const [items, setItems] = React.useState<MerchantRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [ownerName, setOwnerName] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [totp, setTotp] = React.useState<{ secret: string; otpauth: string }|null>(null);
  const [code, setCode] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try { setItems(await listMerchants()); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  async function create() {
    setMsg('');
    try {
      await createMerchant(name.trim(), email.trim().toLowerCase(), password, ownerName.trim() || undefined);
      setName(''); setEmail(''); setPassword(''); setOwnerName('');
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function saveRow(id: string, fields: { name?: string; email?: string; password?: string }) {
    setMsg('');
    try { await apiUpdateMerchant(id, fields); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function removeRow(id: string) {
    setMsg('');
    try { await apiDeleteMerchant(id); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function updateSettingsRow(id: string, fields: { qrTtlSec?: number; requireBridgeSig?: boolean; requireStaffKey?: boolean; earnBps: number; redeemLimitBps: number }) {
    setMsg('');
    try {
      await updateMerchantSettings(id, fields);
      await load();
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      setMsg('Ошибка сохранения настроек: ' + err);
      throw e;
    }
  }
  async function toggleLogin(id: string, enabled: boolean) {
    setMsg(''); try { await setPortalLoginEnabled(id, enabled); await load(); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  async function doInitTotp(id: string) {
    setMsg(''); setTotp(null);
    try { const r = await initTotp(id); setTotp(r); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); }
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
      <h1 style={{ marginBottom: 12 }}>Мерчанты</h1>
      <div style={{ display:'grid', gap: 8, alignItems:'center', marginBottom: 16, gridTemplateColumns:'1fr 1fr 1fr 1fr auto' }}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Название мерчанта" style={{ padding: 8 }} />
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ padding: 8 }} />
        <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль (мин. 6)" type="password" style={{ padding: 8 }} />
        <input value={ownerName} onChange={e=>setOwnerName(e.target.value)} placeholder="Имя владельца (обяз.)" style={{ padding: 8 }} />
        <button onClick={create} disabled={!name.trim() || !email.trim() || password.length < 6 || !ownerName.trim()} style={{ padding: '8px 12px' }}>Создать</button>
      </div>
      {msg && <div style={{ marginBottom: 12, color: '#f44' }}>{msg}</div>}
      <div style={{ display:'grid', gap: 12 }}>
        {items.map(m => (
          <div key={m.id} style={{ border:'1px solid #ddd', borderRadius: 10, padding: 12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, flexWrap:'wrap' }}>
              <RowEditor row={m} onSave={saveRow} onDelete={removeRow} onUpdateSettings={updateSettingsRow} />
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
            {totp && (
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
        {(!items.length && !loading) && <div style={{ opacity:.7 }}>Пока нет мерчантов</div>}
      </div>
    </main>
  );
}

function RowEditor({ row, onSave, onDelete, onUpdateSettings }: {
  row: MerchantRow;
  onSave: (id: string, patch: { name?: string; email?: string; password?: string }) => void;
  onDelete: (id: string) => void;
  onUpdateSettings: (id: string, patch: { qrTtlSec?: number; requireBridgeSig?: boolean; requireStaffKey?: boolean; earnBps: number; redeemLimitBps: number }) => Promise<void>;
}) {
  const [name, setName] = React.useState(row.name);
  const [email, setEmail] = React.useState(row.portalEmail || '');
  const [pwd, setPwd] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [cashier, setCashier] = React.useState<{ login: string|null; hasPassword: boolean }|null>(null);
  const [cashierMsg, setCashierMsg] = React.useState('');
  const [qrTtl, setQrTtl] = React.useState<number>(row.qrTtlSec ?? 120);
  const [requireBridgeSig, setRequireBridgeSig] = React.useState<boolean>(!!row.requireBridgeSig);
  const [requireStaffKey, setRequireStaffKey] = React.useState<boolean>(!!row.requireStaffKey);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsMsg, setSettingsMsg] = React.useState('');
  async function save() { setSaving(true); try { await onSave(row.id, { name, email, password: pwd || undefined }); setPwd(''); } finally { setSaving(false); } }
  async function del() { if (!confirm('Удалить мерчанта?')) return; setDeleting(true); try { await onDelete(row.id); } finally { setDeleting(false); } }
  async function loadCashier() {
    setCashierMsg('');
    try { setCashier(await getCashier(row.id)); } catch (e: any) { setCashierMsg(String(e?.message || e)); }
  }
  async function genPassword(regenLogin?: boolean) {
    setCashierMsg('');
    try {
      const r = await rotateCashier(row.id, !!regenLogin);
      setCashier({ login: r.login, hasPassword: true });
      // Показать пароль один раз (в уведомлении)
      setCashierMsg(`Пароль кассира: ${r.password}`);
    } catch (e: any) { setCashierMsg(String(e?.message || e)); }
  }
  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const earn = row.earnBps ?? 500;
      const redeem = row.redeemLimitBps ?? 5000;
      await onUpdateSettings(row.id, {
        qrTtlSec: Math.max(15, Math.min(600, qrTtl || 0)),
        requireBridgeSig,
        requireStaffKey,
        earnBps: earn,
        redeemLimitBps: redeem,
      });
      setSettingsMsg('Сохранено');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSettingsMsg('Ошибка: ' + msg);
    } finally {
      setSettingsSaving(false);
    }
  }
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
        <input value={email} onChange={e=>setEmail(e.target.value)} style={{ padding:6 }} placeholder="email (опц.)" />
        <input value={pwd} onChange={e=>setPwd(e.target.value)} type="password" placeholder="новый пароль (опц.)" style={{ padding:6 }} />
        <button onClick={save} disabled={saving} style={{ padding:'6px 10px' }}>{saving?'Сохранение…':'Сохранить'}</button>
        <button onClick={del} disabled={deleting} style={{ padding:'6px 10px', color:'#f33' }}>{deleting?'Удаление…':'Удалить'}</button>
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Учётные данные кассира</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={loadCashier} className="btn">Показать логин</button>
          <button onClick={()=>genPassword(false)} className="btn btn-primary">Сгенерировать пароль</button>
          <button onClick={()=>genPassword(true)} className="btn">Регенерировать логин+пароль</button>
          {cashier && (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ opacity:.7 }}>Логин:</span>
              <code>{cashier.login || '—'}</code>
              <span style={{ opacity:.7 }}>Пароль:</span>
              <code>{cashier.hasPassword ? 'установлен' : '—'}</code>
            </div>
          )}
        </div>
        {cashierMsg && <div style={{ color:'#0a0' }}>{cashierMsg}</div>}
      </div>
      <div style={{ marginTop:6, paddingTop:6, borderTop:'1px dashed #ddd', display:'grid', gap:8 }}>
        <div style={{ fontSize:13, opacity:.8 }}>Настройки кассовых операций</div>
        <label style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          QR TTL (сек):
          <input
            type="number"
            min={15}
            max={600}
            value={qrTtl}
            onChange={e=>setQrTtl(Math.max(0, parseInt(e.target.value || '0', 10)))}
            style={{ padding:6, width:100 }}
          />
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="checkbox" checked={requireBridgeSig} onChange={e=>setRequireBridgeSig(e.target.checked)} /> Требовать подпись Bridge
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="checkbox" checked={requireStaffKey} onChange={e=>setRequireStaffKey(e.target.checked)} /> Требовать Staff‑ключ для операций
        </label>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={saveSettings} disabled={settingsSaving} style={{ padding:'6px 10px' }}>
            {settingsSaving ? 'Сохранение…' : 'Сохранить настройки'}
          </button>
          {settingsMsg && (
            <span style={{ color: settingsMsg.startsWith('Ошибка') ? '#f33' : '#0a0' }}>{settingsMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
