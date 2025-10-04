export type TelegramWebApp = {
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string; photo_url?: string } };
  ready?: () => void;
  expand?: () => void;
  requestPhoneNumber?: () => Promise<unknown>;
  openTelegramLink?: (url: string) => void;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  try {
    return (window as TelegramWindow).Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}
