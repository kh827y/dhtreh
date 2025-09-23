"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Campaign = {
  id: string;
  name: string;
  description?: string|null;
  type: 'BONUS'|'DISCOUNT'|'CASHBACK'|'BIRTHDAY'|'REFERRAL'|'FIRST_PURCHASE'|string;
  status: 'DRAFT'|'ACTIVE'|'PAUSED'|'COMPLETED'|string;
  startDate?: string|null;
  endDate?: string|null;
  budget?: number|null;
  reward?: { type?: string; value?: number; maxValue?: number; multiplier?: number; description?: string }|null;
  _count?: { usages?: number };
};

const statusLabels: Record<string, string> = {
  ALL: 'Все', DRAFT:'Черновики', ACTIVE:'Активные', PAUSED:'Пауза', COMPLETED:'Завершённые'
};

export default function ActionsPage(){
  const [status, setStatus] = React.useState<'ALL'|'DRAFT'|'ACTIVE'|'PAUSED'|'COMPLETED'>('ACTIVE');
  const [items, setItems] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');

  async function load(){
    setLoading(true); setMsg('');
    try {
      const qs = status==='ALL' ? '' : `?status=${encodeURIComponent(status)}`;
      const r = await fetch(`/api/portal/campaigns${qs}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e:any) { setMsg(String(e?.message||e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[status]);

  return (
    <div style={{ display:'grid', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Акции</div>
          <div style={{ opacity:.8, fontSize:13 }}>Сегменты, периоды, награды и статистика использований</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {(['ALL','ACTIVE','DRAFT','PAUSED','COMPLETED'] as const).map(s=> (
            <Button key={s} size="sm" variant={status===s?'primary':'secondary'} onClick={()=>setStatus(s)}>{statusLabels[s]}</Button>
          ))}
          <a className="btn" href="/loyalty/actions/new">Создать акцию</a>
        </div>
      </div>

      {loading ? (
        <Skeleton height={180} />
      ) : (
        <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {items.map(c => (
            <Card key={c.id}>
              <CardHeader title={c.name} subtitle={`${c.type} • ${c.status}`} />
              <CardBody>
                {c.description && <div style={{ opacity:.85, marginBottom:8 }}>{c.description}</div>}
                <div style={{ display:'grid', gap:6, fontSize:13 }}>
                  <div><span style={{ opacity:.7 }}>Период:</span> <b>{c.startDate?new Date(c.startDate).toLocaleDateString():'—'} — {c.endDate?new Date(c.endDate).toLocaleDateString():'—'}</b></div>
                  <div><span style={{ opacity:.7 }}>Награда:</span> <b>{c.reward?.type||'—'}</b>{typeof c.reward?.value==='number' ? ` (${c.reward.value})` : ''}</div>
                  <div><span style={{ opacity:.7 }}>Использований:</span> <b>{c._count?.usages ?? 0}</b></div>
                </div>
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  <a className="btn" href={`/loyalty/actions/${encodeURIComponent(c.id)}`}>Открыть</a>
                  <a className="btn btn-ghost" href={`/loyalty/actions/${encodeURIComponent(c.id)}/edit`}>Редактировать</a>
                </div>
              </CardBody>
            </Card>
          ))}
          {!items.length && <div style={{ opacity:.7 }}>Нет акций для выбранного фильтра</div>}
          {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
