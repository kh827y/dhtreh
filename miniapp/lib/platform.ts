export type MiniappPlatform = 'android' | 'ios';

function normalize(value: unknown): MiniappPlatform | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('android')) return 'android';
  if (normalized.includes('ios')) return 'ios';
  return null;
}

export function detectMiniappPlatform(): MiniappPlatform | null {
  try {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tgPlatform = (window as any)?.Telegram?.WebApp?.platform;
      const fromTelegram = normalize(tgPlatform);
      if (fromTelegram) return fromTelegram;
    }
  } catch {}
  try {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android')) return 'android';
      if (
        ua.includes('iphone') ||
        ua.includes('ipad') ||
        ua.includes('ipod')
      )
        return 'ios';
    }
  } catch {}
  return null;
}
