"use client";
import { useState } from 'react';
import { LevelBadge } from '../../components/LevelBadge';
import { EffectiveRatesPopover } from '../../components/EffectiveRatesPopover';
import { customerSearch, customerSummary, transactionsCsvUrl, receiptsCsvUrl, listTransactionsAdmin, listReceiptsAdmin, type CustomerSummary, getCustomerTimeline, getSettings, previewRules } from '../../lib/admin';

export default function CustomersPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [phone, setPhone] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [found, setFound] = useState<{ customerId: string; phone: string; balance: number } | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [txItems, setTxItems] = useState<any[]>([]);
  const [txNextBefore, setTxNextBefore] = useState<string | null>(null);
  const [rcItems, setRcItems] = useState<any[]>([]);
  const [rcBefore, setRcBefore] = useState<string | undefined>(undefined);
  const [txType, setTxType] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(20);
  const [timeline, setTimeline] = useState<Array<{ type: string; at: string; data: any }>>([]);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [level, setLevel] = useState<any | null>(null);
  const [loadingLevel, setLoadingLevel] = useState<boolean>(false);
  const [levelMsg, setLevelMsg] = useState<string>('');
  const API = (process as any)?.env?.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
  const [effectiveEarnBps, setEffectiveEarnBps] = useState<number | null>(null);
  const [effectiveRedeemBps, setEffectiveRedeemBps] = useState<number | null>(null);

  const doSearch = async () => {
    setBusy(true); setMsg(''); setSummary(null);
    try {
      const r = await customerSearch(merchantId, phone.trim());
      setFound(r);
      if (!r) setMsg('Клиент не найден');
      if (r) {
        const s = await customerSummary(merchantId, r.customerId);
        setSummary(s);
        // prime paged lists
        const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, customerId: r.customerId, type: txType || undefined });
        setTxItems(tx.items); setTxNextBefore(tx.nextBefore || null);
        const rc = await listReceiptsAdmin(merchantId, { limit: pageSize, customerId: r.customerId });
        setRcItems(rc); setRcBefore(undefined);
        // auto-load level mini card
        try {
          const resp = await fetch(`${API}/levels/${encodeURIComponent(merchantId)}/${encodeURIComponent(r.customerId)}`);
          const lvlData = resp.ok ? await resp.json() : null;
          if (lvlData) setLevel(lvlData); else setLevel(null);
          // compute effective bps using rules preview + level benefits
          try {
            const settings = await getSettings(merchantId);
            const rules = await previewRules(merchantId, { channel: 'VIRTUAL', weekday: new Date().getDay(), eligibleTotal: 1000 });
            const lb = (settings as any)?.rulesJson?.levelBenefits || {};
            const earnMap = lb.earnBpsBonusByLevel || {};
            const redeemMap = lb.redeemLimitBpsBonusByLevel || {};
            const lvlName = lvlData?.current?.name;
            const earnBonus = Number(earnMap?.[lvlName] || 0);
            const redeemBonus = Number(redeemMap?.[lvlName] || 0);
            setEffectiveEarnBps((rules.earnBps || 0) + earnBonus);
            setEffectiveRedeemBps((rules.redeemLimitBps || 0) + redeemBonus);
          } catch {}
        } catch {}
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
      setFound(null); setSummary(null); setTxItems([]); setRcItems([]);
    } finally { setBusy(false); }
  };

  const txCsv = found ? transactionsCsvUrl(merchantId, { customerId: found.customerId }) : '#';
  const rcCsv = found ? receiptsCsvUrl(merchantId, { customerId: found.customerId }) : '#';

  const loadMoreTx = async () => {
    if (!found) return;
    const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, before: txNextBefore || undefined, customerId: found.customerId, type: txType || undefined });
    setTxItems(prev=>[...prev, ...tx.items]); setTxNextBefore(tx.nextBefore || null);
  };
  const reloadTx = async () => {
    if (!found) return;
    const tx = await listTransactionsAdmin(merchantId, { limit: pageSize, customerId: found.customerId, type: txType || undefined });
    setTxItems(tx.items); setTxNextBefore(tx.nextBefore || null);
  };
  const loadMoreRc = async () => {
    if (!found) return;
    const rc = await listReceiptsAdmin(merchantId, { limit: pageSize, before: rcBefore, customerId: found.customerId });
    setRcItems(prev=>[...prev, ...rc]);
    if (rc.length > 0) setRcBefore(rc[rc.length-1].createdAt);
  };

  const loadTimeline = async () => {
    if (!found) return;
    setLoadingTimeline(true);
    try {
      const res = await getCustomerTimeline(merchantId, found.customerId, 50);
      setTimeline(res.items);
    } catch (e) {
      // noop
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadLevel = async () => {
    if (!found) return;
    setLoadingLevel(true); setLevelMsg(''); setLevel(null);
    try {
      const r = await fetch(`${API}/levels/${encodeURIComponent(merchantId)}/${encodeURIComponent(found.customerId)}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setLevel(data);
    } catch (e: unknown) {
      setLevelMsg(e instanceof Error ? e.message : String(e));
    } finally { setLoadingLevel(false); }
  };

  return (
    <div>
      <h2>Клиенты</h2>
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
        <label>Телефон клиента: <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+7..." /></label>
        <button onClick={doSearch} disabled={busy} style={{ padding:'6px 10px' }}>Искать</button>
      </div>
      {msg && <div style={{ color:'#f38ba8', marginBottom:8 }}>{msg}</div>}

      {found && (
        <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
          <div style={{ marginBottom:6 }}>
            Найден клиент: <b>{found.customerId}</b>
            {level?.current?.name && (
              <>
                <LevelBadge levelName={level.current.name} earnBps={effectiveEarnBps ?? undefined} redeemBps={effectiveRedeemBps ?? undefined} />
                <EffectiveRatesPopover merchantId={merchantId} levelName={level.current.name} />
              </>
            )}
            {' '}(тел: {found.phone})
          </div>
          <div style={{ marginBottom:6 }}>Баланс: <b>{found.balance}</b></div>
          <div style={{ display:'grid', gap:6, marginBottom:8 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={loadLevel} disabled={loadingLevel} style={{ padding:'6px 10px' }}>{loadingLevel ? 'Загрузка уровня...' : 'Показать уровень'}</button>
              {levelMsg && <span style={{ color:'#f38ba8' }}>{levelMsg}</span>}
            </div>
            {level && (
              <div style={{ background:'#0b1221', padding:10, borderRadius:8 }}>
                <div>Уровень: <b>{level.current?.name || '—'}</b> (метрика: {level.metric}, период: {level.periodDays} дн.)</div>
                <div>Прогресс до следующего: {Math.round((level.progressToNext || 0)*100)}%</div>
                {level.next && <div>Следующий: {level.next.name} @ {level.next.threshold}</div>}
                {(effectiveEarnBps != null || effectiveRedeemBps != null) && (
                  <div style={{ marginTop:6, opacity:0.9 }}>
                    <div>Эффективные ставки (пример, базовые правила + бонус уровня):</div>
                    {effectiveEarnBps != null && <div>· Начисление: {(effectiveEarnBps/100).toFixed(2)}%</div>}
                    {effectiveRedeemBps != null && <div>· Лимит списания: {(effectiveRedeemBps/100).toFixed(2)}%</div>}
                  </div>
                )}
                <div style={{ marginTop:6 }}>
                  <a href={`/levels?merchantId=${encodeURIComponent(merchantId)}&customerId=${encodeURIComponent(found.customerId)}`} style={{ color:'#89b4fa' }}>Подробнее →</a>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <a href={txCsv} download style={{ color:'#89b4fa' }}>Скачать transactions.csv</a>
            <a href={rcCsv} download style={{ color:'#89b4fa' }}>Скачать receipts.csv</a>
          </div>
          <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <h3 style={{ marginTop:0 }}>Таймлайн клиента</h3>
            <div style={{ marginBottom:8 }}>
              <button onClick={loadTimeline} disabled={loadingTimeline} style={{ padding:'6px 10px' }}>{loadingTimeline ? 'Загрузка...' : 'Показать таймлайн'}</button>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              {timeline.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
              {timeline.map((ev, idx) => (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'220px 120px 1fr', gap:8 }}>
                  <div style={{ opacity:0.8 }}>{new Date(ev.at).toLocaleString()}</div>
                  <div><b>{ev.type}</b></div>
                  <div style={{ opacity:0.9, whiteSpace:'pre-wrap' }}>
                    {ev.type === 'transaction' && `txn ${ev.data.txnType} amount=${ev.data.amount} order=${ev.data.orderId || '—'}`}
                    {ev.type === 'receipt' && `receipt order=${ev.data.orderId} total=${ev.data.total} earn=${ev.data.earnApplied} redeem=${ev.data.redeemApplied}`}
                    {ev.type === 'campaign' && `campaign ${ev.data.campaignName || ev.data.campaignId} reward=${ev.data.rewardType}:${ev.data.rewardValue}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <h3 style={{ marginTop:0 }}>Последние операции</h3>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
              <label>Тип:
                <select value={txType} onChange={e=>setTxType(e.target.value)} style={{ marginLeft:8 }}>
                  <option value="">— любой —</option>
                  <option value="EARN">EARN</option>
                  <option value="REDEEM">REDEEM</option>
                  <option value="REFUND">REFUND</option>
                </select>
              </label>
              <label>Page size: <input type="number" value={pageSize} onChange={e=>setPageSize(parseInt(e.target.value||'20',10))} style={{ marginLeft:8, width:80 }} /></label>
              <button onClick={reloadTx} style={{ padding:'6px 10px' }}>Обновить</button>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              {txItems.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
              {txItems.map(tx => (
                <div key={tx.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
                  <div>{new Date(tx.createdAt).toLocaleString()}</div>
                  <div>
                    {tx.type}
                    {level?.current?.name && (
                      <>
                        <LevelBadge levelName={level.current.name} earnBps={effectiveEarnBps ?? undefined} redeemBps={effectiveRedeemBps ?? undefined} />
                        <EffectiveRatesPopover merchantId={merchantId} levelName={level.current.name} />
                      </>
                    )}
                  </div>
                  <div>{tx.amount}</div>
                  <div style={{ opacity:0.8 }}>order: {tx.orderId || '—'}</div>
                </div>
              ))}
              {txNextBefore && <button onClick={loadMoreTx} style={{ padding:'6px 10px' }}>Загрузить ещё</button>}
            </div>
          </div>
          <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
            <h3 style={{ marginTop:0 }}>Последние чеки</h3>
            <div style={{ display:'grid', gap:6 }}>
              {rcItems.length === 0 && <div style={{ opacity:0.8 }}>—</div>}
              {rcItems.map(r => (
                <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:6 }}>
                  <div>{new Date(r.createdAt).toLocaleString()}</div>
                  <div>
                    order: {r.orderId}
                    {level?.current?.name && (
                      <>
                        <LevelBadge levelName={level.current.name} earnBps={effectiveEarnBps ?? undefined} redeemBps={effectiveRedeemBps ?? undefined} />
                        <EffectiveRatesPopover merchantId={merchantId} levelName={level.current.name} />
                      </>
                    )}
                  </div>
                  <div>total: {r.total}</div>
                  <div>redeem: {r.redeemApplied}</div>
                  <div>earn: {r.earnApplied}</div>
                </div>
              ))}
              <button onClick={loadMoreRc} style={{ padding:'6px 10px' }}>Загрузить ещё</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
