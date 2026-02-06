"use client";
import { useCallback, useEffect, useState } from 'react';
import { deleteOutbox, listOutbox, retryAll, retryOutbox, pauseOutbox, resumeOutbox, outboxStats, retrySince, outboxCsvUrl, listOutboxByOrder, type OutboxEvent } from '../../lib/outbox';
import { getSettings } from '../../lib/admin';
import { usePreferredMerchantId } from '../../lib/usePreferredMerchantId';
import { useActionGuard, useLatestRequest } from '../../lib/async-guards';

export default function OutboxPage() {
  const { merchantId, setMerchantId } = usePreferredMerchantId();
  const [status, setStatus] = useState<string>('PENDING');
  const [type, setType] = useState<string>('');
  const [since, setSince] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [items, setItems] = useState<OutboxEvent[]>([]);
  const [msg, setMsg] = useState<string>('');
  const [stats, setStats] = useState<{ counts: Record<string, number>; typeCounts?: Record<string, number>; lastDeadAt: string|null } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<string>('');
  const { start, isLatest } = useLatestRequest();
  const runAction = useActionGuard();

  const load = useCallback(async () => {
    if (!merchantId) {
      setMsg('Укажите merchantId');
      setItems([]);
      setStats(null);
      setLoading(false);
      return;
    }
    const requestId = start();
    setLoading(true);
    try {
      const [r, s, st] = await Promise.all([
        listOutbox(merchantId, { status: status || undefined, type: type || undefined, since: since || undefined, limit }),
        getSettings(merchantId) as Promise<{ outboxPausedUntil?: unknown }>,
        outboxStats(merchantId, since || undefined),
      ]);
      if (!isLatest(requestId)) return;
      setItems(r);
      if (s.outboxPausedUntil) {
        const pausedAt = new Date(String(s.outboxPausedUntil));
        setMsg(`Outbox paused until ${pausedAt.toLocaleString()}`);
      }
      setStats({ counts: st.counts, typeCounts: st.typeCounts, lastDeadAt: st.lastDeadAt });
    } catch (e: unknown) {
      if (!isLatest(requestId)) return;
      setMsg(String(e instanceof Error ? e.message : e));
    }
    finally {
      if (isLatest(requestId)) setLoading(false);
    }
  }, [limit, merchantId, since, status, type, isLatest, start]);

  useEffect(() => { void load(); }, [load]);

  const setPreset = (hours: number) => {
    const d = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    setSince(d);
  };

  const onRetry = async (id: string) => {
    if (!merchantId) return;
    await runAction(async () => {
      await retryOutbox(merchantId, id);
      await load();
    });
  };
  const onDelete = async (id: string) => {
    if (!merchantId) return;
    await runAction(async () => {
      await deleteOutbox(merchantId, id);
      await load();
    });
  };
  const onRetryAll = async () => {
    if (!merchantId) return;
    await runAction(async () => {
      await retryAll(merchantId, status || undefined);
      await load();
    });
  };
  const onRetryFailed = async () => {
    if (!merchantId) return;
    await runAction(async () => {
      await retryAll(merchantId, 'FAILED');
      await load();
    });
  };
  const onRetryDead = async () => {
    if (!merchantId) return;
    await runAction(async () => {
      await retryAll(merchantId, 'DEAD');
      await load();
    });
  };
  const onRetrySince = async () => {
    if (!merchantId) return;
    const s = prompt('Статус для ретрая с даты (оставьте пустым для любого): PENDING|FAILED|DEAD', status || '');
    const dt = prompt('С даты (ISO, например 2025-09-01T00:00:00Z)', since || '');
    const statusValue = s && s.trim() ? s.trim() : undefined;
    await runAction(async () => {
      await retrySince(merchantId, { status: statusValue, since: dt || undefined });
      await load();
    });
  };
  const onPause = async () => {
    if (!merchantId) return;
    const minsStr = prompt('На сколько минут паузу? (по умолчанию 60)');
    const minutes = minsStr ? parseInt(minsStr, 10) : 60;
    await runAction(async () => {
      await pauseOutbox(merchantId, { minutes: isNaN(minutes) ? 60 : minutes });
      await load();
    });
  };
  const onResume = async () => {
    if (!merchantId) return;
    await runAction(async () => {
      await resumeOutbox(merchantId);
      await load();
    });
  };
  const csvHref = merchantId ? outboxCsvUrl(merchantId, { status: status || undefined, type: type || undefined, since: since || undefined, limit }) : '#';
  const onRetrySinceLastDead = async () => {
    const merchant = merchantId;
    const sinceAt = stats?.lastDeadAt;
    if (!sinceAt || !merchant) return;
    await runAction(async () => {
      await retrySince(merchant, { since: sinceAt, status: 'DEAD' });
      await load();
    });
  };
  const loadByOrder = async () => {
    if (!orderId.trim()) return;
    const requestId = start();
    setLoading(true);
    try {
      const r = await listOutboxByOrder(merchantId, orderId.trim(), limit || 100);
      if (!isLatest(requestId)) return;
      setItems(r);
      setMsg(`Показаны события по orderId=${orderId.trim()}`);
    } catch (e: unknown) {
      if (!isLatest(requestId)) return;
      setMsg(String(e instanceof Error ? e.message : e));
    }
    finally {
      if (isLatest(requestId)) setLoading(false);
    }
  };

  return (
    <div>
      <h2>Outbox</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} /></label>
        <label>Статус: 
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">— любой —</option>
            <option value="PENDING">PENDING</option>
            <option value="SENDING">SENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD">DEAD</option>
            <option value="SENT">SENT</option>
          </select>
        </label>
        <label>Тип: <input value={type} onChange={e=>setType(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="loyalty.commit" /></label>
        <label>С даты (ISO): <input value={since} onChange={e=>setSince(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="2025-09-01T00:00:00Z" /></label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={()=>setPreset(24)} style={{ padding: '6px 10px' }}>24h</button>
          <button onClick={()=>setPreset(24*7)} style={{ padding: '6px 10px' }}>7d</button>
          <button onClick={()=>setPreset(24*30)} style={{ padding: '6px 10px' }}>30d</button>
        </div>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'50',10))} style={{ marginLeft: 8, width: 90 }} /></label>
        <button onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>Обновить</button>
        <button onClick={onRetryAll} disabled={loading} style={{ padding: '6px 10px' }}>Retry All</button>
        <button onClick={onRetryFailed} disabled={loading} style={{ padding: '6px 10px' }}>Retry FAILED</button>
        <button onClick={onRetryDead} disabled={loading} style={{ padding: '6px 10px' }}>Retry DEAD</button>
        <button onClick={onRetrySince} disabled={loading} style={{ padding: '6px 10px' }}>Retry Since…</button>
        <a href={csvHref} style={{ padding: '6px 10px', background:'#0e1629', borderRadius:6, textDecoration:'none' }} download>Download CSV</a>
        <button onClick={onPause} disabled={loading} style={{ padding: '6px 10px' }}>Pause</button>
        <button onClick={onResume} disabled={loading} style={{ padding: '6px 10px' }}>Resume</button>
        <span style={{ flex: 1 }} />
        <label>OrderId: <input value={orderId} onChange={e=>setOrderId(e.target.value)} style={{ marginLeft: 8, width: 200 }} placeholder="order-123" /></label>
        <button onClick={loadByOrder} disabled={loading || !orderId.trim()} style={{ padding: '6px 10px' }}>Find by Order</button>
      </div>
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          {['PENDING','SENDING','FAILED','DEAD','SENT'].map(k => (
            <div key={k} style={{ background: '#0e1629', padding: '6px 10px', borderRadius: 6 }}>
              <b>{k}</b>: {stats.counts[k] || 0}
            </div>
          ))}
          {stats.lastDeadAt && (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ opacity: 0.8 }}>last DEAD: {new Date(stats.lastDeadAt).toLocaleString()}</div>
              <button onClick={onRetrySinceLastDead} style={{ padding:'4px 8px' }}>Retry since last DEAD</button>
            </div>
          )}
        </div>
      )}
      {stats?.typeCounts && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
          {Object.entries(stats.typeCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([t,c]) => (
            <button key={t} onClick={()=>{ setType(t); void load(); }} style={{ background:'#0e1629', padding:'6px 10px', borderRadius:6 }}>
              <b>{t}</b>: {c}
            </button>
          ))}
        </div>
      )}
      {stats?.typeCounts && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ opacity: 0.85, marginBottom: 4 }}>По типам событий:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(stats.typeCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([t,c]) => (
              <div key={t} style={{ background: '#0e1629', padding: '6px 10px', borderRadius: 6 }}>
                <b>{t}</b>: {c}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(ev => (
          <div key={ev.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div><b>{ev.eventType}</b> • <span style={{ opacity: 0.8 }}>{ev.status}</span> • retries: {ev.retries}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>id: {ev.id} • created: {new Date(ev.createdAt).toLocaleString()} • nextRetry: {ev.nextRetryAt ? new Date(ev.nextRetryAt).toLocaleString() : '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={()=>onRetry(ev.id)} style={{ padding: '6px 10px' }}>Retry</button>
                <button onClick={()=>onDelete(ev.id)} style={{ padding: '6px 10px' }}>Delete</button>
              </div>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>{JSON.stringify(ev.payload, null, 2)}</pre>
            {ev.lastError && <div style={{ color: '#f38ba8' }}>lastError: {ev.lastError}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
