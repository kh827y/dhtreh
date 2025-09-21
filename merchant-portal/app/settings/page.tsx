"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Settings = {
  earnBps: number; redeemLimitBps: number; qrTtlSec: number;
  requireBridgeSig: boolean; requireStaffKey: boolean;
};

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [s, setS] = React.useState<Settings>({ earnBps: 500, redeemLimitBps: 5000, qrTtlSec: 120, requireBridgeSig: false, requireStaffKey: false });

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/settings');
      const data = await res.json();
      setS({
        earnBps: Number(data?.earnBps ?? 500),
        redeemLimitBps: Number(data?.redeemLimitBps ?? 5000),
        qrTtlSec: Number(data?.qrTtlSec ?? 120),
        requireBridgeSig: !!data?.requireBridgeSig,
        requireStaffKey: !!data?.requireStaffKey,
      });
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/portal/settings', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(s) });
      if (!res.ok) throw new Error(await res.text());
      setMsg('Сохранено');
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Настройки мерчанта</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Ставки, лимиты, TTL, задержки, вебхуки/Bridge</div>
        </div>
        <Button variant="primary" onClick={save} disabled={saving || loading}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
      </div>

      <Card>
        <CardHeader title="Основные параметры" subtitle="earnBps, redeemLimitBps, QR TTL" />
        <CardBody>
          {loading ? (
            <Skeleton height={120} />
          ) : (
            <div style={{ display:'grid', gap: 10, gridTemplateColumns:'1fr 1fr 1fr' }}>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Earn Bps</span>
                <input type="number" value={s.earnBps} onChange={e=>setS({ ...s, earnBps: Math.max(0, Math.min(10000, Number(e.target.value)||0)) })} style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
              </label>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Redeem Limit Bps</span>
                <input type="number" value={s.redeemLimitBps} onChange={e=>setS({ ...s, redeemLimitBps: Math.max(0, Math.min(10000, Number(e.target.value)||0)) })} style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
              </label>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>QR TTL (сек)</span>
                <input type="number" value={s.qrTtlSec} onChange={e=>setS({ ...s, qrTtlSec: Math.max(15, Math.min(600, Number(e.target.value)||0)) })} style={{ padding:10, borderRadius:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)' }} />
              </label>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Интеграции и доступ" subtitle="Bridge, Staff Key" />
        <CardBody>
          {loading ? (
            <Skeleton height={80} />
          ) : (
            <div style={{ display:'grid', gap: 12 }}>
              <label style={{ display:'flex', gap: 8, alignItems:'center' }}>
                <input type="checkbox" checked={s.requireBridgeSig} onChange={e=>setS({ ...s, requireBridgeSig: e.target.checked })} /> Требовать подпись Bridge
              </label>
              <label style={{ display:'flex', gap: 8, alignItems:'center' }}>
                <input type="checkbox" checked={s.requireStaffKey} onChange={e=>setS({ ...s, requireStaffKey: e.target.checked })} /> Требовать Staff‑ключ для операций
              </label>
              {msg && <div style={{ color: msg==='Сохранено' ? '#4ade80':'#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
