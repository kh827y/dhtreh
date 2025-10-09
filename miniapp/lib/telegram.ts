export type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick?: (cb: () => void) => void;
  offClick?: (cb: () => void) => void;
};

export type TelegramWebApp = {
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string; photo_url?: string } };
  ready?: () => void;
  expand?: () => void;
  requestPhoneNumber?: () => Promise<unknown>;
  openTelegramLink?: (url: string) => void;
  BackButton?: TelegramBackButton;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
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
