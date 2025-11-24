"use client";
import { useEffect, useState } from 'react';

export default function RoleBadge() {
  const [role, setRole] = useState<string>('');
  useEffect(() => { (async () => { try { const r = await fetch('/api/auth/me'); if (r.ok) { const j = await r.json(); setRole(j.role || ''); } } catch {} })(); }, []);
  if (!role) return null;
  const color = '#a6e3a1';
  return <span style={{ padding: '2px 6px', borderRadius: 6, background: '#0e1629', color, border: '1px solid #1f2b45' }}>ADMIN</span>;
}

