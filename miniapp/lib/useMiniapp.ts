"use client";
import { useEffect, useState } from 'react';
import { teleauth, publicSettings } from './api';

export function getInitData(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any)?.Telegram?.WebApp as { initData?: string } | undefined;
    if (tg?.initData) return tg.initData;
    const p = new URLSearchParams(window.location.search);
    return p.get('initData') || p.get('tgWebAppData') || p.get('tg_init_data');
  } catch { return null; }
}

export function getMerchantFromContext(initData: string | null): string | undefined {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = q.get('merchantId') || undefined;
    if (fromQuery) return fromQuery;
    if (initData) {
      const u = new URLSearchParams(initData);
      const sp = u.get('start_param') || u.get('startapp');
      if (sp) return sp;
    }
  } catch {}
  return undefined;
}

export function useMiniappAuth(defaultMerchant: string) {
  const [merchantId, setMerchantId] = useState<string>(defaultMerchant);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null; ttl?: number }>({});

  useEffect(() => {
    const saved = localStorage.getItem('miniapp.customerId');
    if (saved) setCustomerId(saved);
    const id = getInitData();
    const ctxMerchant = getMerchantFromContext(id);
    if (ctxMerchant) setMerchantId(ctxMerchant);
    const mId = ctxMerchant || merchantId;
    (async () => {
      try {
        const s = await publicSettings(mId);
        setTheme({ primary: s.miniappThemePrimary, bg: s.miniappThemeBg, logo: s.miniappLogoUrl, ttl: s.qrTtlSec });
      } catch {}
      try {
        if (id && mId) {
          const r = await teleauth(mId, id);
          setCustomerId(r.customerId);
          localStorage.setItem('miniapp.customerId', r.customerId);
        }
        setError('');
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMerchant]);

  return { merchantId, setMerchantId, customerId, setCustomerId, loading, error, theme } as const;
}

