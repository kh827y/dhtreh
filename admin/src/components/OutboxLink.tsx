"use client";
import { useCallback, useEffect, useState } from 'react';
import { useLatestRequest } from '../lib/async-guards';

export default function OutboxLink() {
  const [pending, setPending] = useState(false);
  const [dead, setDead] = useState(false);
  const { start, isLatest } = useLatestRequest();
  const load = useCallback(async () => {
    const requestId = start();
    try {
      const r = await fetch('/api/metrics');
      if (!r.ok) throw new Error();
      const j = await r.json();
      if (!isLatest(requestId)) return;
      setPending((j?.outboxPending || 0) > 0);
      setDead((j?.outboxDead || 0) > 0);
    } catch {}
  }, [isLatest, start]);
  useEffect(() => { load().catch(()=>{}); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const badge = dead ? '🔴' : pending ? '🟡' : '🟢';
  return <a href="/outbox" style={{ color: '#89b4fa' }}>Outbox <span title={dead ? 'DEAD' : pending ? 'PENDING' : 'OK'}>{badge}</span></a>;
}
