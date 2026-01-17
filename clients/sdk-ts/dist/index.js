"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoyaltyApi = void 0;
class LoyaltyApi {
    constructor(opts) {
        // Referrals API (beta)
        this.referrals = {
            program: (args, opts) => {
                const headers = {};
                if (opts?.apiKey)
                    headers['X-API-Key'] = opts.apiKey;
                return this.http('/referral/program', { method: 'POST', headers, body: JSON.stringify(args) });
            },
            activate: (args, opts) => {
                const headers = {};
                if (opts?.apiKey)
                    headers['X-API-Key'] = opts.apiKey;
                return this.http('/referral/activate', { method: 'POST', headers, body: JSON.stringify(args) });
            },
            complete: (args, opts) => {
                const headers = {};
                if (opts?.apiKey)
                    headers['X-API-Key'] = opts.apiKey;
                return this.http('/referral/complete', { method: 'POST', headers, body: JSON.stringify(args) });
            },
        };
        this.base = opts.baseUrl.replace(/\/$/, '');
        this.fx = opts.fetch || fetch;
    }
    async http(path, init) {
        const res = await this.fx(this.base + path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
        if (!res.ok)
            throw new Error(await res.text());
        return await res.json();
    }
    // Endpoints
    quote(body) {
        const json = JSON.stringify(body);
        return this.http('/loyalty/quote', { method: 'POST', body: json });
    }
    commit(body, opts) {
        const json = JSON.stringify(body);
        const headers = {};
        if (opts?.idempotencyKey)
            headers['Idempotency-Key'] = opts.idempotencyKey;
        return this.http('/loyalty/commit', { method: 'POST', headers, body: json });
    }
    refund(body, opts) {
        const json = JSON.stringify(body);
        const headers = {};
        if (opts?.idempotencyKey)
            headers['Idempotency-Key'] = opts.idempotencyKey;
        return this.http('/loyalty/refund', { method: 'POST', headers, body: json });
    }
    balance(merchantId, customerId) {
        return this.http(`/loyalty/balance/${encodeURIComponent(merchantId)}/${encodeURIComponent(customerId)}`);
    }
    transactions(params) {
        const q = new URLSearchParams({ merchantId: params.merchantId, customerId: params.customerId });
        if (params.limit)
            q.set('limit', String(params.limit));
        if (params.before)
            q.set('before', params.before);
        if (params.outletId)
            q.set('outletId', params.outletId);
        if (params.staffId)
            q.set('staffId', params.staffId);
        return this.http(`/loyalty/transactions?${q.toString()}`);
    }
    teleauth(merchantId, initData, opts) {
        const payload = { merchantId, initData };
        if (opts && typeof opts.create === 'boolean')
            payload.create = opts.create;
        return this.http('/loyalty/teleauth', { method: 'POST', body: JSON.stringify(payload) }).then((res) => ({
            ...res,
            merchantCustomerId: res.merchantCustomerId ?? res.customerId ?? null,
        }));
    }
    mintQr(customerId, merchantId, ttlSec, initData) {
        return this.http('/loyalty/qr', { method: 'POST', body: JSON.stringify({ customerId, merchantId, ttlSec, initData }) });
    }
    publicSettings(merchantId) {
        return this.http(`/loyalty/settings/${encodeURIComponent(merchantId)}`);
    }
}
exports.LoyaltyApi = LoyaltyApi;
