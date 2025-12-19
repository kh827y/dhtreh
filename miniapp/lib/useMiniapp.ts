"use client";
import { useEffect, useState } from 'react';
import {
  teleauth,
  publicSettings,
  ReviewsShareSettings,
  grantRegistrationBonus,
  setTelegramAuthInitData,
  type TeleauthResponse,
} from './api';

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'failed';

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
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null; ttl?: number }>({});
  const [shareSettings, setShareSettings] = useState<ReviewsShareSettings>(null);
  const [reviewsEnabled, setReviewsEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [teleOnboarded, setTeleOnboarded] = useState<boolean | null>(null);
  const [teleHasPhone, setTeleHasPhone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('authenticating');
      setLoading(true);
      setError('');
      setTeleOnboarded(null);
      setTeleHasPhone(null);
      setCustomerId(null);
      const resolvedInitData = await waitForInitData();
      if (cancelled) return;
      setInitData(resolvedInitData);
      setTelegramAuthInitData(
        isValidInitData(resolvedInitData) ? resolvedInitData : null,
      );
      const ctxMerchant = getMerchantFromContext(resolvedInitData);
      const fallbackMerchant = ctxMerchant || defaultMerchant || merchantId;
      if (ctxMerchant && ctxMerchant !== merchantId) setMerchantId(ctxMerchant);
      else if (!ctxMerchant && defaultMerchant && defaultMerchant !== merchantId)
        setMerchantId(defaultMerchant);
      if (!fallbackMerchant) {
        setError('Не удалось определить мерчанта');
        setStatus('failed');
        setLoading(false);
        return;
      }
      if (!isValidInitData(resolvedInitData)) {
        setError('Откройте миниаппу внутри Telegram');
        setStatus('failed');
        setLoading(false);
        return;
      }
      const customerKey = (m: string) => `miniapp.customerId.v1:${m}`;
      const legacyCustomerKey = (m: string) => `miniapp.merchantCustomerId.v1:${m}`;
      const profileKey = (m: string) => `miniapp.profile.v2:${m}`;
      let previousScoped: string | null = null;
      try {
        const stored =
          localStorage.getItem(customerKey(fallbackMerchant)) ||
          localStorage.getItem(legacyCustomerKey(fallbackMerchant));
        previousScoped =
          stored && stored !== 'undefined' && stored.trim() ? stored : null;
      } catch {
        previousScoped = null;
      }
      try {
        const [settingsResult, authResult] = await Promise.allSettled([
          publicSettings(fallbackMerchant),
          teleauth(fallbackMerchant, resolvedInitData),
        ]);
        if (cancelled) return;
        if (settingsResult.status === 'fulfilled') {
          const s = settingsResult.value;
          setTheme({
            primary: s.miniappThemePrimary,
            bg: s.miniappThemeBg,
            logo: s.miniappLogoUrl,
            ttl: s.qrTtlSec,
          });
          if (typeof s.reviewsEnabled === 'boolean') {
            setReviewsEnabled(s.reviewsEnabled);
          } else {
            setReviewsEnabled(null);
          }
          const normalizedShare = s.reviewsShare
            ? {
                ...s.reviewsShare,
                platforms: Array.isArray(s.reviewsShare.platforms)
                  ? s.reviewsShare.platforms
                      .filter(
                        (platform): platform is typeof s.reviewsShare.platforms[number] =>
                          !!platform && typeof platform === 'object',
                      )
                      .map((platform) => ({
                        ...platform,
                        outlets: Array.isArray(platform.outlets)
                          ? platform.outlets
                              .filter(
                                (outlet): outlet is { outletId: string; url: string } =>
                                  !!outlet &&
                                  typeof outlet === 'object' &&
                                  typeof outlet.outletId === 'string' &&
                                  typeof outlet.url === 'string',
                              )
                              .map((outlet) => ({
                                outletId: outlet.outletId,
                                url: outlet.url,
                              }))
                          : [],
                      }))
                  : [],
              }
            : null;
          setShareSettings(normalizedShare);
        }
        if (authResult.status === 'rejected') throw authResult.reason;
        const payload = authResult.value as TeleauthResponse & { merchantCustomerId?: string | null };
        const resolvedCustomerId =
          typeof payload?.customerId === 'string' && payload.customerId.trim()
            ? payload.customerId
            : typeof payload?.merchantCustomerId === 'string' && payload.merchantCustomerId.trim()
              ? payload.merchantCustomerId
              : null;
        if (!resolvedCustomerId) {
          throw new Error('customerId missing in teleauth response');
        }
        setCustomerId(resolvedCustomerId);
        setTeleOnboarded(Boolean(payload.onboarded));
        setTeleHasPhone(Boolean(payload.hasPhone));
        try {
          localStorage.setItem(
            customerKey(fallbackMerchant),
            resolvedCustomerId,
          );
          localStorage.removeItem('miniapp.customerId');
          localStorage.removeItem('miniapp.merchantCustomerId');
          localStorage.removeItem(legacyCustomerKey(fallbackMerchant));
          if (previousScoped && previousScoped !== resolvedCustomerId) {
            localStorage.removeItem(profileKey(fallbackMerchant));
            localStorage.removeItem(
              `regBonus:${fallbackMerchant}:${previousScoped}`,
            );
          }
        } catch {}
        setError('');
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : String(error));
        setStatus('failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMerchant]);

  // Автоначисление бонуса за регистрацию: один раз на пару merchantId+customerId (идемпотентный бэкенд)
  useEffect(() => {
    (async () => {
      try {
        if (!merchantId || !customerId) return;
        const key = `regBonus:${merchantId}:${customerId}`;
        const attempted = localStorage.getItem(key);
        if (attempted) return;
        await grantRegistrationBonus(merchantId, customerId).catch(() => void 0);
        localStorage.setItem(key, '1');
      } catch {
        // глушим, чтобы не ломать UX миниаппы — сервер идемпотентен и может быть временно недоступен
      }
    })();
  }, [merchantId, customerId]);

  return {
    merchantId,
    setMerchantId,
    customerId,
    setCustomerId,
    teleOnboarded,
    setTeleOnboarded,
    teleHasPhone,
    setTeleHasPhone,
    loading,
    error,
    theme,
    shareSettings,
    reviewsEnabled,
    initData,
    status,
  } as const;
}
