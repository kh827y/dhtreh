"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { listAudit, type AuditItem } from '../../lib/audit';
import { usePreferredMerchantId } from '../../lib/usePreferredMerchantId';
import { useLatestRequest } from '../../lib/async-guards';

export default function AuditPage() {
  const { merchantId, setMerchantId } = usePreferredMerchantId('');
  const [items, setItems] = useState<AuditItem[]>([]);
  const [limit, setLimit] = useState<number>(50);
  const [before, setBefore] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const { start, isLatest } = useLatestRequest();
  const beforeValue = before.trim();
  const beforeValid = !beforeValue || !Number.isNaN(new Date(beforeValue).getTime());

  const load = useCallback(async () => {
    if (!beforeValid) {
      setMsg('Неверный формат даты');
      return;
    }
    const requestId = start();
    setLoading(true);
    try {
      const r = await listAudit({ merchantId: merchantId || undefined, limit, before: beforeValue || undefined });
      if (!isLatest(requestId)) return;
      setItems(r);
      setMsg('');
    } catch (e: unknown) {
      if (!isLatest(requestId)) return;
      setMsg(String(e instanceof Error ? e.message : e));
    }
    finally {
      if (isLatest(requestId)) setLoading(false);
    }
  }, [beforeValid, beforeValue, limit, merchantId, isLatest, start]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h2>Admin Audit</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} placeholder="опц." /></label>
        <label>Лимит: <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||'50',10))} style={{ marginLeft: 8, width: 90 }} /></label>
        <label>До (ISO): <input value={before} onChange={e=>setBefore(e.target.value)} style={{ marginLeft: 8, width: 220 }} placeholder="2025-09-01T00:00:00Z" /></label>
        <button onClick={load} disabled={loading || !beforeValid} style={{ padding: '6px 10px' }}>Обновить</button>
        <a
          href={`/api/admin/admin/audit/csv${merchantId || beforeValue ? `?${new URLSearchParams({ ...(merchantId ? { merchantId } : {}), ...(beforeValid && beforeValue ? { before: beforeValue } : {}), limit: String(limit) }).toString()}` : ''}`}
          onClick={(e) => {
            if (beforeValid) return;
            e.preventDefault();
            setMsg('Неверный формат даты');
          }}
          style={{ color: beforeValid ? '#89b4fa' : '#6c7086', pointerEvents: beforeValid ? 'auto' : 'none' }}
          target="_blank"
          rel="noreferrer"
        >
          Export CSV
        </a>
      </div>
      {msg && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(it => (
          <div key={it.id} style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div><b>{new Date(it.createdAt).toLocaleString()}</b> • {it.actor} • {it.method}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>path: {it.path} {it.merchantId ? ("• merchantId: " + it.merchantId) : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link href={'/audit/' + encodeURIComponent(it.id)} style={{ color: '#89b4fa' }}>view</Link>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{it.id}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
