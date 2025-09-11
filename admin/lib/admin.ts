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
  miniappThemePrimary?: string | null;
  miniappThemeBg?: string | null;
  miniappLogoUrl?: string | null;
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

// ===== Outbox monitor helpers =====
export type OutboxStats = {
  merchantId: string;
  since: string | null;
  counts: Record<string, number>;
  typeCounts?: Record<string, number>;
  lastDeadAt: string | null;
};

export type OutboxEvent = {
  id: string;
  merchantId: string;
  eventType: string;
  status: 'PENDING'|'SENDING'|'FAILED'|'DEAD'|'SENT';
  retries: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  createdAt: string;
};

export async function getOutboxStats(merchantId: string, since?: string): Promise<OutboxStats> {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/stats${q}`);
}

export async function listOutbox(merchantId: string, opts?: { status?: string; limit?: number; type?: string; since?: string }): Promise<OutboxEvent[]> {
  const p = new URLSearchParams();
  if (opts?.status) p.set('status', opts.status);
  if (opts?.limit != null) p.set('limit', String(opts.limit));
  if (opts?.type) p.set('type', opts.type);
  if (opts?.since) p.set('since', opts.since);
  const qs = p.toString();
  const suff = qs ? `?${qs}` : '';
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox${suff}`);
}

export async function retryOutboxEvent(merchantId: string, eventId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(eventId)}/retry`, { method: 'POST' });
}

export async function deleteOutboxEvent(merchantId: string, eventId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

export async function retryAllOutbox(merchantId: string, status?: string): Promise<{ ok: true; updated: number }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/retryAll${q}`, { method: 'POST' });
}

export async function retrySinceOutbox(merchantId: string, params: { status?: string; since?: string }): Promise<{ ok: true; updated: number }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outbox/retrySince`, { method: 'POST', body: JSON.stringify(params) });
}

export function outboxCsvUrl(merchantId: string, opts?: { status?: string; since?: string; type?: string; limit?: number }): string {
  const p = new URLSearchParams();
  if (opts?.status) p.set('status', opts.status);
  if (opts?.since) p.set('since', opts.since);
  if (opts?.type) p.set('type', opts.type);
  if (opts?.limit != null) p.set('limit', String(opts.limit));
  const qs = p.toString();
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/outbox.csv${qs ? `?${qs}` : ''}`;
}

export async function previewRules(merchantId: string, args: { channel: 'SMART'|'PC_POS'|'VIRTUAL'; weekday: number; eligibleTotal: number; category?: string }): Promise<{ earnBps: number; redeemLimitBps: number }> {
  const p = new URLSearchParams();
  p.set('channel', args.channel);
  p.set('weekday', String(args.weekday));
  p.set('eligibleTotal', String(args.eligibleTotal));
  if (args.category) p.set('category', args.category);
  const qs = p.toString();
  return http(`/merchants/${encodeURIComponent(merchantId)}/rules/preview?${qs}`);
}

// ===== CRM helpers =====
export type CustomerSummary = {
  balance: number;
  recentTx: Array<{ id: string; type: string; amount: number; orderId?: string; createdAt: string; outletId?: string; deviceId?: string; staffId?: string }>;
  recentReceipts: Array<{ id: string; orderId: string; customerId: string; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; createdAt: string; outletId?: string; deviceId?: string; staffId?: string }>;
};

export async function customerSearch(merchantId: string, phone: string): Promise<{ customerId: string; phone: string; balance: number } | null> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/customer/search?phone=${encodeURIComponent(phone)}`);
}

export async function customerSummary(merchantId: string, customerId: string): Promise<CustomerSummary> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/customer/summary?customerId=${encodeURIComponent(customerId)}`);
}

export function transactionsCsvUrl(merchantId: string, params: { limit?: number; before?: string; type?: string; customerId?: string; outletId?: string; deviceId?: string; staffId?: string }): string {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.type) p.set('type', params.type);
  if (params.customerId) p.set('customerId', params.customerId);
  if (params.outletId) p.set('outletId', params.outletId);
  if (params.deviceId) p.set('deviceId', params.deviceId);
  if (params.staffId) p.set('staffId', params.staffId);
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/transactions.csv?${p.toString()}`;
}

export function receiptsCsvUrl(merchantId: string, params: { limit?: number; before?: string; orderId?: string; customerId?: string }): string {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.orderId) p.set('orderId', params.orderId);
  if (params.customerId) p.set('customerId', params.customerId);
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/receipts.csv?${p.toString()}`;
}

// Paged lists for CRM
export async function listTransactionsAdmin(merchantId: string, params: { limit?: number; before?: string; type?: string; customerId?: string; outletId?: string; deviceId?: string; staffId?: string }): Promise<{ items: any[]; nextBefore: string | null }> {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.type) p.set('type', params.type);
  if (params.customerId) p.set('customerId', params.customerId);
  if (params.outletId) p.set('outletId', params.outletId);
  if (params.deviceId) p.set('deviceId', params.deviceId);
  if (params.staffId) p.set('staffId', params.staffId);
  const qs = p.toString();
  return http(`/merchants/${encodeURIComponent(merchantId)}/transactions${qs?`?${qs}`:''}`);
}

export async function listReceiptsAdmin(merchantId: string, params: { limit?: number; before?: string; orderId?: string; customerId?: string }): Promise<any[]> {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.orderId) p.set('orderId', params.orderId);
  if (params.customerId) p.set('customerId', params.customerId);
  const qs = p.toString();
  return http(`/merchants/${encodeURIComponent(merchantId)}/receipts${qs?`?${qs}`:''}`);
}
