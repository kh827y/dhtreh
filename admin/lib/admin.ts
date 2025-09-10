const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type MerchantSettings = {
  merchantId: string;
  earnBps: number;
  redeemLimitBps: number;
  qrTtlSec: number;
  requireBridgeSig: boolean;
  redeemCooldownSec: number;
  earnCooldownSec: number;
  redeemDailyCap?: number | null;
  earnDailyCap?: number | null;
  requireJwtForQuote: boolean;
  rulesJson?: any;
  requireStaffKey: boolean;
  pointsTtlDays?: number | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
  telegramStartParamRequired?: boolean;
  miniappBaseUrl?: string | null;
  // интеграции/вебхуки/bridge (частично серверные поля)
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  webhookKeyId?: string | null;
  webhookSecretNext?: string | null;
  webhookKeyIdNext?: string | null;
  useWebhookNext?: boolean;
  bridgeSecret?: string | null;
  bridgeSecretNext?: string | null;
  outboxPausedUntil?: string | null;
};

export async function getSettings(merchantId: string): Promise<MerchantSettings> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`);
}

export async function updateSettings(merchantId: string, dto: Partial<MerchantSettings> & { earnBps: number; redeemLimitBps: number }): Promise<MerchantSettings> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`, { method: 'PUT', body: JSON.stringify(dto) });
}
