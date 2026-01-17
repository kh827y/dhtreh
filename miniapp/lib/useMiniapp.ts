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
import { getTelegramUserId, getTelegramWebApp } from './telegram';
import { emitLoyaltyEvent } from './loyaltyEvents';

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

export function getTelegramUserIdFromInitData(initData: string | null): string | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const rawUser = params.get('user');
    if (!rawUser) return null;
    const parsed = JSON.parse(rawUser);
    const id = parsed?.id;
    if (id == null) return null;
    return String(id);
  } catch {
    return null;
  }
}

export function getMerchantFromContext(_initData: string | null): string | undefined {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = q.get('merchantId') || q.get('merchant') || undefined;
    if (fromQuery) return fromQuery;
  } catch {}
  return undefined;
}

export function useMiniappAuth(defaultMerchant: string) {
  const [merchantId, setMerchantId] = useState<string>(defaultMerchant);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<string | null>(() => getTelegramUserId());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null; ttl?: number }>({});
  const [supportTelegram, setSupportTelegram] = useState<string | null>(null);
  const [shareSettings, setShareSettings] = useState<ReviewsShareSettings>(null);
  const [reviewsEnabled, setReviewsEnabled] = useState<boolean | null>(null);
  const [referralEnabled, setReferralEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [teleOnboarded, setTeleOnboarded] = useState<boolean | null>(null);
  const [teleHasPhone, setTeleHasPhone] = useState<boolean | null>(null);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const updateViewport = () => {
      const tgAny = tg as { viewportStableHeight?: number; viewportHeight?: number } | null;
      const height =
        typeof tgAny?.viewportStableHeight === 'number'
          ? tgAny.viewportStableHeight
          : typeof tgAny?.viewportHeight === 'number'
            ? tgAny.viewportHeight
            : typeof window !== 'undefined'
              ? window.visualViewport?.height ?? window.innerHeight
              : 0;
      if (!height) return;
      document.documentElement.style.setProperty(
        '--tg-viewport-height',
        `${Math.round(height)}px`,
      );
    };
    updateViewport();
    const onResize = () => updateViewport();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    tg?.onEvent?.('viewportChanged', onResize);
    const timer = setTimeout(updateViewport, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      tg?.offEvent?.('viewportChanged', onResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tg = getTelegramWebApp();
      if (tg) {
        try {
          tg.ready?.();
        } catch {}
        const expand = () => {
          try {
            tg.expand?.();
          } catch {}
        };
        expand();
        setTimeout(expand, 200);
      }
      setStatus('authenticating');
      setLoading(true);
      setError('');
      setTeleOnboarded(null);
      setTeleHasPhone(null);
      setCustomerId(null);
      setReferralEnabled(null);
      const resolvedInitData = await waitForInitData();
      if (cancelled) return;
      setInitData(resolvedInitData);
      const initDataUserId = getTelegramUserIdFromInitData(resolvedInitData);
      const resolvedTelegramUserId = initDataUserId || telegramUserId || getTelegramUserId();
      if (resolvedTelegramUserId && resolvedTelegramUserId !== telegramUserId) {
        setTelegramUserId(resolvedTelegramUserId);
      }
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
      const customerKey = (m: string, tgId: string | null) =>
        tgId ? `miniapp.customerId.v2:${m}:${tgId}` : null;
      const profileKey = (m: string, tgId: string | null) =>
        tgId ? `miniapp.profile.v3:${m}:${tgId}` : null;
      let previousScoped: string | null = null;
      try {
        if (resolvedTelegramUserId) {
          const key = customerKey(fallbackMerchant, resolvedTelegramUserId);
          if (key) {
            const stored = localStorage.getItem(key);
            previousScoped =
              stored && stored !== 'undefined' && stored.trim() ? stored : null;
          }
        }
      } catch {
        previousScoped = null;
      }
      try {
        const [settingsResult, authResult] = await Promise.allSettled([
          publicSettings(fallbackMerchant),
          teleauth(fallbackMerchant, resolvedInitData, { create: false }),
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
          setSupportTelegram(
            typeof s.supportTelegram === 'string' && s.supportTelegram.trim()
              ? s.supportTelegram.trim()
              : null,
          );
          if (typeof s.reviewsEnabled === 'boolean') {
            setReviewsEnabled(s.reviewsEnabled);
          } else {
            setReviewsEnabled(null);
          }
          if (typeof s.referralEnabled === 'boolean') {
            setReferralEnabled(s.referralEnabled);
          } else {
            setReferralEnabled(null);
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
          if (resolvedTelegramUserId) {
            const key = customerKey(fallbackMerchant, resolvedTelegramUserId);
            const profileKeyValue = profileKey(fallbackMerchant, resolvedTelegramUserId);
            if (key) {
              try {
                localStorage.removeItem(key);
                if (profileKeyValue) localStorage.removeItem(profileKeyValue);
              } catch {}
            }
          }
          setCustomerId(null);
          setTeleOnboarded(false);
          setTeleHasPhone(false);
          setError('');
          setStatus('authenticated');
          setLoading(false);
          return;
        }
        setCustomerId(resolvedCustomerId);
        setTeleOnboarded(Boolean(payload.onboarded));
        setTeleHasPhone(Boolean(payload.hasPhone));
        try {
          if (resolvedTelegramUserId) {
            const key = customerKey(fallbackMerchant, resolvedTelegramUserId);
            if (key) {
              localStorage.setItem(key, resolvedCustomerId);
            }
          }
          if (previousScoped && previousScoped !== resolvedCustomerId) {
            const profileKeyValue = profileKey(fallbackMerchant, resolvedTelegramUserId ?? null);
            if (profileKeyValue) localStorage.removeItem(profileKeyValue);
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
        if (!teleOnboarded) return;
        const key = `regBonus:${merchantId}:${customerId}`;
        const attempted = localStorage.getItem(key);
        if (attempted) return;
        const resp = await grantRegistrationBonus(merchantId, customerId).catch(() => null);
        if (resp?.ok) {
          emitLoyaltyEvent({
            eventType: 'loyalty.transaction',
            transactionType: 'earn',
            merchantId,
            customerId,
            amount: resp.pointsIssued,
            emittedAt: new Date().toISOString(),
          });
        }
        localStorage.setItem(key, '1');
      } catch {
        // глушим, чтобы не ломать UX миниаппы — сервер идемпотентен и может быть временно недоступен
      }
    })();
  }, [merchantId, customerId, teleOnboarded]);

  return {
    merchantId,
    setMerchantId,
    customerId,
    setCustomerId,
    teleOnboarded,
    setTeleOnboarded,
    teleHasPhone,
    setTeleHasPhone,
    telegramUserId,
    loading,
    error,
    theme,
    supportTelegram,
    shareSettings,
    reviewsEnabled,
    referralEnabled,
    initData,
    status,
  } as const;
}
