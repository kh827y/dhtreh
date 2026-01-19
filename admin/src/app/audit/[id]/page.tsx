"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function AuditDetailPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string>('');
  const params = useParams<{ id?: string | string[] }>();
  const idParam = params?.id;
  const id = Array.isArray(idParam) ? idParam[0] : (idParam || '');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/admin/audit/${encodeURIComponent(id)}`);
        if (r.status === 404) {
          setData(null);
          setErr('Запись не найдена');
          return;
        }
        if (!r.ok) throw new Error(await r.text());
        const payload = await r.json();
        if (!payload) {
          setData(null);
          setErr('Запись не найдена');
          return;
        }
        setData(payload);
        setErr('');
      } catch (e: unknown) { setErr(String(e instanceof Error ? e.message : e)); }
    })();
  }, [id]);

  return (
    <div>
      <h2>Audit #{id}</h2>
      {err && <div style={{ color: '#f38ba8' }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div>createdAt: {typeof data.createdAt === 'string' ? new Date(data.createdAt).toLocaleString() : '—'}</div>
          <div>actor: {typeof data.actor === 'string' ? data.actor : '—'}</div>
          <div>method: {typeof data.method === 'string' ? data.method : '—'}</div>
          <div>path: {typeof data.path === 'string' ? data.path : '—'}</div>
          <div>merchantId: {typeof data.merchantId === 'string' ? data.merchantId : '—'}</div>
          <div>action: {typeof data.action === 'string' ? data.action : '—'}</div>
          <div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>Payload</div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(data.payload ?? null, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
