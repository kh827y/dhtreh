"use client";
import React, { useEffect, useRef, useState } from 'react';

export function EffectiveRatesPopover({ merchantId, levelName, className }: { merchantId: string; levelName?: string|null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [earnPct, setEarnPct] = useState<string>('');
  const [redeemPct, setRedeemPct] = useState<string>('');
  const rootRef = useRef<HTMLSpanElement>(null);

  const load = async () => {
    if (!merchantId) return;
    setLoading(true); setErr(''); setEarnPct(''); setRedeemPct('');
    try {
      const wd = new Date().getDay();
      const p = new URLSearchParams({ channel: 'VIRTUAL', weekday: String(wd), eligibleTotal: '1000' }).toString();
      const r = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/rules/preview?` + p);
      if (!r.ok) throw new Error(await r.text());
      const rules = await r.json();
      let earnBps = Number(rules.earnBps || 500);
      let redeemBps = Number(rules.redeemLimitBps || 5000);
      const s = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/settings`);
      if (s.ok) {
        const st = await s.json();
        const lb = st?.rulesJson?.levelBenefits || {};
        const earnMap = lb.earnBpsBonusByLevel || {};
        const redeemMap = lb.redeemLimitBpsBonusByLevel || {};
        if (levelName) {
          earnBps += Number(earnMap?.[levelName] || 0);
          redeemBps += Number(redeemMap?.[levelName] || 0);
        }
      }
      setEarnPct((earnBps/100).toFixed(2));
      setRedeemPct((redeemBps/100).toFixed(2));
    } catch (e) {
      setErr(String((e as any)?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Закрытие по клику вне и по Esc
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={className} style={{ position:'relative', display:'inline-block', marginLeft: 6 }}>
      <button
        onClick={async ()=>{ setOpen(v=>!v); if (!open) await load(); }}
        disabled={loading}
        title="Эффективные ставки"
        aria-expanded={open}
        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background:'#111827', color:'#cbd5e1', border:'1px solid #1f2937' }}
      >{loading ? '...' : 'эфф. ставки'}</button>
      {open && (
        <div role="dialog" aria-label="Эффективные ставки" style={{ position:'absolute', top: '120%', left: 0, background:'#0b1221', color:'#e5e7eb', border:'1px solid #1f2937', borderRadius: 8, padding: 8, minWidth: 220, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          {err && <div style={{ color:'#f38ba8', marginBottom: 6 }}>{err}</div>}
          {!err && (
            <div style={{ display:'grid', gap: 6 }}>
              <div style={{ opacity: 0.9 }}>Для примера: eligible=1000</div>
              {loading ? (
                <div style={{ display:'grid', gap: 6 }}>
                  <div style={{ height: 10, borderRadius: 4, background:'linear-gradient(90deg, #111827 25%, #1f2937 37%, #111827 63%)', backgroundSize:'400% 100%', animation:'shimmer 1.2s ease-in-out infinite' }} />
                  <div style={{ height: 10, borderRadius: 4, background:'linear-gradient(90deg, #111827 25%, #1f2937 37%, #111827 63%)', backgroundSize:'400% 100%', animation:'shimmer 1.2s ease-in-out infinite' }} />
                  <style>{`@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }`}</style>
                </div>
              ) : (
                <>
                  {earnPct && <div>Начисление: <b>{earnPct}%</b></div>}
                  {redeemPct && <div>Лимит списания: <b>{redeemPct}%</b></div>}
                  {!earnPct && !redeemPct && <div style={{ opacity: 0.7 }}>Нет данных</div>}
                </>
              )}
            </div>
          )}
          <div style={{ textAlign:'right', marginTop:6 }}>
            <button onClick={()=>setOpen(false)} style={{ fontSize: 11, padding:'2px 6px', borderRadius:6, background:'#0f172a', color:'#cbd5e1', border:'1px solid #1f2937' }}>закрыть</button>
          </div>
        </div>
      )}
    </span>
  );
}
