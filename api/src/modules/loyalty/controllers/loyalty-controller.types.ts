import type { Request } from 'express';
import type { LoyaltyService } from '../services/loyalty.service';

export type CommitOptions = NonNullable<
  Parameters<LoyaltyService['commit']>[4]
>;
export type CashierSessionInfo = {
  id?: string | null;
  merchantId?: string | null;
  outletId?: string | null;
  staffId?: string | null;
  deviceSessionId?: string | null;
};
export type CashierRequest = Request & { cashierSession?: CashierSessionInfo };
export type TeleauthRequest = Request & {
  teleauth?: { customerId?: string | null };
};
export type RequestWithRequestId = Request & { requestId?: string };
