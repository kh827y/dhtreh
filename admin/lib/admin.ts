const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const mergedHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers as any || {}),
  };
  if (method !== 'GET' && method !== 'HEAD' && !('x-admin-action' in mergedHeaders)) {
    (mergedHeaders as Record<string, string>)['x-admin-action'] = 'ui';
  }
  const res = await fetch(BASE + path, { ...(init || {}), headers: mergedHeaders });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type MerchantSettings = {
  merchantId: string;
  earnBps: number;
  redeemLimitBps: number;
  qrTtlSec: number;
  redeemCooldownSec: number;
  earnCooldownSec: number;
  redeemDailyCap?: number | null;
  earnDailyCap?: number | null;
  maxOutlets?: number | null;
  requireJwtForQuote: boolean;
  rulesJson?: any;
  pointsTtlDays?: number | null;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
  telegramStartParamRequired?: boolean;
  miniappBaseUrl?: string | null;
  miniappThemePrimary?: string | null;
  miniappThemeBg?: string | null;
  miniappLogoUrl?: string | null;
  timezone?: string | null;
  // интеграции/вебхуки (частично серверные поля)
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  webhookKeyId?: string | null;
  webhookSecretNext?: string | null;
  webhookKeyIdNext?: string | null;
  useWebhookNext?: boolean;
  outboxPausedUntil?: string | null;
};

export async function getSettings(merchantId: string): Promise<MerchantSettings> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`);
}

export async function updateSettings(
  merchantId: string,
  dto: Partial<MerchantSettings>,
): Promise<MerchantSettings> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/settings`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function resetAntifraudLimit(
  merchantId: string,
  payload: { scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet'; targetId?: string },
): Promise<{ ok: true }> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/antifraud/reset`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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

export async function previewRules(merchantId: string, args: { channel: 'SMART'|'PC_POS'|'VIRTUAL'; weekday: number; category?: string }): Promise<{ earnBps: number; redeemLimitBps: number }> {
  const p = new URLSearchParams();
  p.set('channel', args.channel);
  p.set('weekday', String(args.weekday));
  if (args.category) p.set('category', args.category);
  const qs = p.toString();
  return http(`/merchants/${encodeURIComponent(merchantId)}/rules/preview?${qs}`);
}

// ===== CRM helpers =====
export async function customerSearch(merchantId: string, phone: string): Promise<{ customerId: string; phone: string; balance: number } | null> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/customer/search?phone=${encodeURIComponent(phone)}`);
}

