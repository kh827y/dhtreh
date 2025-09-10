"use client";
import { useEffect, useState } from 'react';

export default function OutboxLink({ merchantId }: { merchantId: string }) {
  const [pending, setPending] = useState(false);
  const [dead, setDead] = useState(false);
  const load = async () => {
    try {
      const r = await fetch('/api/metrics');
      if (!r.ok) throw new Error();
      const j = await r.json();
      setPending((j?.outboxPending || 0) > 0);
      setDead((j?.outboxDead || 0) > 0);
    } catch {}
  };
  useEffect(() => { load().catch(()=>{}); const t = setInterval(load, 15000); return () => clearInterval(t); }, [merchantId]);
  const badge = dead ? '🔴' : pending ? '🟡' : '🟢';
  return <a href="/outbox" style={{ color: '#89b4fa' }}>Outbox <span title={dead ? 'DEAD' : pending ? 'PENDING' : 'OK'}>{badge}</span></a>;
}

