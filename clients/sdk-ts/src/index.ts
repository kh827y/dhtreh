export type Mode = 'redeem'|'earn';

export type QuoteRequest = {
  mode: Mode;
  merchantId: string;
  userToken: string;
  orderId: string;
  total: number;
  eligibleTotal: number;
  outletId?: string;
  deviceId?: string;
  staffId?: string;
  requestId?: string;
  category?: string;
};

export type QuoteRedeemResponse = {
  canRedeem: boolean;
  discountToApply: number;
  pointsToBurn: number;
  finalPayable: number;
  holdId?: string;
  message?: string;
};

export type QuoteEarnResponse = {
  canEarn: boolean;
  pointsToEarn: number;
  holdId?: string;
  message?: string;
};

export type QuoteResponse = QuoteRedeemResponse | QuoteEarnResponse;

export type CommitRequest = {
  merchantId: string;
  holdId: string;
  orderId: string;
  receiptNumber?: string;
  requestId?: string;
};

export type CommitResponse = {
  ok: boolean;
  alreadyCommitted?: boolean;
  receiptId?: string;
  redeemApplied?: number;
  earnApplied?: number;
};

export type RefundRequest = {
  merchantId: string;
  orderId: string;
  refundTotal: number;
  refundEligibleTotal?: number;
};

export type RefundResponse = {
  ok: boolean;
  share: number;
  pointsRestored: number;
  pointsRevoked: number;
};

export type PublicSettings = { merchantId: string; qrTtlSec: number };

