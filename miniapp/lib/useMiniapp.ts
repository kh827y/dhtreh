"use client";
import { useEffect, useState } from 'react';
import { teleauth, publicSettings, ReviewsShareSettings, grantRegistrationBonus, referralLink } from './api';

export function getInitData(): string | null {
  try {
    const search = new URLSearchParams(window.location.search);
    const fromQuery =
      search.get('tgWebAppData') ||
      search.get('initData') ||
      search.get('tg_init_data') ||
      null;
    if (fromQuery && fromQuery.includes('hash=')) return fromQuery;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any)?.Telegram?.WebApp as { initData?: string; initDataUnsafe?: unknown } | undefined;
    if (tg?.initData && tg.initData.includes('hash=')) return tg.initData;
    return null;
  } catch { return null; }
}

export function isValidInitData(initData: string | null): initData is string {
  return typeof initData === 'string' && initData.includes('hash=');
}

export async function waitForInitData(attempts = 8, delayMs = 150): Promise<string | null> {
  let last = getInitData();
  if (isValidInitData(last)) return last;
  for (let i = 0; i < attempts; i += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
    last = getInitData();
    if (isValidInitData(last)) return last;
  }
  return last;
}

export function getMerchantFromContext(initData: string | null): string | undefined {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = q.get('merchantId') || q.get('merchant') || undefined;
    if (fromQuery) return fromQuery;
    // Fallback: попытаться вытащить merchantId из initData → start_param/startapp
    // Замечание: это только источник контекста для запроса к серверу; проверка/валидация выполняется на бэкенде
    if (initData) {
      try {
        const u = new URLSearchParams(initData);
        const sp = u.get('start_param') || u.get('startapp');
        if (sp) {
          const parts = sp.split('.');
          const looksLikeJwt = parts.length === 3 && parts.every((x) => x && /^[A-Za-z0-9_-]+$/.test(x));
          if (looksLikeJwt) {
            try {
              const payload = parts[1];
              const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
              let jsonStr = '';
              try {
                // Browser-safe base64 decode
                const bin = (typeof atob === 'function') ? atob(b64) : '';
                if (bin) {
                  try {
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    jsonStr = new TextDecoder().decode(bytes);
                  } catch {
                    // Fallback for older browsers
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    jsonStr = decodeURIComponent(escape(bin));
                  }
                }
              } catch {}
              if (jsonStr) {
                const obj = JSON.parse(jsonStr);
                const mid = typeof obj?.merchantId === 'string' ? obj.merchantId : undefined;
                if (mid) return mid;
              }
            } catch {}
          } else {
            // legacy strict mode: в start_param может лежать сам merchantId
            if (sp.trim()) return sp.trim();
          }
        }
      } catch {}
    }
  } catch {}
  return undefined;
}

