export type LoyaltyApiOptions = { baseUrl: string; fetch?: typeof fetch };
export type TeleauthResponse = {
  ok: boolean;
  customerId: string;
  merchantCustomerId?: string;
  hasPhone: boolean;
  onboarded: boolean;
};
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
  quote(body: { mode: 'redeem'|'earn'; merchantId: string; userToken: string; orderId: string; total: number; outletId?: string; staffId?: string; category?: string; promoCode?: string; positions?: Array<{ productId?: string; externalProvider?: string; externalId?: string; categoryId?: string; categoryExternalId?: string; name?: string; sku?: string; barcode?: string; qty: number; price: number; accruePoints?: boolean }> }, opts?: { staffKey?: string; bridgeSignatureSecret?: string }) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.staffKey) headers['X-Staff-Key'] = opts.staffKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/quote', { method: 'POST', headers, body: json });
  }

  commit(body: { merchantId: string; holdId: string; orderId: string; receiptNumber?: string; requestId?: string; promoCode?: string }, opts?: { idempotencyKey?: string; bridgeSignatureSecret?: string }) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/commit', { method: 'POST', headers, body: json });
  }

  refund(
    body: {
      merchantId: string;
      invoice_num?: string;
      order_id?: string;
      deviceId?: string;
      outletId?: string;
      operationDate?: string;
    },
    opts?: { idempotencyKey?: string; bridgeSignatureSecret?: string },
  ) {
    const json = JSON.stringify(body);
    const headers: any = {};
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts?.bridgeSignatureSecret) headers['X-Bridge-Signature'] = LoyaltyApi.signBridgeSignature(opts.bridgeSignatureSecret, json);
    return this.http('/loyalty/refund', { method: 'POST', headers, body: json });
  }

  balance(merchantId: string, customerId: string) {
    return this.http(`/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
  }

  transactions(params: { merchantId: string; customerId: string; limit?: number; before?: string; outletId?: string; staffId?: string }) {
    const q = new URLSearchParams({ merchantId: params.merchantId, customerId: params.customerId });
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    if (params.outletId) q.set('outletId', params.outletId);
    if (params.staffId) q.set('staffId', params.staffId);
    return this.http(`/loyalty/transactions?${q.toString()}`);
  }

  teleauth(merchantId: string, initData: string) {
    return this.http<TeleauthResponse>('/loyalty/teleauth', { method: 'POST', body: JSON.stringify({ merchantId, initData }) }).then((res) => ({
      ...res,
      merchantCustomerId: res.merchantCustomerId ?? res.customerId,
    }));
  }

  mintQr(customerId: string, merchantId?: string, ttlSec?: number, initData?: string) {
    return this.http('/loyalty/qr', { method: 'POST', body: JSON.stringify({ customerId, merchantId, ttlSec, initData }) });
  }

  publicSettings(merchantId: string) {
    return this.http(`/loyalty/settings/${encodeURIComponent(merchantId)}`);
  }

  // Referrals API (beta)
  referrals = {
    program: (args: { merchantId: string; name: string; description?: string; referrerReward: number; refereeReward: number; minPurchaseAmount?: number; maxReferrals?: number; expiryDays?: number; status?: 'ACTIVE'|'PAUSED'|'COMPLETED'; rewardTrigger?: 'first'|'all'; rewardType?: 'FIXED'|'PERCENT'; multiLevel?: boolean; levelRewards?: Array<{ level: number; enabled?: boolean; reward?: number }>; stackWithRegistration?: boolean; messageTemplate?: string; placeholders?: string[] }, opts?: { apiKey?: string }) => {
      const headers: any = {};
      if (opts?.apiKey) headers['X-API-Key'] = opts.apiKey;
      return this.http('/referral/program', { method: 'POST', headers, body: JSON.stringify(args) });
    },
    activate: (args: { code: string; refereeId: string }, opts?: { apiKey?: string }) => {
      const headers: any = {};
      if (opts?.apiKey) headers['X-API-Key'] = opts.apiKey;
      return this.http('/referral/activate', { method: 'POST', headers, body: JSON.stringify(args) });
    },
    complete: (args: { refereeId: string; merchantId: string; purchaseAmount: number }, opts?: { apiKey?: string }) => {
      const headers: any = {};
      if (opts?.apiKey) headers['X-API-Key'] = opts.apiKey;
      return this.http('/referral/complete', { method: 'POST', headers, body: JSON.stringify(args) });
    },
  } as const;
}