export function transactionsCsvUrl(merchantId: string, params: { limit?: number; before?: string; from?: string; to?: string; type?: string; customerId?: string; outletId?: string; staffId?: string }): string {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('batch', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.type) p.set('type', params.type);
  if (params.customerId) p.set('customerId', params.customerId);
  if (params.outletId) p.set('outletId', params.outletId);
  if (params.staffId) p.set('staffId', params.staffId);
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/transactions.csv?${p.toString()}`;
}

export function receiptsCsvUrl(merchantId: string, params: { limit?: number; before?: string; orderId?: string; customerId?: string }): string {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('batch', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.orderId) p.set('orderId', params.orderId);
  if (params.customerId) p.set('customerId', params.customerId);
  return `/api/admin/merchants/${encodeURIComponent(merchantId)}/receipts.csv?${p.toString()}`;
}

// Paged lists for CRM
export async function listTransactionsAdmin(merchantId: string, params: { limit?: number; before?: string; from?: string; to?: string; type?: string; customerId?: string; outletId?: string; staffId?: string }): Promise<{ items: any[]; nextBefore: string | null }> {
  const p = new URLSearchParams();
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.before) p.set('before', params.before);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.type) p.set('type', params.type);
  if (params.customerId) p.set('customerId', params.customerId);
  if (params.outletId) p.set('outletId', params.outletId);
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
  role: 'CASHIER' | 'MERCHANT' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  apiKeyHash?: string | null;
  allowedOutletId?: string | null;
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

// ===== Outlet management =====
export type Outlet = {
  id: string;
  merchantId: string;
  name: string;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | string;
  hidden: boolean;
  posType?: 'VIRTUAL' | 'PC_POS' | 'SMART' | null;
  posLastSeenAt?: string | null;
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

export async function updateOutletPos(merchantId: string, outletId: string, dto: { posType?: string | null; posLastSeenAt?: string | null }): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/pos`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function updateOutletStatus(merchantId: string, outletId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Outlet> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

// ===== Analytics helpers =====
export async function getRetentionCohorts(merchantId: string, by: 'month'|'week' = 'month', limit = 6): Promise<Array<{ cohort: string; from: string; to: string; size: number; retention: number[] }>> {
  const p = new URLSearchParams();
  if (by) p.set('by', by);
  if (limit != null) p.set('limit', String(limit));
  return http(`/analytics/cohorts/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getRfmHeatmap(merchantId: string): Promise<{ grid: number[][]; totals: { count: number } }> {
  return http(`/analytics/rfm/${encodeURIComponent(merchantId)}/heatmap`);
}

// ===== CRM extras =====
export function segmentCustomersCsvUrl(merchantId: string, segmentId: string): string {
  return `/api/admin/crm/${encodeURIComponent(merchantId)}/segments/${encodeURIComponent(segmentId)}/customers.csv`;
}

export async function getCustomerTimeline(merchantId: string, customerId: string, limit = 50): Promise<{ items: Array<{ type: string; at: string; data: any }> }> {
  const p = new URLSearchParams();
  if (limit != null) p.set('limit', String(limit));
  const qs = p.toString();
  const res = await fetch(`/api/admin/crm/${encodeURIComponent(merchantId)}/customer/${encodeURIComponent(customerId)}/timeline${qs?`?${qs}`:''}`);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

// ===== Segments helpers =====
export type SegmentInfo = { id: string; name: string; type?: string; size?: number; createdAt?: string };

export async function getSegmentsAdmin(merchantId: string): Promise<SegmentInfo[]> {
  return http(`/segments/merchant/${encodeURIComponent(merchantId)}`);
}

export async function createDefaultSegments(merchantId: string): Promise<{ ok: true } | any> {
  return http(`/segments/merchant/${encodeURIComponent(merchantId)}/defaults`, { method: 'POST' });
}

export async function recalcSegment(segmentId: string): Promise<{ ok: true } | any> {
  return http(`/segments/${encodeURIComponent(segmentId)}/recalculate`, { method: 'POST' });
}

// ===== More Analytics helpers =====
export async function getRevenueMetrics(merchantId: string, qp?: { period?: string; from?: string; to?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  return http(`/analytics/revenue/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getCustomerMetrics(merchantId: string, qp?: { period?: string; from?: string; to?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  return http(`/analytics/customers/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getLoyaltyMetrics(merchantId: string, qp?: { period?: string; from?: string; to?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  return http(`/analytics/loyalty/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getOperationalMetrics(merchantId: string, qp?: { period?: string; from?: string; to?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  return http(`/analytics/operations/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getCustomerPortraitAnalytics(
  merchantId: string,
  qp?: { period?: string; from?: string; to?: string; segmentId?: string },
) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  if (qp?.segmentId) p.set('segmentId', qp.segmentId);
  return http(`/analytics/portrait/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getRepeatPurchasesAnalytics(merchantId: string, qp?: { period?: string; from?: string; to?: string; outletId?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  if (qp?.outletId) p.set('outletId', qp.outletId);
  return http(`/analytics/repeat/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getBirthdaysAnalytics(merchantId: string, withinDays = 30, limit = 100) {
  const p = new URLSearchParams();
  if (withinDays) p.set('withinDays', String(withinDays));
  if (limit) p.set('limit', String(limit));
  return http(`/analytics/birthdays/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getReferralSummaryAnalytics(merchantId: string, qp?: { period?: string; from?: string; to?: string }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  return http(`/analytics/referral/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

export async function getBusinessMetricsAnalytics(merchantId: string, qp?: { period?: string; from?: string; to?: string; minPurchases?: number }) {
  const p = new URLSearchParams();
  if (qp?.period) p.set('period', qp.period);
  if (qp?.from) p.set('from', qp.from);
  if (qp?.to) p.set('to', qp.to);
  if (qp?.minPurchases != null) p.set('minPurchases', String(qp.minPurchases));
  return http(`/analytics/business/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

// ===== Referral program helpers =====
export type ReferralProgramDto = {
  merchantId: string;
  name: string;
  description?: string;
  referrerReward: number;
  refereeReward: number;
  minPurchaseAmount?: number;
  maxReferrals?: number;
  expiryDays?: number;
  status?: 'ACTIVE'|'PAUSED'|'COMPLETED';
  rewardTrigger?: 'first'|'all';
  rewardType?: 'FIXED'|'PERCENT';
  multiLevel?: boolean;
  levelRewards?: Array<{ level: number; enabled?: boolean; reward?: number }>;
  stackWithRegistration?: boolean;
  messageTemplate?: string;
  placeholders?: string[];
};

export async function getActiveReferralProgram(merchantId: string) {
  return http(`/referral/program/${encodeURIComponent(merchantId)}`);
}

export async function createReferralProgram(dto: ReferralProgramDto) {
  return http(`/referral/program`, { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateReferralProgram(programId: string, dto: Partial<ReferralProgramDto>) {
  return http(`/referral/program/${encodeURIComponent(programId)}`, { method: 'PUT', body: JSON.stringify(dto) });
}

export async function getReferralLeaderboard(merchantId: string, limit = 10) {
  const p = new URLSearchParams();
  if (limit) p.set('limit', String(limit));
  return http(`/referral/leaderboard/${encodeURIComponent(merchantId)}${p.toString()?`?${p.toString()}`:''}`);
}

// ===== Наблюдаемость и алерты =====
export type ObservabilitySummary = {
  ok: true;
  version: string;
  env: { nodeEnv: string; appVersion: string };
  metrics: {
    outboxPending: number;
    outboxDead: number;
    http5xx: number;
    http4xx: number;
    circuitOpen: number;
    rateLimited: number;
    counters: Record<string, number>;
    outboxEvents: Record<string, number>;
    posWebhooks?: Record<string, number>;
  };
  workers: Array<{
    name: string;
    expected: boolean;
    reason?: string;
    alive: boolean;
    stale: boolean;
    intervalMs: number;
    lastTickAt: string | null;
    startedAt: string | null;
  }>;
  alerts: { enabled: boolean; chatId: string | null; sampleRate: number };
  incidents?: Array<{
    id: string;
    at: string;
    severity: string;
    title: string;
    message: string;
    delivered: boolean;
    throttled: boolean;
    error?: string;
  }>;
  telemetry?: { prometheus: boolean; grafana: boolean; sentry: boolean; otel: boolean };
};

export async function getObservabilitySummary(): Promise<ObservabilitySummary> {
  return http('/observability/summary');
}

export async function sendAlertTest(text?: string): Promise<{ ok: true }> {
  return http('/alerts/test', { method: 'POST', body: JSON.stringify({ text }) });
}
