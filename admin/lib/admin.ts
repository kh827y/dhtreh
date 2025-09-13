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

// ===== Telegram bot management =====
export async function registerTelegramBot(merchantId: string, botToken: string): Promise<{ ok: true; username: string; webhookUrl: string }>
{
  return http(`/merchants/${encodeURIComponent(merchantId)}/telegram/register`, { method: 'POST', body: JSON.stringify({ botToken }) });
}

export async function rotateTelegramWebhook(merchantId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/telegram/rotate-webhook`, { method: 'POST' });
}

export async function deactivateTelegramBot(merchantId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/telegram`, { method: 'DELETE' });
}

// ===== Subscription (via API key through admin proxy) =====
const API_KEY_HEADER = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_KEY || '') : '') || 'test-key';

export async function getPlans(): Promise<any[]> {
  const res = await fetch(`/api/admin/subscription/plans`, { headers: { 'x-api-key': API_KEY_HEADER } });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function createSubscription(merchantId: string, planId: string, trialDays = 14): Promise<any> {
  const res = await fetch(`/api/admin/subscription/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY_HEADER },
    body: JSON.stringify({ merchantId, planId, trialDays })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function getSubscription(merchantId: string): Promise<any> {
  const res = await fetch(`/api/admin/subscription/${encodeURIComponent(merchantId)}`, { headers: { 'x-api-key': API_KEY_HEADER } });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

// ===== Payments for subscription =====
export async function createSubscriptionPayment(merchantId: string, subscriptionId: string): Promise<{ paymentId: string; confirmationUrl?: string; status: string; amount: number; currency: string }> {
  const res = await fetch(`/api/admin/payment/subscription/${encodeURIComponent(merchantId)}/${encodeURIComponent(subscriptionId)}`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY_HEADER },
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function getPaymentStatus(paymentId: string): Promise<any> {
  const res = await fetch(`/api/admin/payment/status/${encodeURIComponent(paymentId)}`, { headers: { 'x-api-key': API_KEY_HEADER } });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
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

export function transactionsCsvUrl(merchantId: string, params: { limit?: number; before?: string; from?: string; to?: string; type?: string; customerId?: string; outletId?: string; deviceId?: string; staffId?: string }): string {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
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
export async function listTransactionsAdmin(merchantId: string, params: { limit?: number; before?: string; from?: string; to?: string; type?: string; customerId?: string; outletId?: string; deviceId?: string; staffId?: string }): Promise<{ items: any[]; nextBefore: string | null }> {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.type) p.set('type', params.type);
  if (params.customerId) p.set('customerId', params.customerId);
  if (params.outletId) p.set('outletId', params.outletId);
  if (params.deviceId) p.set('deviceId', params.deviceId);
  if (params.staffId) p.set('staffId', params.staffId);
  const qs = p.toString();
  const res: any = await http(`/merchants/${encodeURIComponent(merchantId)}/transactions${qs?`?${qs}`:''}`);
  const items: any[] = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
  const nextBefore: string | null = (res && res.nextBefore) ? res.nextBefore : (items.length ? String(items[items.length - 1]?.createdAt || '') : null);
  return { items, nextBefore: nextBefore || null };
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

// ===== Staff management =====
export type Staff = {
  id: string;
  merchantId: string;
  login?: string | null;
  email?: string | null;
  role: 'CASHIER' | 'MANAGER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  apiKeyHash?: string | null;
  allowedOutletId?: string | null;
  allowedDeviceId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export async function getStaff(merchantId: string): Promise<Staff[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff`);
}

export async function createStaff(merchantId: string, dto: { login?: string; email?: string; role?: string }): Promise<Staff> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateStaff(merchantId: string, staffId: string, dto: Partial<Staff>): Promise<Staff> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function deleteStaff(merchantId: string, staffId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' });
}

export async function issueStaffToken(merchantId: string, staffId: string): Promise<{ token: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}/token`, { method: 'POST' });
}

export async function revokeStaffToken(merchantId: string, staffId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/staff/${encodeURIComponent(staffId)}/token`, { method: 'DELETE' });
}

// ===== Device management =====
export type Device = {
  id: string;
  merchantId: string;
  type: 'VIRTUAL' | 'PC_POS' | 'SMART';
  label?: string | null;
  outletId?: string | null;
  bridgeSecret?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export async function getDevices(merchantId: string): Promise<Device[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices`);
}

export async function createDevice(merchantId: string, dto: { type: string; label?: string; outletId?: string }): Promise<Device> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateDevice(merchantId: string, deviceId: string, dto: { label?: string; outletId?: string }): Promise<Device> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function deleteDevice(merchantId: string, deviceId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

export async function issueDeviceSecret(merchantId: string, deviceId: string): Promise<{ secret: string }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}/secret`, { method: 'POST' });
}

export async function revokeDeviceSecret(merchantId: string, deviceId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/devices/${encodeURIComponent(deviceId)}/secret`, { method: 'DELETE' });
}

// ===== Outlet management =====
export type Outlet = {
  id: string;
  merchantId: string;
  name: string;
  address?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export async function getOutlets(merchantId: string): Promise<Outlet[]> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`);
}

export async function createOutlet(merchantId: string, dto: { name: string; address?: string }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateOutlet(merchantId: string, outletId: string, dto: { name?: string; address?: string }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function deleteOutlet(merchantId: string, outletId: string): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}`, { method: 'DELETE' });
}
