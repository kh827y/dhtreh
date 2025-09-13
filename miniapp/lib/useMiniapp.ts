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
    // Dev fallback: if no Telegram initData and no saved customerId, auto-generate one for localhost/dev
    try {
      const devAuto = (process.env.NEXT_PUBLIC_MINIAPP_DEV_AUTO_CUSTOMER === '1') ||
        ((process.env.NEXT_PUBLIC_MINIAPP_DEV_AUTO_CUSTOMER || '').toLowerCase() === 'true') ||
        (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost');
      if (!saved && !id && devAuto) {
        const gen = 'user-' + Math.random().toString(36).slice(2, 10);
        setCustomerId(gen);
        localStorage.setItem('miniapp.customerId', gen);
      }
    } catch {}
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

