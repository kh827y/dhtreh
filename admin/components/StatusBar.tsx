"use client";
import { useEffect, useState } from 'react';
import { listOutbox } from '../lib/outbox';

export default function StatusBar({ merchantId }: { merchantId: string }) {
  const [hasPending, setHasPending] = useState<boolean>(false);
  const [hasDead, setHasDead] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');

  const load = async () => {
    try {
      const [p, d] = await Promise.all([
        listOutbox(merchantId, { status: 'PENDING', limit: 1 }),
        listOutbox(merchantId, { status: 'DEAD', limit: 1 }),
      ]);
      setHasPending((p?.length || 0) > 0);
      setHasDead((d?.length || 0) > 0);
      setMsg('');
    } catch (e:any) { setMsg(String(e?.message || e)); }
  };

  useEffect(() => { load().catch(()=>{}); const i = setInterval(load, 15000); return () => clearInterval(i); }, [merchantId]);

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
      <span>Outbox: {hasPending ? <b style={{ color: '#f9e2af' }}>есть PENDING</b> : <span style={{ color: '#a6e3a1' }}>OK</span>} {hasDead && <b style={{ color: '#f38ba8' }}>(DEAD события!)</b>}</span>
      <a href="/outbox" style={{ color: '#89b4fa' }}>перейти</a>
      {msg && <span style={{ color: '#f38ba8' }}>{msg}</span>}
    </div>
  );
}

