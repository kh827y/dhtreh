"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardBody, Skeleton, Button } from '@loyalty/ui';

type CampaignDetails = {
  id: string;
  merchantId: string;
  name: string;
  description?: string|null;
  type: string;
  status: 'DRAFT'|'ACTIVE'|'PAUSED'|'COMPLETED'|string;
  startDate?: string|null;
  endDate?: string|null;
  targetSegmentId?: string|null;
  reward?: { type?: string; value?: number; maxValue?: number; multiplier?: number; description?: string }|null;
  segment?: { id: string; name?: string|null; _count?: { customers?: number } }|null;
  stats?: { totalUsage: number; uniqueCustomers: number; totalReward: number; avgReward: number };
  usages?: Array<{ id: string; usedAt: string; customer?: { id: string; phone?: string|null; name?: string|null }|null; rewardType?: string|null; rewardValue?: number|null }>
};

export default function CampaignDetailsPage(){
  const params = useParams<{ campaignId: string }>();
  const campaignId = String(params?.campaignId || '');
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [c, setC] = React.useState<CampaignDetails|null>(null);

  async function load(){
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(campaignId)}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setC(data||null);
    } catch(e:any) { setMsg(String(e?.message||e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ if (campaignId) load(); }, [campaignId]);

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Акция</div>
          <div style={{ opacity:.8, fontSize:13 }}>Детали кампании и последние использования</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a className="btn" href="/loyalty/actions">Назад к списку</a>
        </div>
      </div>

      {loading ? (
        <Skeleton height={180} />
      ) : !c ? (
        <div style={{ color:'#f87171' }}>{msg || 'Кампания не найдена'}</div>
      ) : (
        <>
          <Card>
            <CardHeader title={c.name} subtitle={`${c.type} • ${c.status}`} />
            <CardBody>
              {!!c.description && <div style={{ opacity:.85, marginBottom:8 }}>{c.description}</div>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Период</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{c.startDate?new Date(c.startDate).toLocaleDateString():'—'} — {c.endDate?new Date(c.endDate).toLocaleDateString():'—'}</div>
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Награда</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{c.reward?.type || '—'} {typeof c.reward?.value==='number' ? `(${c.reward.value})`:''}{c.reward?.multiplier?` x${c.reward.multiplier}`:''}</div>
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Сегмент</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{c.segment?.name || c.targetSegmentId || '—'}</div>
                  {typeof c.segment?._count?.customers==='number' && <div style={{ opacity:.7, fontSize:12 }}>Клиентов: {c.segment._count.customers}</div>}
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Статус</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{c.status}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
            <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Использований</div><div style={{ fontSize:22, fontWeight:700 }}>{c.stats?.totalUsage ?? 0}</div></CardBody></Card>
            <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Уникальных клиентов</div><div style={{ fontSize:22, fontWeight:700 }}>{c.stats?.uniqueCustomers ?? 0}</div></CardBody></Card>
            <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Итого наград</div><div style={{ fontSize:22, fontWeight:700 }}>{c.stats?.totalReward ?? 0}</div></CardBody></Card>
            <Card><CardBody><div style={{ opacity:.7, fontSize:12 }}>Средняя награда</div><div style={{ fontSize:22, fontWeight:700 }}>{c.stats?.avgReward ?? 0}</div></CardBody></Card>
          </div>

          <Card>
            <CardHeader title="Последние использования" />
            <CardBody>
              <div style={{ display:'grid', gap:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 120px 120px', fontSize:12, opacity:.8 }}>
                  <div>Дата</div>
                  <div>Клиент</div>
                  <div>Тип награды</div>
                  <div>Значение</div>
                </div>
                {(c.usages||[]).map(u => (
                  <div key={u.id} style={{ display:'grid', gridTemplateColumns:'180px 1fr 120px 120px', gap:8, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                    <div>{u.usedAt ? new Date(u.usedAt).toLocaleString() : '—'}</div>
                    <div>{u.customer?.name || u.customer?.phone || u.customer?.id || '—'}</div>
                    <div>{u.rewardType || '—'}</div>
                    <div>{typeof u.rewardValue==='number' ? u.rewardValue : '—'}</div>
                  </div>
                ))}
                {!c.usages?.length && <div style={{ opacity:.7 }}>Нет использований</div>}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
