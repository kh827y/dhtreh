"use client";
import { useEffect, useState } from 'react';
import { usePreferredMerchantId } from '../../../../lib/usePreferredMerchantId';

export default function OutboxEventPage({ params }: { params: { id: string } }) {
  const { merchantId, setMerchantId } = usePreferredMerchantId();
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<string>('');
  const [payloadText, setPayloadText] = useState<string | null>(null);
  const [payloadError, setPayloadError] = useState<string>('');
  const [showPayloadFull, setShowPayloadFull] = useState<boolean>(false);
  const [showLastErrorFull, setShowLastErrorFull] = useState<boolean>(false);
  const id = params.id;
  const payloadPreviewLimit = 4000;
  const errorPreviewLimit = 500;

  async function load() {
    try {
      if (!merchantId) { setMsg('Укажите merchantId'); setData(null); return; }
      const r = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox/event/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json()); setMsg('');
    } catch (e: any) { setMsg(String(e?.message || e)); }
  }
  useEffect(() => { load().catch(()=>{}); }, [merchantId, id]);
  useEffect(() => {
    setPayloadText(null);
    setPayloadError('');
    setShowPayloadFull(false);
    setShowLastErrorFull(false);
  }, [data?.id]);

  const doRetry = async () => {
    try {
      if (!merchantId) return;
      const r = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: { 'x-admin-action': 'ui' } });
      if (!r.ok) throw new Error(await r.text());
      await load(); alert('Retry scheduled');
    } catch (e: any) { alert(String(e?.message || e)); }
  };
  const doDelete = async () => {
    if (!confirm('Удалить событие?')) return;
    try {
      if (!merchantId) return;
      const r = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-admin-action': 'ui' } });
      if (!r.ok) throw new Error(await r.text());
      location.href = '/outbox';
    } catch (e: any) { alert(String(e?.message || e)); }
  };

  const showPayload = () => {
    if (!data || payloadText !== null || payloadError) return;
    try {
      const text = JSON.stringify(data.payload ?? null, null, 2);
      setPayloadText(text);
    } catch {
      setPayloadError('Не удалось показать payload');
    }
  };

  return (
    <div>
      <h2>Outbox Event</h2>
      <div style={{ marginBottom: 12 }}>
        <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} /></label>
      </div>
      {msg && <div style={{ color: '#f38ba8', marginBottom: 8 }}>{msg}</div>}
      {data && (
        <div style={{ display:'grid', gap: 8 }}>
          <div>id: <code>{data.id}</code></div>
          <div>type: <b>{data.eventType}</b></div>
          <div>status: {data.status} • retries: {data.retries}</div>
          <div>created: {new Date(data.createdAt).toLocaleString()}</div>
          <div>nextRetryAt: {data.nextRetryAt ? new Date(data.nextRetryAt).toLocaleString() : '—'}</div>
          {data.lastError && (
            <div style={{ color:'#f38ba8' }}>
              lastError:{' '}
              {showLastErrorFull || String(data.lastError).length <= errorPreviewLimit
                ? data.lastError
                : `${String(data.lastError).slice(0, errorPreviewLimit)}…`}
              {String(data.lastError).length > errorPreviewLimit && (
                <button
                  onClick={() => setShowLastErrorFull((prev) => !prev)}
                  style={{ marginLeft: 8, padding: '2px 6px' }}
                >
                  {showLastErrorFull ? 'Скрыть' : 'Показать полностью'}
                </button>
              )}
            </div>
          )}
          <div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>Payload</div>
            {payloadError && <div style={{ color:'#f38ba8' }}>{payloadError}</div>}
            {payloadText === null ? (
              <button onClick={showPayload} style={{ padding: '6px 10px' }}>
                Показать payload
              </button>
            ) : (
              <>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {showPayloadFull || payloadText.length <= payloadPreviewLimit
                    ? payloadText
                    : `${payloadText.slice(0, payloadPreviewLimit)}\n…`}
                </pre>
                {payloadText.length > payloadPreviewLimit && (
                  <button
                    onClick={() => setShowPayloadFull((prev) => !prev)}
                    style={{ padding: '4px 8px' }}
                  >
                    {showPayloadFull ? 'Скрыть' : 'Показать полностью'}
                  </button>
                )}
              </>
            )}
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button onClick={doRetry} style={{ padding: '6px 10px' }}>Retry</button>
            <button onClick={doDelete} style={{ padding: '6px 10px' }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
