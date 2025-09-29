"use client";
import { useEffect, useState } from 'react';
import { teleauth, publicSettings } from './api';

type TelegramUser = {
  id?: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatarUrl?: string | null;
  displayName?: string;
};

type TelegramWebApp = { initData?: string; initDataUnsafe?: { user?: unknown } };
type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function getInitData(): string | null {
  try {
    const tg = (window as TelegramWindow).Telegram?.WebApp;
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

function normalizeTelegramUser(raw: unknown): TelegramUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  const firstName = value.first_name || '';
  const lastName = value.last_name || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || value.username || '';
  return {
    id: value.id,
    firstName,
    lastName,
    username: value.username,
    avatarUrl: value.photo_url || null,
    displayName,
  };
}

export function useMiniappAuth(defaultMerchant: string) {
  const [merchantId, setMerchantId] = useState<string>(defaultMerchant);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null; ttl?: number }>({});
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('miniapp.customerId');
    if (saved) setCustomerId(saved);
    const id = getInitData();
    const ctxMerchant = getMerchantFromContext(id);
    if (ctxMerchant) setMerchantId(ctxMerchant);
    const mId = ctxMerchant || merchantId;

    let hasUser = false;
    try {
      const tg = (window as TelegramWindow).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser) {
        const normalized = normalizeTelegramUser(tgUser);
        if (normalized) {
          setUser(normalized);
          hasUser = true;
        }
      }
    } catch {}
    if (!hasUser && id) {
      try {
        const params = new URLSearchParams(id);
        const userParam = params.get('user');
        if (userParam) {
          const parsed = JSON.parse(userParam);
          const normalized = normalizeTelegramUser(parsed);
          if (normalized) {
            setUser(normalized);
            hasUser = true;
          }
        }
      } catch {}
    }

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
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMerchant]);

  return { merchantId, setMerchantId, customerId, setCustomerId, loading, error, theme, user } as const;
}

