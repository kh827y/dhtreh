"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type VoucherRow = {
  id: string; merchantId: string; name: string; valueType: string; value: number; status: string; isActive: boolean;
  validFrom?: string|null; validUntil?: string|null; totalUsed?: number; maxTotalUses?: number|null;
  codes?: number; activeCodes?: number; usedCodes?: number; codeSamples?: string[];
};

export default function VouchersPage() {
  React.useEffect(() => { try { window.location.replace('/promocodes'); } catch {} }, []);
  const [items, setItems] = React.useState<VoucherRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [issuing, setIssuing] = React.useState(false);
  const [name, setName] = React.useState('');
  const [valueType, setValueType] = React.useState<'PERCENTAGE'|'FIXED_AMOUNT'>('PERCENTAGE');
  const [value, setValue] = React.useState(10);
  const [code, setCode] = React.useState('');
  const [minPurchaseAmount, setMinPurchaseAmount] = React.useState<number|''>('');
  const [msg, setMsg] = React.useState('');

  async function load() {
    setLoading(true); setMsg('');
    try {
      const res = await fetch('/api/portal/vouchers');
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[]);

  async function issue() {
    setIssuing(true); setMsg('');
    try {
      const body = {
        name: name || undefined,
        valueType,
        value: Number(value||0),
        code: code || '',
        minPurchaseAmount: minPurchaseAmount === '' ? undefined : Number(minPurchaseAmount),
      };
      const res = await fetch('/api/portal/vouchers/issue', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      setName(''); setValueType('PERCENTAGE'); setValue(10); setCode(''); setMinPurchaseAmount('');
      await load();
      setMsg('Ваучер выпущен');
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setIssuing(false); }
  }

  async function deactivate(voucherId?: string, code?: string) {
    setMsg('');
    try {
      const res = await fetch('/api/portal/vouchers/deactivate', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ voucherId, code }) });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ваучеры (устарело)</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Раздел перемещён в «Промокоды». Вы будете перенаправлены автоматически.</div>
        </div>
      </div>

      <Card>
        <CardHeader title="Выпустить ваучер" />
        <CardBody>
          <div style={{ display:'grid', gap: 8, gridTemplateColumns:'1fr 160px 160px 1fr auto' }}>
            <input placeholder="Название (опц.)" value={name} onChange={e=>setName(e.target.value)} style={{ padding:8 }} />
            <select value={valueType} onChange={e=>setValueType(e.target.value as any)} style={{ padding:8 }}>
              <option value="PERCENTAGE">PERCENTAGE</option>
              <option value="FIXED_AMOUNT">FIXED_AMOUNT</option>
            </select>
            <input placeholder={valueType==='PERCENTAGE'?'%':'Сумма'} type="number" value={value} onChange={e=>setValue(Math.max(0, Number(e.target.value)||0))} style={{ padding:8 }} />
            <input placeholder="Код" value={code} onChange={e=>setCode(e.target.value)} style={{ padding:8 }} />
            <Button variant="primary" onClick={issue} disabled={issuing || !code.trim() || value<=0}>{issuing ? 'Выпуск...' : 'Выпустить'}</Button>
          </div>
          <div style={{ display:'grid', gap: 8, gridTemplateColumns:'1fr 1fr' , marginTop: 8 }}>
            <label style={{ display:'grid', gap:4 }}>
              <span style={{ opacity:.8, fontSize:12 }}>Мин. сумма покупки (опц.)</span>
              <input type="number" value={minPurchaseAmount} onChange={e=>setMinPurchaseAmount(e.target.value===''? '': Number(e.target.value))} style={{ padding:8 }} />
            </label>
          </div>
          {msg && <div style={{ marginTop: 8, color: msg==='Ваучер выпущен' ? '#4ade80' : '#f87171' }}>{msg}</div>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Список ваучеров" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display:'grid', gap: 8 }}>
              {items.map(v => (
                <div key={v.id} style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 120px 1fr auto', gap: 8, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{v.name || v.codeSamples?.[0] || v.id}</div>
                    <div style={{ opacity:.8, fontSize:12 }}>{v.id}</div>
                  </div>
                  <div><span style={{ padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,.06)' }}>{v.valueType}</span></div>
                  <div>{v.value}</div>
                  <div style={{ opacity:.9 }}>{v.status}</div>
                  <div style={{ opacity:.8 }}>{v.validUntil ? ('до ' + new Date(v.validUntil).toLocaleDateString()) : 'без срока'}</div>
                  <div style={{ display:'flex', gap: 8, justifyContent:'flex-end' }}>
                    {v.isActive ? (
                      <Button size="sm" onClick={()=>deactivate(v.id)}>
                        Деактивировать
                      </Button>
                    ) : (
                      <span style={{ opacity:.7 }}>Отключен</span>
                    )}
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ opacity:.7 }}>Нет ваучеров</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
