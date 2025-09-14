export type LoyaltyApiOptions = { baseUrl: string; fetch?: typeof fetch };
// For Node HMAC in signBridgeSignature without requiring @types/node
declare const require: any;

export class LoyaltyApi {
  private base: string;
  private fx: typeof fetch;
  constructor(opts: LoyaltyApiOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fx = opts.fetch || fetch;
  }

  private async http<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fx(this.base + path, { headers: { 'Content-Type': 'application/json', ...(init?.headers||{}) }, ...init });
    if (!res.ok) throw new Error(await res.text());
    return await res.json() as T;
  }

  // Utilities
  static signBridgeSignature(secret: string, body: string, ts?: number): string {
    const t = Math.floor((ts ?? Date.now()) / 1000).toString();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h = require('crypto').createHmac('sha256', secret).update(t + '.' + body).digest('base64');
    return `v1,ts=${t},sig=${h}`;
  }

  // Endpoints
  quote(body: { mode: 'redeem'|'earn'; merchantId: string; userToken: string; orderId: string; total: number; eligibleTotal: number; outletId?: string; deviceId?: string; staffId?: string; category?: string; voucherCode?: string }, opts?: { staffKey?: string; bridgeSignatureSecret?: string }) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.staffKey) headers['X-Staff-Key'] = opts.staffKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/quote', { method: 'POST', headers, body: json });
  }

  commit(body: { merchantId: string; holdId: string; orderId: string; receiptNumber?: string; requestId?: string; voucherCode?: string }, opts?: { idempotencyKey?: string; bridgeSignatureSecret?: string }) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/commit', { method: 'POST', headers, body: json });
  }

  refund(body: { merchantId: string; orderId: string; refundTotal: number; refundEligibleTotal?: number }, opts?: { idempotencyKey?: string; bridgeSignatureSecret?: string }) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/refund', { method: 'POST', headers, body: json });
  }

  balance(merchantId: string, customerId: string) {
    return this.http(`/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
  }

  transactions(params: { merchantId: string; customerId: string; limit?: number; before?: string; outletId?: string; deviceId?: string; staffId?: string }) {
    const q = new URLSearchParams({ merchantId: params.merchantId, customerId: params.customerId });
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    if (params.outletId) q.set('outletId', params.outletId);
    if (params.deviceId) q.set('deviceId', params.deviceId);
    if (params.staffId) q.set('staffId', params.staffId);
    return this.http(`/loyalty/transactions?${q.toString()}`);
  }

  teleauth(merchantId: string, initData: string) {
    return this.http('/loyalty/teleauth', { method: 'POST', body: JSON.stringify({ merchantId, initData }) });
  }

  mintQr(customerId: string, merchantId?: string, ttlSec?: number, initData?: string) {
    return this.http('/loyalty/qr', { method: 'POST', body: JSON.stringify({ customerId, merchantId, ttlSec, initData }) });
  }

  publicSettings(merchantId: string) {
    return this.http(`/loyalty/settings/${encodeURIComponent(merchantId)}`);
  }

  // Vouchers API
  vouchers = {
    preview: (args: { merchantId: string; code: string; eligibleTotal: number; customerId?: string }) =>
      this.http('/vouchers/preview', { method: 'POST', body: JSON.stringify(args) }),
    issue: (args: { merchantId: string; name?: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; code: string; validFrom?: string; validUntil?: string; minPurchaseAmount?: number }) =>
      this.http('/vouchers/issue', { method: 'POST', body: JSON.stringify(args) }),
    redeem: (args: { merchantId: string; code: string; customerId: string; eligibleTotal: number; orderId?: string }) =>
      this.http('/vouchers/redeem', { method: 'POST', body: JSON.stringify(args) }),
    status: (args: { merchantId: string; code?: string; voucherId?: string }) =>
      this.http('/vouchers/status', { method: 'POST', body: JSON.stringify(args) }),
    deactivate: (args: { merchantId: string; code?: string; voucherId?: string }) =>
      this.http('/vouchers/deactivate', { method: 'POST', body: JSON.stringify(args) }),
  } as const;
}

