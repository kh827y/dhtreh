"use client";
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

const TYPES = ['BONUS','DISCOUNT','CASHBACK','BIRTHDAY','REFERRAL','FIRST_PURCHASE'] as const;
const STATUSES = ['DRAFT','ACTIVE','PAUSED','COMPLETED'] as const;
const REWARD_TYPES = ['POINTS','PERCENT','FIXED','PRODUCT'] as const;
const CHANNELS = ['TELEGRAM','PUSH'] as const;

export default function CampaignEditPage(){
  const { campaignId } = useParams<{ campaignId: string }>();
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<typeof TYPES[number]>('BONUS');
  const [status, setStatus] = React.useState<typeof STATUSES[number]>('DRAFT');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [targetSegmentId, setTargetSegmentId] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [maxUsagePerCustomer, setMaxUsagePerCustomer] = React.useState('');
  const [maxUsageTotal, setMaxUsageTotal] = React.useState('');
  const [notificationChannels, setNotificationChannels] = React.useState<Record<string, boolean>>({});

  // reward
  const [rewardType, setRewardType] = React.useState<typeof REWARD_TYPES[number]>('POINTS');
  const [rewardValue, setRewardValue] = React.useState('');
  const [rewardMaxValue, setRewardMaxValue] = React.useState('');
  const [rewardMultiplier, setRewardMultiplier] = React.useState('');
  const [rewardDesc, setRewardDesc] = React.useState('');

  // rules (минимальный набор)
  const [minPurchaseAmount, setMinPurchaseAmount] = React.useState('');
  const [productCategoriesCsv, setProductCategoriesCsv] = React.useState('');
  const [outletsCsv, setOutletsCsv] = React.useState('');

  function numOrUndef(v: string){ const n = Number(v); return isFinite(n) && v!=='' ? n : undefined; }

  React.useEffect(()=>{
    (async()=>{
      setLoading(true); setMsg('');
      try {
        const r = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(String(campaignId||''))}`);
        if (!r.ok) throw new Error(await r.text());
        const c = await r.json();
        setName(c.name||'');
        setDescription(c.description||'');
        setType(c.type||'BONUS');
        setStatus(c.status||'DRAFT');
        setStartDate(c.startDate ? String(c.startDate).slice(0,10) : '');
        setEndDate(c.endDate ? String(c.endDate).slice(0,10) : '');
        setTargetSegmentId(c.targetSegmentId||'');
        setBudget(typeof c.budget==='number'? String(c.budget):'');
        setMaxUsagePerCustomer(typeof c.maxUsagePerCustomer==='number'? String(c.maxUsagePerCustomer):'');
        setMaxUsageTotal(typeof c.maxUsageTotal==='number'? String(c.maxUsageTotal):'');
        const ch: Record<string, boolean> = {};
        for (const x of (c.notificationChannels||[])) ch[x] = true;
        setNotificationChannels(ch);
        const reward = c.reward||{};
        setRewardType(reward.type||'POINTS');
        setRewardValue(typeof reward.value==='number'? String(reward.value):'');
        setRewardMaxValue(typeof reward.maxValue==='number'? String(reward.maxValue):'');
        setRewardMultiplier(typeof reward.multiplier==='number'? String(reward.multiplier):'');
        setRewardDesc(reward.description||'');
        const rules = c.content || c.rules || {};
        setMinPurchaseAmount(typeof rules.minPurchaseAmount==='number'? String(rules.minPurchaseAmount):'');
        setProductCategoriesCsv((rules.productCategories||[]).join(','));
        setOutletsCsv((rules.outlets||[]).join(','));
      } catch(e:any) { setMsg(String(e?.message||e)); }
      finally { setLoading(false); }
    })();
  },[campaignId]);

  async function submit(){
    if (!name.trim()) { setMsg('Укажите название акции'); return; }
    setBusy(true); setMsg('');
    try {
      const dto: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        targetSegmentId: targetSegmentId || undefined,
        budget: numOrUndef(budget),
        maxUsagePerCustomer: numOrUndef(maxUsagePerCustomer),
        maxUsageTotal: numOrUndef(maxUsageTotal),
        notificationChannels: CHANNELS.filter(c=>notificationChannels[c]),
        reward: {
          type: rewardType,
          value: numOrUndef(rewardValue) ?? 0,
          maxValue: numOrUndef(rewardMaxValue),
          multiplier: numOrUndef(rewardMultiplier),
          description: rewardDesc || undefined,
        },
        rules: {
          minPurchaseAmount: numOrUndef(minPurchaseAmount),
          productCategories: productCategoriesCsv ? productCategoriesCsv.split(',').map(s=>s.trim()).filter(Boolean) : undefined,
          outlets: outletsCsv ? outletsCsv.split(',').map(s=>s.trim()).filter(Boolean) : undefined,
        },
      };
      const r = await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(String(campaignId||''))}`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(dto) });
      if (!r.ok) throw new Error(await r.text());
      router.push(`/loyalty/actions/${encodeURIComponent(String(campaignId||''))}`);
    } catch(e:any) { setMsg(String(e?.message||e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Редактирование акции</div>
          <div style={{ opacity:.8, fontSize:13 }}>Измените поля и сохраните</div>
        </div>
        <div><a className="btn" href={`/loyalty/actions/${encodeURIComponent(String(campaignId||''))}`}>Назад</a></div>
      </div>

      {loading ? <Skeleton height={260} /> : (
        <>
          <Card>
            <CardHeader title="Основные" />
            <CardBody>
              <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr 1fr' }}>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Название</div>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="Название" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Тип</div>
                  <select value={type} onChange={e=>setType(e.target.value as any)} style={{ padding:8, width:'100%' }}>
                    {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Статус</div>
                  <select value={status} onChange={e=>setStatus(e.target.value as any)} style={{ padding:8, width:'100%' }}>
                    {STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div />
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Дата начала</div>
                  <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Дата окончания</div>
                  <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Сегмент (ID)</div>
                  <input value={targetSegmentId} onChange={e=>setTargetSegmentId(e.target.value)} placeholder="segmentId" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Описание</div>
                  <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Описание" style={{ padding:8, width:'100%' }} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Награда" />
            <CardBody>
              <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr 1fr 1fr 1fr' }}>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Тип награды</div>
                  <select value={rewardType} onChange={e=>setRewardType(e.target.value as any)} style={{ padding:8, width:'100%' }}>
                    {REWARD_TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Значение</div>
                  <input value={rewardValue} onChange={e=>setRewardValue(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Макс. значение</div>
                  <input value={rewardMaxValue} onChange={e=>setRewardMaxValue(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Множитель (x%)</div>
                  <input value={rewardMultiplier} onChange={e=>setRewardMultiplier(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ opacity:.7, fontSize:12 }}>Текст награды</div>
                  <input value={rewardDesc} onChange={e=>setRewardDesc(e.target.value)} placeholder="Описание" style={{ padding:8, width:'100%' }} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Правила и ограничения" />
            <CardBody>
              <div style={{ display:'grid', gap:10, gridTemplateColumns:'1fr 1fr 1fr' }}>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Мин. сумма покупки</div>
                  <input value={minPurchaseAmount} onChange={e=>setMinPurchaseAmount(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Категории товаров (CSV)</div>
                  <input value={productCategoriesCsv} onChange={e=>setProductCategoriesCsv(e.target.value)} placeholder="cat1,cat2" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Точки (CSV)</div>
                  <input value={outletsCsv} onChange={e=>setOutletsCsv(e.target.value)} placeholder="outlet1,outlet2" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Бюджет</div>
                  <input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Лимит на клиента</div>
                  <input value={maxUsagePerCustomer} onChange={e=>setMaxUsagePerCustomer(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
                <div>
                  <div style={{ opacity:.7, fontSize:12 }}>Лимит общий</div>
                  <input value={maxUsageTotal} onChange={e=>setMaxUsageTotal(e.target.value)} placeholder="число" style={{ padding:8, width:'100%' }} />
                </div>
              </div>
            </CardBody>
          </Card>

          {msg && <div style={{ color:'#f87171' }}>{msg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" onClick={()=>router.push(`/loyalty/actions/${encodeURIComponent(String(campaignId||''))}`)}>Отмена</Button>
            <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
