"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type CashierCreds = { login: string | null; password: string | null; hasPassword: boolean };
type CashierPin = {
  id: string;
  staffId: string;
  staffName?: string | null;
  outletId: string;
  outletName?: string | null;
  pinCode?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

export default function CashierPanelPage() {
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [creds, setCreds] = React.useState<CashierCreds|null>(null);
  const [rotBusy, setRotBusy] = React.useState(false);
  const [lastPassword, setLastPassword] = React.useState<string>('');
  const [pins, setPins] = React.useState<CashierPin[]>([]);

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
      setCreds({
        login: data?.login ?? null,
        password: data?.password ?? null,
        hasPassword: !!data?.hasPassword,
      });
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  }
  async function loadPins() {
    try {
      const r = await fetch('/api/portal/cashier/pins');
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (Array.isArray(data)) {
        setPins(
          data.map((item: any) => ({
            id: String(item?.id ?? ''),
            staffId: String(item?.staffId ?? ''),
            staffName: item?.staffName ?? null,
            outletId: String(item?.outletId ?? ''),
            outletName: item?.outletName ?? null,
            pinCode: item?.pinCode ?? null,
            status: item?.status ?? null,
            updatedAt: item?.updatedAt ?? null,
          })),
        );
      } else {
        setPins([]);
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  }
  React.useEffect(()=>{
    (async () => {
      setLoading(true);
      setMsg('');
      await Promise.all([loadCreds(), loadPins()]);
      setLoading(false);
    })();
  },[]);

  async function rotate() {
    setRotBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/portal/cashier/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateLogin: false }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const nextPassword = String(data?.password || '');
      setLastPassword(nextPassword);
      setCreds((prev) => ({
        login: data?.login ?? prev?.login ?? null,
        password: nextPassword || prev?.password || null,
        hasPassword: true,
      }));
      await loadCreds();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setRotBusy(false);
    }
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
              <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                <Button
                  variant="primary"
                  disabled={rotBusy}
                  onClick={rotate}
                >
                  {rotBusy ? 'Обновление…' : 'Сгенерировать пароль'}
                </Button>
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
        <CardHeader title="Пин‑коды сотрудников по точкам" />
        <CardBody>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
            У каждого вашего сотрудника есть личный PIN код, запрашиваемый доступа в панель кассира. Это нужно для безопасности и правильного ведения статистики. Вы можете управлять сотрудниками в разделе <span style={{ fontStyle: 'italic' }}>Настройка -&gt; Сотрудники</span> (<a href="/staff" style={{ color: 'var(--brand-primary)' }}>/staff</a>).
          </div>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(240px, 1fr) minmax(200px, 1fr) 120px',
                fontSize: 12,
                opacity: 0.75,
              }}>
                <div>Имя сотрудника</div>
                <div>Торговая точка</div>
                <div>Пин-код</div>
              </div>
              {pins
                .filter((row) => (row.status ?? '').toUpperCase() !== 'REVOKED')
                .map((row) => {
                  const rawStaff = (row.staffName || '').trim();
                  const rawOutlet = (row.outletName || '').trim();
                  const staffDisplay = rawStaff || '—';
                  const outletDisplay = rawOutlet || '—';
                  const pinDisplay = (row.pinCode || '').trim();
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(240px, 1fr) minmax(200px, 1fr) 120px',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,.06)',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{staffDisplay}</div>
                      <div>{outletDisplay}</div>
                      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {pinDisplay || '—'}
                      </div>
                    </div>
                  );
                })}
              {!pins.length && (
                <div style={{ opacity: 0.7, fontSize: 13 }}>У сотрудников нет выданных пин-кодов. Добавьте доступы в карточке сотрудника.</div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