export class LoyaltyApi {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  constructor(opts: { baseUrl: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl || (globalThis as any).fetch;
    if (!this.fetchImpl) throw new Error('No fetch implementation available');
  }

  private rid(): string {
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }

  async quote(body: QuoteRequest, opts?: { staffKey?: string; requestId?: string }): Promise<QuoteResponse & { holdId?: string }> {
    const url = this.baseUrl + '/loyalty/quote';
    const headers: Record<string,string> = { 'Content-Type': 'application/json', 'X-Request-Id': opts?.requestId || this.rid() };
    if (opts?.staffKey) headers['X-Staff-Key'] = opts.staffKey;
    const r = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async commit(body: CommitRequest, opts?: { idempotencyKey?: string; staffKey?: string; requestId?: string }): Promise<CommitResponse> {
    const url = this.baseUrl + '/loyalty/commit';
    const headers: Record<string,string> = { 'Content-Type': 'application/json', 'X-Request-Id': opts?.requestId || this.rid() };
    if (opts?.staffKey) headers['X-Staff-Key'] = opts.staffKey;
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const r = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async refund(body: RefundRequest, opts?: { idempotencyKey?: string; staffKey?: string; requestId?: string }): Promise<RefundResponse> {
    const url = this.baseUrl + '/loyalty/refund';
    const headers: Record<string,string> = { 'Content-Type': 'application/json', 'X-Request-Id': opts?.requestId || this.rid() };
    if (opts?.staffKey) headers['X-Staff-Key'] = opts.staffKey;
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const r = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async publicSettings(merchantId: string): Promise<PublicSettings> {
    const url = this.baseUrl + '/loyalty/settings/' + encodeURIComponent(merchantId);
    const r = await this.fetchImpl(url);
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async balance(merchantId: string, customerId: string): Promise<{ merchantId: string; customerId: string; balance: number }> {
    const url = this.baseUrl + '/loyalty/balance/' + encodeURIComponent(merchantId) + '/' + encodeURIComponent(customerId);
    const r = await this.fetchImpl(url);
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async mintQr(customerId: string, ttlSec?: number, merchantId?: string): Promise<{ token: string; ttl: number }> {
    const url = this.baseUrl + '/loyalty/qr';
    const r = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId, ttlSec, merchantId }) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async transactions(params: { merchantId: string; customerId: string; limit?: number; before?: string; outletId?: string; deviceId?: string; staffId?: string }): Promise<{ items: any[]; nextBefore: string|null }> {
    const url = new URL(this.baseUrl + '/loyalty/transactions');
    url.searchParams.set('merchantId', params.merchantId);
    url.searchParams.set('customerId', params.customerId);
    if (params.limit != null) url.searchParams.set('limit', String(params.limit));
    if (params.before) url.searchParams.set('before', params.before);
    if (params.outletId) url.searchParams.set('outletId', params.outletId);
    if (params.deviceId) url.searchParams.set('deviceId', params.deviceId);
    if (params.staffId) url.searchParams.set('staffId', params.staffId);
    const r = await this.fetchImpl(url.toString());
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  async publicOutlets(merchantId: string): Promise<Array<{ id: string; name: string; address?: string }>> {
    const r = await this.fetchImpl(this.baseUrl + '/loyalty/outlets/' + encodeURIComponent(merchantId));
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async publicDevices(merchantId: string): Promise<Array<{ id: string; type: string; label?: string; outletId?: string }>> {
    const r = await this.fetchImpl(this.baseUrl + '/loyalty/devices/' + encodeURIComponent(merchantId));
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async publicStaff(merchantId: string): Promise<Array<{ id: string; login?: string; role: string }>> {
    const r = await this.fetchImpl(this.baseUrl + '/loyalty/staff/' + encodeURIComponent(merchantId));
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
}

// ===== Admin SDK (используйте через серверный прокси /api/admin или с adminKey на сервере) =====

export class AdminApi {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private adminKey?: string;
  constructor(opts: { baseUrl: string; adminKey?: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl || (globalThis as any).fetch;
    this.adminKey = opts.adminKey;
    if (!this.fetchImpl) throw new Error('No fetch implementation available');
  }
  private headers(json = true): Record<string,string> {
    const h: Record<string,string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.adminKey) h['X-Admin-Key'] = this.adminKey;
    return h;
  }

  // Settings
  async getSettings(merchantId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/settings`, { headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async updateSettings(merchantId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/settings`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  // Outbox
  async listOutbox(merchantId: string, params?: { status?: string; limit?: number; type?: string; since?: string }) {
    const url = new URL(`${this.baseUrl}/merchants/${merchantId}/outbox`);
    if (params?.status) url.searchParams.set('status', params.status);
    if (params?.type) url.searchParams.set('type', params.type);
    if (params?.since) url.searchParams.set('since', params.since);
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    const r = await this.fetchImpl(url.toString(), { headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async retryOutbox(merchantId: string, eventId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outbox/${eventId}/retry`, { method: 'POST', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async deleteOutbox(merchantId: string, eventId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outbox/${eventId}`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async retryAll(merchantId: string, status?: string) {
    const url = new URL(`${this.baseUrl}/merchants/${merchantId}/outbox/retryAll`);
    if (status) url.searchParams.set('status', status);
    const r = await this.fetchImpl(url.toString(), { method: 'POST', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  // Outlets
  async listOutlets(merchantId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outlets`, { headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async createOutlet(merchantId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outlets`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async updateOutlet(merchantId: string, outletId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outlets/${outletId}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/outlets/${outletId}`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  // Devices
  async listDevices(merchantId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices`, { headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async createDevice(merchantId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async updateDevice(merchantId: string, deviceId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices/${deviceId}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async deleteDevice(merchantId: string, deviceId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices/${deviceId}`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async issueDeviceSecret(merchantId: string, deviceId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices/${deviceId}/secret`, { method: 'POST', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async revokeDeviceSecret(merchantId: string, deviceId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/devices/${deviceId}/secret`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }

  // Staff
  async listStaff(merchantId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff`, { headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async createStaff(merchantId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async updateStaff(merchantId: string, staffId: string, body: any) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff/${staffId}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async deleteStaff(merchantId: string, staffId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff/${staffId}`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async issueStaffToken(merchantId: string, staffId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff/${staffId}/token`, { method: 'POST', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
  async revokeStaffToken(merchantId: string, staffId: string) {
    const r = await this.fetchImpl(`${this.baseUrl}/merchants/${merchantId}/staff/${staffId}/token`, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  }
}
