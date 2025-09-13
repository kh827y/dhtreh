"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function AuditDetailPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>('');
  const params = useParams();
  const id = String((params as any)?.id || '');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/admin/audit/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error(await r.text());
        setData(await r.json()); setErr('');
      } catch (e: any) { setErr(String(e?.message || e)); }
    })();
  }, [id]);

  return (
    <div>
      <h2>Audit #{id}</h2>
      {err && <div style={{ color: '#f38ba8' }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div>createdAt: {data.createdAt ? new Date(data.createdAt).toLocaleString() : '—'}</div>
          <div>actor: {data.actor}</div>
          <div>method: {data.method}</div>
          <div>path: {data.path}</div>
          <div>merchantId: {data.merchantId || '—'}</div>
          <div>action: {data.action || '—'}</div>
          <div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>Payload</div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(data.payload ?? null, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

