export type LoyaltyApiOptions = {
    baseUrl: string;
    fetch?: typeof fetch;
};
export type TeleauthResponse = {
    ok: boolean;
    customerId: string | null;
    merchantCustomerId?: string | null;
    hasPhone: boolean;
    onboarded: boolean;
    registered?: boolean;
};
export declare class LoyaltyApi {
    private base;
    private fx;
    constructor(opts: LoyaltyApiOptions);
    private http;
    quote(body: {
        mode: 'redeem' | 'earn';
        merchantId: string;
        userToken: string;
        orderId: string;
        total: number;
        outletId?: string;
        staffId?: string;
        category?: string;
        promoCode?: string;
        positions?: Array<{
            productId?: string;
            externalId?: string;
            name?: string;
            qty: number;
            price: number;
            accruePoints?: boolean;
        }>;
    }): Promise<unknown>;
    commit(body: {
        merchantId: string;
        holdId: string;
        orderId: string;
        receiptNumber?: string;
        requestId?: string;
        promoCode?: string;
    }, opts?: {
        idempotencyKey?: string;
    }): Promise<unknown>;
    refund(body: {
        merchantId: string;
        invoice_num?: string;
        order_id?: string;
        deviceId?: string;
        outletId?: string;
        operationDate?: string;
    }, opts?: {
        idempotencyKey?: string;
    }): Promise<unknown>;
    balance(merchantId: string, customerId: string): Promise<unknown>;
    transactions(params: {
        merchantId: string;
        customerId: string;
        limit?: number;
        before?: string;
        outletId?: string;
        staffId?: string;
    }): Promise<unknown>;
    teleauth(merchantId: string, initData: string, opts?: {
        create?: boolean;
    }): Promise<{
        merchantCustomerId: string | null;
        ok: boolean;
        customerId: string | null;
        hasPhone: boolean;
        onboarded: boolean;
        registered?: boolean;
    }>;
    mintQr(customerId: string, merchantId?: string, ttlSec?: number, initData?: string): Promise<unknown>;
    publicSettings(merchantId: string): Promise<unknown>;
    referrals: {
        readonly program: (args: {
            merchantId: string;
            name: string;
            description?: string;
            referrerReward: number;
            refereeReward: number;
            minPurchaseAmount?: number;
            maxReferrals?: number;
            expiryDays?: number;
            status?: "ACTIVE" | "PAUSED" | "COMPLETED";
            rewardTrigger?: "first" | "all";
            rewardType?: "FIXED" | "PERCENT";
            multiLevel?: boolean;
            levelRewards?: Array<{
                level: number;
                enabled?: boolean;
                reward?: number;
            }>;
            stackWithRegistration?: boolean;
            messageTemplate?: string;
            placeholders?: string[];
        }, opts?: {
            apiKey?: string;
        }) => Promise<unknown>;
        readonly activate: (args: {
            code: string;
            refereeId: string;
        }, opts?: {
            apiKey?: string;
        }) => Promise<unknown>;
        readonly complete: (args: {
            refereeId: string;
            merchantId: string;
            purchaseAmount: number;
        }, opts?: {
            apiKey?: string;
        }) => Promise<unknown>;
    };
}
