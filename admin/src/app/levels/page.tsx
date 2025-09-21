'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LevelBadge } from '../../../components/LevelBadge';
import { EffectiveRatesPopover } from '../../../components/EffectiveRatesPopover';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const DEFAULT_MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

export default function LevelsPreviewPage() {
  const params = useSearchParams();
  const [merchantId, setMerchantId] = useState<string>(DEFAULT_MERCHANT);
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [data, setData] = useState<any>(null);
  const [effEarnPct, setEffEarnPct] = useState<string>('');
  const [effRedeemPct, setEffRedeemPct] = useState<string>('');

  useEffect(() => {
    const m = params.get('merchantId');
    const c = params.get('customerId');
    if (m) setMerchantId(m);
    if (c) setCustomerId(c);
    if (m && c) {
      // автозагрузка
      load(m, c).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(mId?: string, cId?: string) {
    const mid = (mId || merchantId).trim();
    const cid = (cId || customerId).trim();
    setLoading(true); setMsg(''); setData(null);
    try {
      if (!cid) throw new Error('Введите customerId');
      const r = await fetch(`${API}/levels/${encodeURIComponent(mid)}/${encodeURIComponent(cid)}`);
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  const progress = useMemo(() => {
    if (!data?.current) return { pct: 0, text: '—' };
    const value = Number(data.value || 0);
    const cur = data.current;
    const next = data.next;
    if (!next) return { pct: 100, text: 'Максимальный уровень' };
    const range = Math.max(1, Number(next.threshold || 0) - Number(cur.threshold || 0));
    const pos = Math.max(0, Math.min(range, value - Number(cur.threshold || 0)));
    const pct = Math.round((pos / range) * 100);
    const remain = Math.max(0, Number(next.threshold || 0) - value);
    return { pct, text: `до ${next.name}: осталось ${remain}` };
  }, [data]);

  return (
    <main style={{ maxWidth: 820, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Уровни клиента</h1>
      <div style={{ display:'flex', gap: 12, margin: '8px 0' }}>
        <Link href="/">← Настройки</Link>
      </div>
      <div style={{ display:'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <label>MerchantId: <input value={merchantId} onChange={(e)=>setMerchantId(e.target.value)} /></label>
        <label>CustomerId: <input value={customerId} onChange={(e)=>setCustomerId(e.target.value)} /></label>
        <button onClick={()=>load()} disabled={loading} style={{ padding: '6px 10px' }}>Показать</button>
      </div>
      {msg && <div style={{ color:'#f38ba8', marginTop: 4 }}>{msg}</div>}
      {data && (
        <div style={{ display:'grid', gap: 10, background:'#0e1629', padding: 12, borderRadius: 8, marginTop: 12 }}>
          <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
            <div>Клиент: <b>{data.customerId}</b></div>
            <div>Метрика: <b>{data.metric}</b> за <b>{data.periodDays}</b> дней</div>
            <div>Текущее значение: <b>{data.value}</b></div>
          </div>
          <div>
            Уровень: <b>{data.current?.name || '—'}</b>
            {data?.current?.name && (
              <>
                <LevelBadge levelName={data.current.name} />
                <EffectiveRatesPopover merchantId={merchantId} levelName={data.current.name} />
              </>
            )}
            {data.next && <> → след.: <b>{data.next?.name}</b> @ {data.next?.threshold}</>}
          </div>
          <div style={{ display:'grid', gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{progress.text}</div>
            <div style={{ background:'#111827', border:'1px solid #1f2937', height: 12, borderRadius: 999, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, width: `${progress.pct}%`, background:'linear-gradient(90deg,#60a5fa,#34d399)', transition:'width .3s ease' }} />
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{progress.pct}%</div>
          </div>
          <div style={{ display:'flex', gap: 12, alignItems:'center', flexWrap:'wrap' }}>
            <button
              onClick={async ()=>{
                try {
                  setEffEarnPct(''); setEffRedeemPct('');
                  const wd = new Date().getDay();
                  const p = new URLSearchParams({ channel: 'VIRTUAL', weekday: String(wd), eligibleTotal: '1000' }).toString();
                  const r = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/rules/preview?` + p);
                  if (!r.ok) throw new Error(await r.text());
                  const rules = await r.json();
                  let earnBps = rules.earnBps || 500;
                  let redeemBps = rules.redeemLimitBps || 5000;
                  // Получим бонус уровня из настроек
                  try {
                    const s = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/settings`);
                    if (s.ok) {
                      const st = await s.json();
                      const lb = st?.rulesJson?.levelBenefits || {};
                      const earnMap = lb.earnBpsBonusByLevel || {};
                      const redeemMap = lb.redeemLimitBpsBonusByLevel || {};
                      const lvlName = data?.current?.name;
                      earnBps += Number(earnMap?.[lvlName] || 0);
                      redeemBps += Number(redeemMap?.[lvlName] || 0);
                    }
                  } catch {}
                  setEffEarnPct((earnBps/100).toFixed(2));
                  setEffRedeemPct((redeemBps/100).toFixed(2));
                } catch (e) {
                  setMsg(String((e as any)?.message || e));
                }
              }}
              disabled={loading}
              style={{ padding:'6px 10px' }}
            >Посчитать эффективные ставки</button>
            {(effEarnPct || effRedeemPct) && (
              <div style={{ opacity: 0.9 }}>
                {effEarnPct && <div>Начисление (пример): <b>{effEarnPct}%</b></div>}
                {effRedeemPct && <div>Лимит списания (пример): <b>{effRedeemPct}%</b></div>}
              </div>
            )}
          </div>
          <details>
            <summary style={{ cursor:'pointer' }}>Показать JSON</summary>
            <pre style={{ background:'#0b1221', padding: 10, overflow:'auto' }}>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>
      )}
    </main>
  );
}