export function useMiniappAuth(defaultMerchant: string) {
  const [merchantId, setMerchantId] = useState<string>(defaultMerchant);
  const [merchantCustomerId, setMerchantCustomerId] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null; ttl?: number }>({});
  const [shareSettings, setShareSettings] = useState<ReviewsShareSettings>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await waitForInitData();
      if (cancelled) return;
      setInitData(id);
      const ctxMerchant = getMerchantFromContext(id);
      if (ctxMerchant) setMerchantId(ctxMerchant);
      const mId = ctxMerchant || merchantId;

      const customerKey = (m: string) => `miniapp.merchantCustomerId.v1:${m}`;
      const profileKey = (m: string) => `miniapp.profile.v2:${m}`;
      const sanitize = (v: string | null): string | null => {
        if (!v) return null;
        return v === 'undefined' ? null : v;
      };

      // Migrate legacy global customerId to per-merchant key only when нет валидной телеграм-авторизации
      const legacy = sanitize(localStorage.getItem('miniapp.customerId'));
      const legacyMc = sanitize(localStorage.getItem('miniapp.merchantCustomerId'));
      const savedScoped = sanitize(mId ? localStorage.getItem(customerKey(mId)) : null);
      const hasTelegramAuth = isValidInitData(id);
      if (!hasTelegramAuth) {
        if (savedScoped) setMerchantCustomerId(savedScoped);
        else if (legacyMc) {
          setMerchantCustomerId(legacyMc);
          if (mId) localStorage.setItem(customerKey(mId), legacyMc);
        } else if (legacy) {
          setMerchantCustomerId(legacy);
          if (mId) localStorage.setItem(customerKey(mId), legacy);
        }
      }
      // Dev fallback only when нет валидного initData и ничего не сохранено
      try {
        const devAuto = (process.env.NEXT_PUBLIC_MINIAPP_DEV_AUTO_CUSTOMER === '1') ||
          ((process.env.NEXT_PUBLIC_MINIAPP_DEV_AUTO_CUSTOMER || '').toLowerCase() === 'true');
        if (!hasTelegramAuth && !savedScoped && !legacy && !legacyMc && devAuto) {
          const gen = 'user-' + Math.random().toString(36).slice(2, 10);
          setMerchantCustomerId(gen);
          if (mId) localStorage.setItem(customerKey(mId), gen);
        }
      } catch {}

      try {
        const s = await publicSettings(mId);
        setTheme({ primary: s.miniappThemePrimary, bg: s.miniappThemeBg, logo: s.miniappLogoUrl, ttl: s.qrTtlSec });
        const normalizedShare = s.reviewsShare
          ? {
              ...s.reviewsShare,
              platforms: Array.isArray(s.reviewsShare.platforms)
                ? s.reviewsShare.platforms
                    .filter((platform): platform is typeof s.reviewsShare.platforms[number] => !!platform && typeof platform === 'object')
                    .map((platform) => ({
                      ...platform,
                      outlets: Array.isArray(platform.outlets)
                        ? platform.outlets
                            .filter((outlet): outlet is { outletId: string; url: string } => {
                              return !!outlet && typeof outlet === 'object' && typeof outlet.outletId === 'string' && typeof outlet.url === 'string';
                            })
                            .map((outlet) => ({ outletId: outlet.outletId, url: outlet.url }))
                        : [],
                    }))
                : [],
            }
          : null;
        setShareSettings(normalizedShare);
      } catch {}
      try {
        // Prefer server teleauth when running inside Telegram (initData present)
        if (hasTelegramAuth && mId) {
          const prev = savedScoped || legacyMc || legacy || null;
          const r = await teleauth(mId, id);
          console.log('teleauth result:', r);
          if (r?.merchantCustomerId && typeof r.merchantCustomerId === 'string' && r.merchantCustomerId.trim() && r.merchantCustomerId !== 'undefined') {
            console.log('setting merchantCustomerId:', r.merchantCustomerId);
            setMerchantCustomerId(r.merchantCustomerId);
            localStorage.setItem(customerKey(mId), r.merchantCustomerId);
          } else {
            console.log('not setting merchantCustomerId, invalid:', r?.merchantCustomerId);
          }
          try {
            localStorage.removeItem('miniapp.customerId');
            localStorage.removeItem('miniapp.merchantCustomerId');
          } catch {}
          // If customer switched, clear per-merchant profile and regBonus flags
          if (prev && prev !== r.merchantCustomerId) {
            try { localStorage.removeItem(profileKey(mId)); } catch {}
            try { localStorage.removeItem(`regBonus:${mId}:${prev}`); } catch {}
          }
          setError('');
          // referralLink будет вызван в page.tsx после установки merchantCustomerId
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMerchant]);

  // Автоначисление бонуса за регистрацию: один раз на пару merchantId+customerId (идемпотентный бэкенд)
  useEffect(() => {
    (async () => {
      try {
        if (!merchantId || !merchantCustomerId) return;
        const key = `regBonus:${merchantId}:${merchantCustomerId}`;
        const attempted = localStorage.getItem(key);
        if (attempted) return;
        await grantRegistrationBonus(merchantId, merchantCustomerId).catch(() => void 0);
        localStorage.setItem(key, '1');
      } catch {
        // глушим, чтобы не ломать UX миниаппы — сервер идемпотентен и может быть временно недоступен
      }
    })();
  }, [merchantId, merchantCustomerId]);

  return {
    merchantId,
    setMerchantId,
    merchantCustomerId,
    setMerchantCustomerId,
    loading,
    error,
    theme,
    shareSettings,
    initData,
  } as const;
}
