"use client";
import { useEffect } from 'react';

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      location.href = '/login';
    })();
  }, []);
  return <div style={{ padding: 20 }}>Logging out…</div>;
}

